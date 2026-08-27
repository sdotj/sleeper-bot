import {
  NeedsReauthError,
  type AuthState,
  type SessionProvider,
} from "./SessionProvider.js";

export interface SleeperSessionOptions {
  /** Session token captured from a logged-in Sleeper session (env:SLEEPER_SESSION_TOKEN). */
  token?: string;
  /** Refresh token, if Sleeper issues one (env:SLEEPER_REFRESH_TOKEN). */
  refreshToken?: string;
  /**
   * Fail-safe notifier invoked when the session becomes unrecoverable. Wired to
   * the Phase-3 UI / push later; defaults to stderr.
   */
  notify?: (message: string) => void;
}

/**
 * SleeperSessionProvider — session handling for Sleeper's UNOFFICIAL private
 * write API.
 *
 * ⚠️  Sleeper has no official write API. Trades/waivers/adds go through the
 * private app API, which needs a session token captured from a logged-in
 * session. This is reverse-engineered and may break without notice.
 *
 * Per dec.sleeper-session-auth we NEVER log in with a password. We refresh where
 * safe; if we can't, we enter `needs-reauth`: writes pause, reads keep working
 * (they never call this), and the user is notified to supply a fresh token.
 */
export class SleeperSessionProvider implements SessionProvider {
  private _state: AuthState = "ok";
  private token?: string;
  private readonly refreshToken?: string;
  private readonly notify: (message: string) => void;

  constructor(opts: SleeperSessionOptions = {}) {
    this.token = opts.token;
    this.refreshToken = opts.refreshToken;
    this.notify = opts.notify ?? ((m) => console.error(`[auth] ${m}`));
    if (!this.token) this._state = "needs-reauth";
  }

  get state(): AuthState {
    return this._state;
  }

  async getToken(): Promise<string> {
    if (this._state === "needs-reauth" || !this.token) {
      throw new NeedsReauthError(
        "Sleeper write session is unavailable. Supply a fresh session token " +
          "(SLEEPER_SESSION_TOKEN) captured from a logged-in Sleeper session.",
      );
    }
    return this.token;
  }

  async markInvalid(): Promise<void> {
    if (await this.tryRefresh()) return;
    this._state = "needs-reauth";
    this.token = undefined;
    this.notify(
      "Sleeper session expired and could not be refreshed. Writes are paused " +
        "until a new session token is supplied. Reads are unaffected.",
    );
  }

  /**
   * Attempt a token-refresh EXCHANGE (not a password login). Returns true on
   * success. Sleeper's private refresh mechanics are not publicly documented,
   * so this is a stub returning false today; when a refresh endpoint is
   * confirmed, implement it here — everything else already handles both paths.
   */
  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    // TODO(phase2): call Sleeper's private token-refresh endpoint with
    // this.refreshToken, set this.token on success. Never send a password.
    return false;
  }
}
