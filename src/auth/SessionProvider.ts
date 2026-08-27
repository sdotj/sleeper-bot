/** Auth posture of a platform's write path. */
export type AuthState = "ok" | "needs-reauth";

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
  /** Called after a 401: attempt refresh, else enter `needs-reauth`. */
  markInvalid(): Promise<void>;
}
