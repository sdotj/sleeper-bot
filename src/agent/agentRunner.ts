import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { AddDropPayload, TradePayload, WaiverClaimPayload } from "../adapters/LeagueAdapter.js";
import type { AppContext, SleepBotOperations } from "../core/index.js";
import type { Notifier } from "../notify/index.js";
import type { ActionKind } from "../rules/index.js";
import { AGENT_TOOLS, dispatchAgentTool, type Recommendation } from "./agentTools.js";

export type Autonomy = "manual" | "auto";

/** What routing one recommendation resulted in (audit #9). */
export type RouteOutcome = "executed" | "proposed" | "rejected" | "failed";

/** Per-league sweep tally with each outcome counted separately (audit #9/#17). */
export interface SweepOutcome {
  recommended: number;
  /** Auto-executed writes that the platform accepted. */
  executed: number;
  /** Recommendations sent to Telegram awaiting a tap. */
  proposed: number;
  /** Blocked at auto re-evaluation (not sent, not an error). */
  rejected: number;
  /** Errored while auto-executing or routing. */
  failed: number;
  /** executed + proposed — successfully handled, for back-compat callers. */
  routed: number;
  skipped?: string;
}

function emptyTally(): SweepOutcome {
  return { recommended: 0, executed: 0, proposed: 0, rejected: 0, failed: 0, routed: 0 };
}

export interface AgentDeps {
  ctx: AppContext;
  ops: SleepBotOperations;
  notifier: Notifier;
  model?: string;
  /** Override the reasoning step (tests inject canned recommendations). */
  gather?: (leagueId: string, rosterId: number) => Promise<Recommendation[]>;
}

/**
 * AgentRunner — one sweep of a league: reason with Claude to gather move
 * recommendations, then route each through the existing pipeline + the 3-way
 * autonomy policy (dec.autonomous-agent). It never executes a write except the
 * `auto` clean path; everything else goes to Telegram for a tap.
 */
export class AgentRunner {
  constructor(private readonly deps: AgentDeps) {}

  async sweepLeague(leagueId: string, _autonomyIgnored?: Autonomy): Promise<SweepOutcome> {
    // Fail CLOSED on refresh error: never sweep on a policy we couldn't confirm
    // is current (audit #4).
    try {
      await this.deps.ctx.refresh();
    } catch (err) {
      return { ...emptyTally(), skipped: `config refresh failed (failing closed): ${(err as Error).message}` };
    }

    // Read enabled + autonomy FRESH after the refresh — not from a value captured
    // before it — so a disable/downgrade during the sweep is honored (audit #4).
    const entry = this.deps.ctx.config.get(leagueId);
    if (!entry.agent?.enabled) {
      return { ...emptyTally(), skipped: "agent disabled for this league" };
    }

    const myRoster = await this.deps.ops.getMyRoster(leagueId);
    if (!myRoster) {
      return { ...emptyTally(), skipped: "no roster resolved (set sleeper.username)" };
    }
    const gather = this.deps.gather ?? ((lid, rid) => this.gather(lid, rid));
    const recs = await gather(leagueId, myRoster.rosterId);

    // Aggregate typed outcomes separately (audit #9/#17) — never count a caught
    // failure as a delivered/executed action.
    const tally = emptyTally();
    tally.recommended = recs.length;
    for (const rec of recs) {
      let outcome: RouteOutcome;
      try {
        outcome = await this.route(leagueId, rec);
      } catch (err) {
        outcome = "failed";
        console.error(`[agent] routing a ${rec.kind} in ${leagueId} failed: ${(err as Error).message}`);
      }
      tally[outcome]++;
    }
    tally.routed = tally.executed + tally.proposed;
    return tally;
  }

  // --- reasoning: Claude tool loop that captures recommendations --------------

  private async gather(leagueId: string, rosterId: number): Promise<Recommendation[]> {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for the agent");
    const client = new Anthropic();
    const model = this.deps.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
    const recs: Recommendation[] = [];

    const tools: Anthropic.MessageCreateParams["tools"] = [...AGENT_TOOLS];
    if ((process.env.SLEEPBOT_WEB_SEARCH ?? "on") !== "off") {
      tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 4 });
    }

    const system = `You are SleepBot's autonomous manager for one fantasy team (league "${leagueId}", your roster id is ${rosterId}).
Review the roster, standings, matchups, recent transactions, and waiver/trending players. Use web_search for injuries and breaking news.
Then call recommend_action for each move that CLEARLY improves the team — waiver claims, free-agent add/drops, or trade proposals. Guidelines:
- Be conservative: only recommend clearly beneficial moves. Recommending nothing is a fine outcome.
- For add_drop / waiver_claim use rosterId ${rosterId}. Resolve player names to ids with search_players / get_rosters.
- Trades are proposals to another manager; make them fair and explain the win-win in the rationale.
- You do NOT execute anything. Each recommendation is run through the user's rules and sent for approval.
Keep going until you've made your recommendations (or decided on none), then stop.`;

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "Review my team and recommend any beneficial moves now." },
    ];

    for (let i = 0; i < 16; i++) {
      const res = await client.messages.create({ model, max_tokens: 4096, system, tools, messages });
      messages.push({ role: "assistant", content: res.content });
      if (res.stop_reason === "pause_turn") continue;
      if (res.stop_reason !== "tool_use") break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type === "tool_use") {
          try {
            const out = await dispatchAgentTool(this.deps.ops, leagueId, block.name, block.input, recs);
            results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out ?? null) });
          } catch (err) {
            results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: `Error: ${(err as Error).message}` });
          }
        }
      }
      if (results.length === 0) break;
      messages.push({ role: "user", content: results });
    }
    return recs;
  }

  // --- routing: rules verdict -> auto / approve / override --------------------

  private async route(leagueId: string, rec: Recommendation): Promise<RouteOutcome> {
    // Re-confirm the policy IMMEDIATELY before any automated write (audit #4):
    // the reasoning phase is long and config may have changed. Fail closed —
    // a refresh error downgrades this write to a manual approval.
    let policyFresh = true;
    try {
      await this.deps.ctx.refresh();
    } catch {
      policyFresh = false;
    }
    const entry = this.deps.ctx.config.get(leagueId);
    const autoAllowed =
      policyFresh && !!entry.agent?.enabled && (entry.agent?.autonomy ?? "manual") === "auto";

    const verdict = await this.deps.ctx.pipeline.evaluate(leagueId, rec.kind, rec.payload);
    const id = randomUUID();
    const summary = await this.summarize(leagueId, rec);

    await this.deps.ctx.audit.record({
      actionId: id,
      leagueId,
      type: "proposed",
      actor: "auto",
      summary: `${summary} — ${rec.rationale}`,
      detail: { recommendation: rec, verdict },
    });

    if (verdict.decision === "block") {
      await this.deps.notifier.propose(
        { id, leagueId, kind: rec.kind, payload: rec.payload, summary, warnings: verdict.warnings, blockedReasons: verdict.blockedReasons },
        "override",
      );
      return "proposed";
    }

    const clean = verdict.warnings.length === 0;
    if (autoAllowed && clean) {
      let a: Awaited<ReturnType<typeof this.deps.ctx.pipeline.perform>>;
      try {
        a = await this.deps.ctx.pipeline.perform(leagueId, rec.kind, rec.payload, "auto", { override: false });
      } catch (err) {
        await this.deps.notifier.info(`⚠️ Wanted to auto-execute “${summary}” but it failed: ${(err as Error).message}`);
        return "failed";
      }
      // Only claim success when the write actually executed — perform can return
      // a non-executed action (e.g. blocked at its own re-evaluation) (audit #9).
      if (a.status === "executed") {
        await this.deps.notifier.info(`✅ Auto-executed: ${summary}${a.result?.message ? ` — ${a.result.message}` : ""}`);
        return "executed";
      }
      await this.deps.notifier.info(`⚠️ Auto-execute of “${summary}” did not go through (status: ${a.status}).`);
      return a.status === "rejected" ? "rejected" : "failed";
    }

    // warned, manual, disabled, or refresh-failed → require a Telegram approval
    await this.deps.notifier.propose(
      { id, leagueId, kind: rec.kind, payload: rec.payload, summary, warnings: verdict.warnings, blockedReasons: [] },
      "approve",
    );
    return "proposed";
  }

  /** Human-readable one-liner with player names for the alert + audit. */
  private async summarize(leagueId: string, rec: Recommendation): Promise<string> {
    const adapter = this.deps.ctx.adapterFor(leagueId);
    const ids = this.idsOf(rec);
    const refs = ids.length ? await adapter.resolvePlayers(ids) : [];
    const name = (id?: string) => (id ? refs.find((r) => r.playerId === id)?.name ?? id : undefined);

    if (rec.kind === "trade") {
      const p = rec.payload as TradePayload;
      const send = p.sendPlayerIds.map(name).join(", ") || "—";
      const recv = p.receivePlayerIds.map(name).join(", ") || "—";
      return `Trade with roster ${p.toRosterId}: send ${send}, get ${recv}`;
    }
    if (rec.kind === "waiver_claim") {
      const p = rec.payload as WaiverClaimPayload;
      const drop = p.dropPlayerId ? `, drop ${name(p.dropPlayerId)}` : "";
      const bid = p.faabBid != null ? ` ($${p.faabBid})` : "";
      return `Waiver: add ${name(p.addPlayerId)}${bid}${drop}`;
    }
    const p = rec.payload as AddDropPayload;
    const drop = p.dropPlayerId ? `, drop ${name(p.dropPlayerId)}` : "";
    return `Add ${name(p.addPlayerId)}${drop}`;
  }

  private idsOf(rec: Recommendation): string[] {
    if (rec.kind === "trade") {
      const p = rec.payload as TradePayload;
      return [...p.sendPlayerIds, ...p.receivePlayerIds];
    }
    const p = rec.payload as WaiverClaimPayload | AddDropPayload;
    return [p.addPlayerId, p.dropPlayerId].filter((x): x is string => Boolean(x));
  }
}
