import {
  NeedsReauthError,
  type AuthState,
  type SessionProvider,
  type SessionStatus,
} from "./SessionProvider.js";
import { inspectToken, isExpired, type TokenInfo } from "./token.js";

export interface SleeperSessionOptions {
  /** Session JWT captured from a logged-in Sleeper session (env:SLEEPER_TOKEN). */
  token?: string;
  /**
   * Fail-safe notifier invoked when the session becomes unusable. Wired to the
   * Phase-3 UI / push later; defaults to stderr.
   */
  notify?: (message: string) => void;
}

const CAPTURE_HINT =
  "Capture a fresh token from a logged-in Sleeper session (DevTools → Network → " +
  "any graphql request → copy the 'authorization' header value) and set SLEEPER_TOKEN.";

/**
 * SleeperSessionProvider — session handling for Sleeper's UNOFFICIAL private
 * write API (protocol per cameron-eth/sleeper-sdk).
 *
 * ⚠️  Sleeper has no official write API. Trades/waivers/adds go through the
 * private GraphQL endpoint, which needs a session JWT captured from a logged-in
 * session. This is reverse-engineered and may break without notice.
 *
 * Per dec.sleeper-session-auth we NEVER log in with a password. The token is a
 * JWT, so we read its `exp` up front and flag `needs-reauth` before even trying
 * a doomed write. Sleeper exposes no refresh endpoint, so recovery is a manual
 * re-capture: on failure we pause writes, keep reads working, and notify.
 */
export class SleeperSessionProvider implements SessionProvider {
  private token?: string;
  private tokenInfo?: TokenInfo;
  private invalidated = false;
  private readonly notify: (message: string) => void;

  constructor(opts: SleeperSessionOptions = {}) {
    this.notify = opts.notify ?? ((m) => console.error(`[auth] ${m}`));
    this.token = opts.token;
    if (!this.token) return; // state computes to needs-reauth
    try {
      this.tokenInfo = inspectToken(this.token);
    } catch {
      this.token = undefined;
      this.notify(`Sleeper token is not a valid JWT. ${CAPTURE_HINT}`);
      return;
    }
    if (isExpired(this.tokenInfo)) {
      this.notify(`Sleeper token is expired. ${CAPTURE_HINT}`);
    }
  }

  get state(): AuthState {
    if (this.invalidated || !this.token || !this.tokenInfo) return "needs-reauth";
    return isExpired(this.tokenInfo) ? "needs-reauth" : "ok";
  }

  async getToken(): Promise<string> {
    if (this.state === "needs-reauth" || !this.token) {
      throw new NeedsReauthError(`Sleeper write session unavailable. ${CAPTURE_HINT}`);
    }
    return this.token;
  }

  async markInvalid(): Promise<void> {
    // No refresh endpoint exists for Sleeper's private API — a JWT is
    // re-captured manually — so we fail safe rather than attempt a login.
    this.invalidated = true;
    this.notify(
      `Sleeper session was rejected (unauthorized or expired). Writes are paused; ` +
        `reads are unaffected. ${CAPTURE_HINT}`,
    );
  }

  status(): SessionStatus {
    const expiresAt = this.tokenInfo?.expiresAt;
    return {
      state: this.state,
      user: this.tokenInfo?.displayName || this.tokenInfo?.userId || undefined,
      expiresAt: expiresAt && expiresAt > 0 ? expiresAt : undefined,
      secondsRemaining:
        expiresAt && expiresAt > 0 ? Math.max(0, Math.floor(expiresAt - Date.now() / 1000)) : undefined,
    };
  }
}
