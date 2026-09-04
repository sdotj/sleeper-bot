/** Auth posture of a platform's write path. */
export type AuthState = "ok" | "needs-reauth";

/** A readable snapshot of the write session, for status tools. */
export interface SessionStatus {
  state: AuthState;
  /** Who the token belongs to (display name or user id), when known. */
  user?: string;
  /** Token expiry, epoch seconds, when known. */
  expiresAt?: number;
  /** Seconds until expiry (<= 0 if expired/unknown). */
  secondsRemaining?: number;
}

/**
 * Raised when a write cannot proceed because the session is unrecoverable and
 * the server has entered `needs-reauth`. Tools translate this into a clear,
 * actionable message; it never triggers a password login (dec.sleeper-session-auth).
 */
export class NeedsReauthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NeedsReauthError";
  }
}

/**
 * SessionProvider — supplies the credential the write path needs, and owns the
 * self-heal-or-fail-safe behavior. On expiry the caller invokes
 * {@link markInvalid}; the provider refreshes where it safely can and otherwise
 * transitions to `needs-reauth` (pausing writes, keeping reads alive, notifying
 * the user). Implementations must never automate a password login.
 */
export interface SessionProvider {
  readonly state: AuthState;
  /** Current token. Throws {@link NeedsReauthError} when unrecoverable. */
  getToken(): Promise<string>;
  /** Called after an unauthorized/expired write: attempt refresh, else enter `needs-reauth`. */
  markInvalid(): Promise<void>;
  /**
   * Replace the credential live (e.g. the user pastes a fresh token in the
   * settings panel). Clears any prior `needs-reauth` and re-derives status from
   * the new token (dec.ui-config-editing).
   */
  setToken(token: string | undefined): void;
  /** A readable status snapshot (for a status tool / the future UI). */
  status(): SessionStatus;
}
