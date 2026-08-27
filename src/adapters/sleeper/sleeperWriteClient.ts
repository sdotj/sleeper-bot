import type {
  AddDropPayload,
  TradePayload,
  WaiverClaimPayload,
  WriteResult,
} from "../LeagueAdapter.js";
import type { SessionProvider } from "../../auth/SessionProvider.js";

/**
 * SleeperWriteClient — the write side of the Sleeper adapter.
 *
 * ⚠️  UNOFFICIAL. Sleeper has no public write API. Trades, waivers, and
 * add/drops go through Sleeper's private app API, which requires a session
 * token (obtained from {@link SessionProvider}) and is reverse-engineered — it
 * can break without notice (dec.sleeper-session-auth).
 *
 * Each method first obtains a token (throwing NeedsReauthError via the session
 * provider if none is available). The actual private-endpoint calls are not yet
 * wired: proposals, rules, and audit are fully functional today, but performing
 * a real write is a deliberate follow-up that needs a captured session and the
 * private endpoint integration. On a 401 the caller invokes
 * `session.markInvalid()` to trigger refresh-or-fail-safe.
 */
export class SleeperWriteClient {
  constructor(
    private readonly leagueId: string,
    private readonly session: SessionProvider,
  ) {}

  executeTrade(payload: TradePayload): Promise<WriteResult> {
    return this.notYetWired("trade", payload);
  }

  executeWaiverClaim(payload: WaiverClaimPayload): Promise<WriteResult> {
    return this.notYetWired("waiver claim", payload);
  }

  executeAddDrop(payload: AddDropPayload): Promise<WriteResult> {
    return this.notYetWired("add/drop", payload);
  }

  /**
   * Shared path: require a session, then report that the private endpoint isn't
   * wired yet. Kept in one place so wiring real writes later is a single change.
   */
  private async notYetWired(kind: string, _payload: unknown): Promise<WriteResult> {
    // Throws NeedsReauthError when no session is configured — the honest state
    // for a fresh install with no captured token.
    await this.session.getToken();
    throw new Error(
      `Executing a real Sleeper ${kind} is not yet wired to Sleeper's private ` +
        `API (Phase 2 follow-up). The proposal was validated, recorded, and stored; ` +
        `only the final send is pending endpoint integration for league ${this.leagueId}.`,
    );
  }
}
