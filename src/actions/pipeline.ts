import { randomUUID } from "node:crypto";
import type {
  AddDropPayload,
  TradePayload,
  WaiverClaimPayload,
  WriteableLeagueAdapter,
  WritePayload,
  WriteResult,
} from "../adapters/LeagueAdapter.js";
import type { AuditLog } from "../audit/auditLog.js";
import type { ValueProvider } from "../value/ValueProvider.js";
import { RulesEngine, type ActionKind, type RuleContext, type RuleVerdict } from "../rules/index.js";
import type { ProposedAction } from "./ProposedAction.js";
import type { PendingStore } from "./pendingStore.js";
import { validateWritePayload } from "./writeSchemas.js";

export interface PipelineDeps {
  rules: RulesEngine;
  audit: AuditLog;
  pending: PendingStore;
  /** The value provider for a league (its dynasty/redraft mode is per-league). */
  valueFor(leagueId: string): ValueProvider;
  adapterFor(leagueId: string): WriteableLeagueAdapter;
}

/**
 * ActionPipeline — the single confirm-by-default path for every write
 * (dec.write-action-pipeline). Nothing here sends silently: `propose` evaluates
 * rules, records to audit, and stores a pending draft; `execute` re-validates
 * and only then performs the write. In `auto` mode an unblocked proposal is
 * executed immediately (still audited); otherwise it waits for `execute`.
 */
export class ActionPipeline {
  /**
   * Action ids currently being executed in THIS process. A stored pending
   * action must dispatch at most once: two concurrent `execute` calls (a
   * double-click, a webhook retry) would otherwise both read `status ==
   * "pending"` and both send before either removes it (audit #4). The guard is
   * per-process — the JSON store is single-instance and Postgres deploys run
   * one writer — so an in-memory lock is sufficient.
   */
  private readonly inFlight = new Set<string>();

  constructor(private readonly deps: PipelineDeps) {}

  async propose(leagueId: string, kind: ActionKind, rawPayload: WritePayload): Promise<ProposedAction> {
    // Validate the (cast, untrusted) payload at the domain boundary before it
    // reaches rules or the platform — the single chokepoint for every transport
    // (audit #10).
    const payload = validateWritePayload(kind, rawPayload);
    const adapter = this.deps.adapterFor(leagueId);
    const verdict = await this.deps.rules.evaluate(
      kind,
      payload,
      await this.ruleContext(leagueId, adapter, kind, payload),
    );

    const action: ProposedAction = {
      id: randomUUID(),
      leagueId,
      kind,
      payload,
      status: verdict.decision === "block" ? "rejected" : "pending",
      verdict,
      createdMs: Date.now(),
    };

    if (verdict.decision === "block") {
      await this.deps.audit.record({
        actionId: action.id,
        leagueId,
        type: "rejected",
        actor: "rule",
        summary: `${kind} blocked: ${verdict.blockedReasons.join("; ")}`,
        detail: verdict,
      });
      return action; // not stored; caller sees the block reasons
    }

    await this.deps.audit.record({
      actionId: action.id,
      leagueId,
      type: "proposed",
      actor: "user",
      summary:
        `${kind} proposed` +
        (verdict.warnings.length ? ` (warnings: ${verdict.warnings.join("; ")})` : ""),
      detail: action,
    });
    await this.deps.pending.put(action);

    // Auto mode: it passed every block rule, so execute now (still audited).
    if (this.deps.rules.mode === "auto") {
      return this.execute(action.id, "auto");
    }
    return action;
  }

  async execute(actionId: string, actor: "user" | "auto" = "user"): Promise<ProposedAction> {
    // Claim the action for this process before doing anything, so a second
    // concurrent execute can't race through the pending-status check (audit #4).
    if (this.inFlight.has(actionId)) {
      throw new Error(`action ${actionId} is already executing`);
    }
    this.inFlight.add(actionId);
    try {
      const action = await this.deps.pending.get(actionId);
      if (!action || action.status !== "pending") {
        throw new Error(`no pending action with id ${actionId}`);
      }
      const adapter = this.deps.adapterFor(action.leagueId);

      // Re-validate at execution time — rules or rosters may have changed.
      const verdict = await this.deps.rules.evaluate(
        action.kind,
        action.payload,
        await this.ruleContext(action.leagueId, adapter, action.kind, action.payload),
      );
      if (verdict.decision === "block") {
        action.status = "rejected";
        action.verdict = verdict;
        await this.deps.audit.record({
          actionId,
          leagueId: action.leagueId,
          type: "rejected",
          actor: "rule",
          summary: `${action.kind} blocked at execution: ${verdict.blockedReasons.join("; ")}`,
          detail: verdict,
        });
        await this.deps.pending.remove(actionId);
        throw new Error(`action ${actionId} is now blocked: ${verdict.blockedReasons.join("; ")}`);
      }

      try {
        const result = await this.dispatch(adapter, action);
        // A non-ok WriteResult means the platform did not accept the write —
        // don't mark it executed or remove the draft (audit #8). Routed through
        // the catch below so it's audited as a failure and stays re-tryable.
        if (!result.ok) {
          throw new Error(result.message || `${action.kind} was not accepted by the platform`);
        }
        action.status = "executed";
        action.result = { platformRef: result.platformRef, message: result.message };
        await this.deps.audit.record({
          actionId,
          leagueId: action.leagueId,
          type: "executed",
          actor,
          summary: `${action.kind} executed: ${result.message}`,
          detail: result,
        });
        await this.deps.pending.remove(actionId);
        return action;
      } catch (err) {
        await this.deps.audit.record({
          actionId,
          leagueId: action.leagueId,
          type: "failed",
          actor,
          summary: `${action.kind} failed: ${(err as Error).message}`,
          detail: { error: (err as Error).message },
        });
        throw err;
      }
    } finally {
      this.inFlight.delete(actionId);
    }
  }

  listPending(leagueId?: string): Promise<ProposedAction[]> {
    return this.deps.pending.list(leagueId);
  }

  /** Evaluate an action against the rules without storing/executing it (agent use). */
  async evaluate(leagueId: string, kind: ActionKind, payload: WritePayload): Promise<RuleVerdict> {
    const adapter = this.deps.adapterFor(leagueId);
    return this.deps.rules.evaluate(kind, payload, await this.ruleContext(leagueId, adapter, kind, payload));
  }

  /**
   * Execute a write directly from its payload (no stored pending id) — used by
   * the autonomous agent and Telegram taps. Re-validates rules unless `override`
   * is set (an explicit human override of a block), then dispatches and audits.
   */
  async perform(
    leagueId: string,
    kind: ActionKind,
    rawPayload: WritePayload,
    actor: "user" | "auto",
    opts: { override?: boolean } = {},
  ): Promise<ProposedAction> {
    const payload = validateWritePayload(kind, rawPayload); // boundary validation (audit #10)
    const adapter = this.deps.adapterFor(leagueId);
    const verdict: RuleVerdict = opts.override
      ? { decision: "allow", blockedReasons: [], warnings: ["rule override"] }
      : await this.deps.rules.evaluate(kind, payload, await this.ruleContext(leagueId, adapter, kind, payload));

    const action: ProposedAction = {
      id: randomUUID(),
      leagueId,
      kind,
      payload,
      status: verdict.decision === "block" ? "rejected" : "pending",
      verdict,
      createdMs: Date.now(),
    };

    if (verdict.decision === "block") {
      await this.deps.audit.record({
        actionId: action.id,
        leagueId,
        type: "rejected",
        actor: "rule",
        summary: `${kind} blocked: ${verdict.blockedReasons.join("; ")}`,
        detail: verdict,
      });
      return action;
    }

    try {
      const result = await this.dispatch(adapter, action);
      // Guard against a false success from the adapter (audit #8).
      if (!result.ok) {
        throw new Error(result.message || `${kind} was not accepted by the platform`);
      }
      action.status = "executed";
      action.result = { platformRef: result.platformRef, message: result.message };
      await this.deps.audit.record({
        actionId: action.id,
        leagueId,
        type: "executed",
        actor,
        summary: `${kind} executed${opts.override ? " (override)" : ""}: ${result.message}`,
        detail: result,
      });
      return action;
    } catch (err) {
      await this.deps.audit.record({
        actionId: action.id,
        leagueId,
        type: "failed",
        actor,
        summary: `${kind} failed: ${(err as Error).message}`,
        detail: { error: (err as Error).message },
      });
      throw err;
    }
  }

  private dispatch(adapter: WriteableLeagueAdapter, action: ProposedAction): Promise<WriteResult> {
    switch (action.kind) {
      case "trade":
        return adapter.executeTrade(action.payload as TradePayload);
      case "waiver_claim":
        return adapter.executeWaiverClaim(action.payload as WaiverClaimPayload);
      case "add_drop":
        return adapter.executeAddDrop(action.payload as AddDropPayload);
    }
  }

  private async ruleContext(
    leagueId: string,
    adapter: WriteableLeagueAdapter,
    kind: ActionKind,
    payload: WritePayload,
  ): Promise<RuleContext> {
    const ids = this.playersInvolved(kind, payload);
    const refs = ids.length ? await adapter.resolvePlayers(ids) : [];
    return { names: new Map(refs.map((r) => [r.playerId, r.name])), value: this.deps.valueFor(leagueId) };
  }

  private playersInvolved(kind: ActionKind, payload: WritePayload): string[] {
    if (kind === "trade") {
      const t = payload as TradePayload;
      return [...t.sendPlayerIds, ...t.receivePlayerIds];
    }
    const p = payload as WaiverClaimPayload | AddDropPayload;
    return [p.addPlayerId, p.dropPlayerId].filter((id): id is string => Boolean(id));
  }
}
