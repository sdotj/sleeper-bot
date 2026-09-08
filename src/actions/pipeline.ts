import { randomUUID } from "node:crypto";
import type {
  AddDropPayload,
  Platform,
  TradePayload,
  WaiverClaimPayload,
  WriteableLeagueAdapter,
  WritePayload,
  WriteResult,
} from "../adapters/LeagueAdapter.js";
import type { AuditLog } from "../audit/auditLog.js";
import type { ValueProvider } from "../value/ValueProvider.js";
import { RulesEngine, type ActionKind, type RuleContext, type RuleVerdict } from "../rules/index.js";
import type { ActionIdentity, ProposedAction } from "./ProposedAction.js";
import type { PendingStore } from "./pendingStore.js";
import { validateWritePayload } from "./writeSchemas.js";
import { checkPreconditions } from "./preconditions.js";

export interface PipelineDeps {
  rules: RulesEngine;
  audit: AuditLog;
  pending: PendingStore;
  /** The value provider for a league (its dynasty/redraft mode is per-league). */
  valueFor(leagueId: string): ValueProvider;
  adapterFor(leagueId: string): WriteableLeagueAdapter;
  /**
   * The IMMUTABLE platform identity a league label currently maps to. Execution
   * compares this against what a proposal was approved against, so remapping a
   * label can't redirect an old approval to a new target (audit #5).
   */
  leagueIdentity(leagueId: string): { platform: Platform; platformLeagueId: string };
  /**
   * Re-read config + credentials if another instance changed them. Called at the
   * top of every write path so MCP/Telegram/chat/HTTP all pick up changes, not
   * just the ops facade (audit #14). Best-effort on propose; fail-closed on
   * execute/perform.
   */
  refresh(): Promise<void>;
  /** The current config revision, stamped onto proposals (audit #5/#7). */
  configVersion(): number;
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
    // Pick up another instance's config/token changes before drafting (audit
    // #14). Best-effort: drafting dispatches nothing, so stale config is safe.
    await this.deps.refresh().catch(() => {});
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
      identity: this.identityOf(leagueId, kind, payload),
      configVersion: this.deps.configVersion(),
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

    // Proposal creation NEVER dispatches — it only ever produces a DRAFT (audit
    // #1). Global `auto` mode is honored by the autonomous agent's own perform()
    // path, not here, so a chat/HTTP/MCP proposal can never silently send.
    return action;
  }

  async execute(actionId: string, actor: "user" | "auto" = "user"): Promise<ProposedAction> {
    // Claim the action for this process before doing anything, so a second
    // concurrent execute can't race through the status check (audit #4).
    if (this.inFlight.has(actionId)) {
      throw new Error(`action ${actionId} is already executing`);
    }
    this.inFlight.add(actionId);
    try {
      // Fail CLOSED on refresh error: never execute a write against config we
      // couldn't confirm is current (audit #4/#14).
      await this.deps.refresh();

      const action = await this.deps.pending.get(actionId);
      if (!action) throw new Error(`no action with id ${actionId}`);
      // Only a pending action may execute. executing/executed/failed/rejected all
      // refuse — a durable "executing"/"executed" is the guard against resending
      // after a post-send storage failure (audit #3).
      if (action.status !== "pending") {
        throw new Error(`action ${actionId} is not pending (status: ${action.status}) — refusing to (re)send`);
      }

      // Target-binding check: the config label must still resolve to the SAME
      // platform + league it was approved against (audit #5).
      const current = this.deps.leagueIdentity(action.leagueId);
      if (current.platform !== action.identity.platform || current.platformLeagueId !== action.identity.platformLeagueId) {
        action.status = "rejected";
        await this.deps.pending.put(action);
        await this.deps.audit.record({
          actionId,
          leagueId: action.leagueId,
          type: "rejected",
          actor: "rule",
          summary: `${action.kind} target changed since approval (label "${action.leagueId}" now maps elsewhere) — re-propose`,
          detail: { approved: action.identity, current },
        });
        throw new Error(
          `action ${actionId} target changed since it was approved — re-propose it against the current league`,
        );
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
        await this.deps.pending.put(action);
        throw new Error(`action ${actionId} is now blocked: ${verdict.blockedReasons.join("; ")}`);
      }

      // Execution preconditions: re-fetch the CURRENT rosters and confirm the
      // action is still valid against them (ownership/availability). The rules
      // engine doesn't do this — an approved action can go stale.
      const pre = checkPreconditions(action.kind, action.payload, await adapter.getRosters());
      if (!pre.ok) {
        action.status = "rejected";
        await this.deps.audit.record({
          actionId,
          leagueId: action.leagueId,
          type: "rejected",
          actor: "rule",
          summary: `${action.kind} failed a precondition at execution: ${pre.reasons.join("; ")}`,
          detail: { reasons: pre.reasons },
        });
        await this.deps.pending.put(action);
        throw new Error(`action ${actionId} can't be sent: ${pre.reasons.join("; ")}`);
      }

      // DURABLE CLAIM before dispatch (audit #3): persist "executing" + a stable
      // execution id. If the process dies (or a later write fails) after the
      // platform accepts, the record is no longer "pending", so a retry refuses
      // to resend instead of double-sending.
      action.status = "executing";
      action.executionId = randomUUID();
      await this.deps.pending.put(action);

      let result: WriteResult;
      try {
        result = await this.dispatch(adapter, action);
      } catch (err) {
        // An error while dispatching is AMBIGUOUS — the send may have reached
        // the platform. Mark "failed" (not pending) so it isn't auto-resent; the
        // user reconciles and re-proposes if needed (audit #3).
        action.status = "failed";
        await this.deps.pending.put(action);
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

      if (!result.ok) {
        // A clean platform rejection means it definitely did NOT land — safe to
        // revert to pending so the user can retry (audit #8).
        action.status = "pending";
        action.executionId = undefined;
        await this.deps.pending.put(action);
        await this.deps.audit.record({
          actionId,
          leagueId: action.leagueId,
          type: "failed",
          actor,
          summary: `${action.kind} not accepted by the platform: ${result.message}`,
          detail: result,
        });
        throw new Error(result.message || `${action.kind} was not accepted by the platform`);
      }

      action.status = "executed";
      action.result = { platformRef: result.platformRef, message: result.message };
      await this.deps.pending.put(action); // KEEP (durable executed), don't delete
      await this.deps.audit.record({
        actionId,
        leagueId: action.leagueId,
        type: "executed",
        actor,
        summary: `${action.kind} executed: ${result.message}`,
        detail: result,
      });
      return action;
    } finally {
      this.inFlight.delete(actionId);
    }
  }

  listPending(leagueId?: string): Promise<ProposedAction[]> {
    return this.deps.pending.list(leagueId);
  }

  /** Cancel a pending draft (user declined it in the GUI). Idempotent-ish. */
  async cancel(actionId: string): Promise<ProposedAction> {
    const action = await this.deps.pending.get(actionId);
    if (!action) throw new Error(`no action with id ${actionId}`);
    if (action.status !== "pending") {
      throw new Error(`action ${actionId} is not pending (status: ${action.status}) — nothing to cancel`);
    }
    action.status = "rejected";
    await this.deps.pending.put(action);
    await this.deps.audit.record({
      actionId,
      leagueId: action.leagueId,
      type: "rejected",
      actor: "user",
      summary: `${action.kind} cancelled by the user`,
      detail: { cancelled: true },
    });
    return action;
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
    await this.deps.refresh(); // fail closed: never auto-write against unconfirmed config (audit #4/#14)
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
      identity: this.identityOf(leagueId, kind, payload),
      configVersion: this.deps.configVersion(),
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

    // Execution preconditions against the CURRENT rosters (see execute()).
    const pre = checkPreconditions(kind, payload, await adapter.getRosters());
    if (!pre.ok) {
      action.status = "rejected";
      await this.deps.audit.record({
        actionId: action.id,
        leagueId,
        type: "rejected",
        actor: "rule",
        summary: `${kind} failed a precondition: ${pre.reasons.join("; ")}`,
        detail: { reasons: pre.reasons },
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

  /** Snapshot the immutable target an action is bound to (audit #5). */
  private identityOf(leagueId: string, kind: ActionKind, payload: WritePayload): ActionIdentity {
    const { platform, platformLeagueId } = this.deps.leagueIdentity(leagueId);
    return { platform, platformLeagueId, actorRosterId: this.actorRosterId(kind, payload) };
  }

  /** The roster a write acts on (the trade proposer, or the claiming roster). */
  private actorRosterId(kind: ActionKind, payload: WritePayload): number {
    if (kind === "trade") return (payload as TradePayload).fromRosterId;
    return (payload as WaiverClaimPayload | AddDropPayload).rosterId;
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
