import type {
  AddDropPayload,
  TradePayload,
  WaiverClaimPayload,
  WritePayload,
} from "../adapters/LeagueAdapter.js";
import type { ValueProvider } from "../value/ValueProvider.js";
import type { ProtectRule, RulesConfig } from "./schema.js";

/** The three write action kinds the engine understands. */
export type ActionKind = "trade" | "waiver_claim" | "add_drop";

/** The engine's decision on a proposed action. `warn` never blocks. */
export interface RuleVerdict {
  decision: "allow" | "block";
  blockedReasons: string[];
  warnings: string[];
}

/** Everything the engine needs beyond the action itself. */
export interface RuleContext {
  /** playerId -> display name, for name-based protect rules and messages. */
  names: Map<string, string>;
  value: ValueProvider;
}

/** A player leaving the user's roster, and how. */
interface OutgoingPlayer {
  id: string;
  via: "trade" | "drop";
}

/**
 * RulesEngine — evaluates every proposed write against the configured rules
 * (dec.rules-engine-and-value). Protect rules block; warn rules annotate. The
 * engine is pure: it reads the action + context and returns a verdict, with no
 * I/O of its own beyond the injected {@link ValueProvider}.
 */
export class RulesEngine {
  constructor(private readonly config: RulesConfig) {}

  /** Operating mode: "manual" (approve each) or "auto" (execute if unblocked). */
  get mode(): "manual" | "auto" {
    return this.config.mode;
  }

  async evaluate(kind: ActionKind, payload: WritePayload, ctx: RuleContext): Promise<RuleVerdict> {
    const blockedReasons: string[] = [];
    const warnings: string[] = [];

    for (const outgoing of this.outgoingPlayers(kind, payload)) {
      for (const rule of this.config.protect) {
        if (rule.actions.includes(outgoing.via) && this.protectMatches(rule, outgoing.id, ctx)) {
          const name = ctx.names.get(outgoing.id) ?? outgoing.id;
          const verb = outgoing.via === "trade" ? "traded away" : "dropped";
          blockedReasons.push(`protect rule: ${name} may not be ${verb}`);
        }
      }
    }

    for (const rule of this.config.warn) {
      if (rule.type === "trade_value_diff" && kind === "trade") {
        const w = await this.tradeValueWarning(payload as TradePayload, rule.thresholdPct, ctx);
        if (w) warnings.push(w);
      }
    }

    return {
      decision: blockedReasons.length > 0 ? "block" : "allow",
      blockedReasons,
      warnings,
    };
  }

  /** Players leaving the user's roster in this action. */
  private outgoingPlayers(kind: ActionKind, payload: WritePayload): OutgoingPlayer[] {
    if (kind === "trade") {
      return (payload as TradePayload).sendPlayerIds.map((id) => ({ id, via: "trade" }));
    }
    const p = payload as WaiverClaimPayload | AddDropPayload;
    return p.dropPlayerId ? [{ id: p.dropPlayerId, via: "drop" }] : [];
  }

  private protectMatches(rule: ProtectRule, playerId: string, ctx: RuleContext): boolean {
    if (rule.playerId && rule.playerId === playerId) return true;
    if (rule.playerName) {
      const name = ctx.names.get(playerId);
      if (name && name.toLowerCase() === rule.playerName.toLowerCase()) return true;
    }
    return false;
  }

  private async tradeValueWarning(
    trade: TradePayload,
    thresholdPct: number,
    ctx: RuleContext,
  ): Promise<string | null> {
    const sent = await this.sumValue(trade.sendPlayerIds, ctx.value);
    const received = await this.sumValue(trade.receivePlayerIds, ctx.value);
    const max = Math.max(sent, received);
    if (max === 0) return null;
    const diffPct = (Math.abs(sent - received) / max) * 100;
    if (diffPct < thresholdPct) return null;
    const dir = sent > received ? "you give up more value" : "you receive more value";
    return `trade value differential ~${diffPct.toFixed(0)}% (${dir}); warn threshold ${thresholdPct}%`;
  }

  private async sumValue(playerIds: string[], value: ValueProvider): Promise<number> {
    const values = await value.getValues(playerIds);
    return playerIds.reduce((sum, id) => sum + (values.get(id) ?? 0), 0);
  }
}
