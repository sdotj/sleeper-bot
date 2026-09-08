import type {
  AddDropPayload,
  TradePayload,
  WaiverClaimPayload,
  WriteResult,
} from "../LeagueAdapter.js";
import { NeedsReauthError, type SessionProvider } from "../../auth/SessionProvider.js";

/**
 * SleeperWriteClient — the write side of the Sleeper adapter.
 *
 * ⚠️  UNOFFICIAL. Sleeper has no public write API. Trades, waivers, and
 * add/drops go through Sleeper's private GraphQL endpoint at
 * https://sleeper.com/graphql, authenticated with a session JWT (from
 * {@link SessionProvider}) passed as the raw `authorization` header (no
 * `Bearer` prefix — that is the format Sleeper uses). The protocol below was
 * reverse-engineered by the community (cameron-eth/sleeper-sdk); it can break
 * without notice, and some networks/regions may need a VPN to reach the
 * endpoint. Errors arrive as HTTP 200 with an `errors` array; an `unauthorized`
 * code trips the fail-safe re-auth path (dec.sleeper-session-auth).
 */

export const SLEEPER_GRAPHQL_URL = "https://sleeper.com/graphql";

/** Minimal transport shape so tests can inject a fake instead of real fetch. */
export type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; text(): Promise<string> }>;

const defaultFetch: FetchFn = (url, init) =>
  fetch(url, init) as unknown as ReturnType<FetchFn>;

// --- pure payload -> GraphQL variable mappings (unit-tested directly) --------

/**
 * A trade in Sleeper's terms: `adds` = who GETS each player (player -> receiving
 * roster), `drops` = who SENDS each player (player -> sending roster), as
 * parallel key/value arrays. Our TradePayload is from the proposer's side:
 * sendPlayerIds leave `from` for `to`; receivePlayerIds come from `to` to `from`.
 */
export function tradeVariables(leagueId: string, p: TradePayload) {
  const k_adds: string[] = [];
  const v_adds: number[] = [];
  const k_drops: string[] = [];
  const v_drops: number[] = [];
  for (const pid of p.sendPlayerIds) {
    k_adds.push(pid);
    v_adds.push(p.toRosterId); // the other team receives it
    k_drops.push(pid);
    v_drops.push(p.fromRosterId); // you send it
  }
  for (const pid of p.receivePlayerIds) {
    k_adds.push(pid);
    v_adds.push(p.fromRosterId); // you receive it
    k_drops.push(pid);
    v_drops.push(p.toRosterId); // the other team sends it
  }
  return {
    league_id: leagueId,
    k_adds,
    v_adds,
    k_drops,
    v_drops,
    draft_picks: [] as string[],
    waiver_budget: [] as string[],
    expires_at: null as number | null,
  };
}

export function addDropVariables(leagueId: string, p: AddDropPayload) {
  return {
    league_id: leagueId,
    roster_id: p.rosterId,
    adds: p.addPlayerId ? { [p.addPlayerId]: p.rosterId } : {},
    drops: p.dropPlayerId ? { [p.dropPlayerId]: p.rosterId } : {},
  };
}

export function waiverVariables(leagueId: string, p: WaiverClaimPayload) {
  return {
    league_id: leagueId,
    roster_id: p.rosterId,
    adds: { [p.addPlayerId]: p.rosterId },
    drops: p.dropPlayerId ? { [p.dropPlayerId]: p.rosterId } : {},
    waiver_budget: p.faabBid ?? 0,
  };
}

const MUTATIONS = {
  propose_trade: `
    mutation propose_trade(
      $league_id: Snowflake!, $k_adds: [String], $v_adds: [Int],
      $k_drops: [String], $v_drops: [Int], $draft_picks: [String],
      $waiver_budget: [String], $expires_at: Int
    ) {
      propose_trade(
        league_id: $league_id, k_adds: $k_adds, v_adds: $v_adds,
        k_drops: $k_drops, v_drops: $v_drops, draft_picks: $draft_picks,
        waiver_budget: $waiver_budget, expires_at: $expires_at
      ) { transaction_id status type created }
    }`,
  create_free_agent: `
    mutation create_free_agent($league_id: Snowflake!, $roster_id: Int!, $adds: JSON, $drops: JSON) {
      create_free_agent(league_id: $league_id, roster_id: $roster_id, adds: $adds, drops: $drops) {
        transaction_id status type created adds drops
      }
    }`,
  create_waiver_claim: `
    mutation create_waiver_claim(
      $league_id: Snowflake!, $roster_id: Int!, $adds: JSON, $drops: JSON, $waiver_budget: Int
    ) {
      create_waiver_claim(
        league_id: $league_id, roster_id: $roster_id, adds: $adds, drops: $drops, waiver_budget: $waiver_budget
      ) { transaction_id status type created }
    }`,
} as const;

interface TxnResult {
  transaction_id?: string;
  status?: string;
}

export class SleeperWriteClient {
  constructor(
    private readonly leagueId: string,
    private readonly session: SessionProvider,
    private readonly fetchFn: FetchFn = defaultFetch,
  ) {}

  async executeTrade(payload: TradePayload): Promise<WriteResult> {
    const data = await this.gql("propose_trade", MUTATIONS.propose_trade, tradeVariables(this.leagueId, payload));
    return this.toResult("propose_trade", data);
  }

  async executeWaiverClaim(payload: WaiverClaimPayload): Promise<WriteResult> {
    const data = await this.gql("create_waiver_claim", MUTATIONS.create_waiver_claim, waiverVariables(this.leagueId, payload));
    return this.toResult("create_waiver_claim", data);
  }

  async executeAddDrop(payload: AddDropPayload): Promise<WriteResult> {
    if (!payload.addPlayerId && !payload.dropPlayerId) {
      throw new Error("add/drop needs at least one of addPlayerId or dropPlayerId");
    }
    const data = await this.gql("create_free_agent", MUTATIONS.create_free_agent, addDropVariables(this.leagueId, payload));
    return this.toResult("create_free_agent", data);
  }

  private toResult(op: string, data: Record<string, unknown>): WriteResult {
    const txn = data[op] as TxnResult | null | undefined;
    // A successful mutation echoes back a transaction_id. No error AND no
    // transaction means the write silently did not land — report it as a
    // failure rather than a false `ok: true` (audit #8). The pipeline turns a
    // non-ok result into an audited failure and keeps the action re-tryable.
    if (!txn || typeof txn !== "object" || !txn.transaction_id) {
      return {
        ok: false,
        message: `${op} returned no transaction — the write did not go through.`,
      };
    }
    return {
      ok: true,
      platformRef: txn.transaction_id,
      message: `${op} submitted (status: ${txn.status ?? "unknown"})`,
    };
  }

  /** Send one GraphQL operation; map Sleeper's error shapes onto our errors. */
  private async gql(
    opName: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const token = await this.session.getToken(); // throws NeedsReauthError if no session
    const res = await this.fetchFn(SLEEPER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        authorization: token,
        "content-type": "application/json",
        accept: "application/json",
        origin: "https://sleeper.com",
        referer: "https://sleeper.com/",
        "x-sleeper-graphql-op": opName,
        "user-agent": "sleepbot/0.1",
      },
      body: JSON.stringify({ operationName: opName, query, variables }),
    });

    const text = await res.text();
    let body: { data?: Record<string, unknown>; errors?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Sleeper GraphQL returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    const errors = normalizeErrors(body.errors);
    if (errors.length > 0) {
      if (errors.some(isAuthError)) {
        await this.session.markInvalid();
        throw new NeedsReauthError(
          "Sleeper rejected the token (invalid/expired). Writes paused; supply a fresh SLEEPER_TOKEN.",
        );
      }
      throw new Error(`Sleeper GraphQL error: ${errors.map((e) => e.message).join("; ")}`);
    }
    // Even without an `errors` array, a non-2xx HTTP status means the write did
    // not succeed — don't fall through to a false success (audit #8).
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Sleeper GraphQL HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return body.data ?? {};
  }
}

/**
 * Whether a GraphQL error means "your credential is bad" — so we fail safe to
 * needs-reauth. Sleeper signals this via a `code: "unauthorized"` OR, as the
 * live endpoint actually returns for an expired token, a bare message like
 * "Your token is invalid." with no code — hence the message check too.
 */
function isAuthError(e: { message: string; code?: string }): boolean {
  return e.code === "unauthorized" || /token .*(invalid|expired)|unauthor/i.test(e.message);
}

/** Sleeper returns errors as a list of dicts, a single dict, or list of strings. */
function normalizeErrors(errs: unknown): { message: string; code?: string }[] {
  if (!errs) return [];
  const arr = Array.isArray(errs) ? errs : [errs];
  return arr.map((e) => {
    if (e && typeof e === "object") {
      const o = e as Record<string, unknown>;
      return { message: String(o.message ?? JSON.stringify(o)), code: o.code as string | undefined };
    }
    return { message: String(e) };
  });
}
