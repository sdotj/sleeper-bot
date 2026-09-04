import { useSyncExternalStore } from "react";

/**
 * Client-side login state (dec.api-auth-gate). The token lives in localStorage
 * and rides on every API call as `Authorization: Bearer …`. When the server is
 * running without auth configured, none of this matters — calls just succeed
 * with no token and the login screen never appears.
 */

const TOKEN_KEY = "sleepbot_token";

interface AuthState {
  token: string | null;
  /** Set when a protected call came back 401 auth_required — App shows the login screen. */
  authRequired: boolean;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let state: AuthState = { token: readToken(), authRequired: false };
const listeners = new Set<() => void>();

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * The freshest token in this browser — read from localStorage on every call, not
 * from the in-memory snapshot. A tab opened before login (whose snapshot is still
 * null) then sends the token another tab stored. Capture it right before a fetch
 * so you can hand it to {@link signalAuthRequired} if that request 401s.
 */
export function getToken(): string | null {
  return readToken();
}

/** Merge the bearer header into an outgoing request's headers (no-op without a token). */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = readToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

/**
 * Called on a 401 whose body carried `code: "auth_required"`. `sentToken` is the
 * token the failing request actually carried (undefined/null if it went out
 * without one). We only tear the session down when the token that was *rejected*
 * is still the current stored token — so a tokenless in-flight request that races
 * a fresh login (or a call that just missed the header) can't wipe a good token.
 * Otherwise we surface the still-valid token and quietly self-heal.
 */
export function signalAuthRequired(sentToken?: string | null): void {
  const current = readToken();
  if (current && sentToken !== current) {
    setState({ token: current, authRequired: false });
    return;
  }
  // No stored token, or the stored token itself was rejected → require login.
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  setState({ token: null, authRequired: true });
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `login failed (${res.status})`);
  }
  const { token } = (await res.json()) as { token: string };
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore — token still held in memory for this session */
  }
  setState({ token, authRequired: false });
}

export function logout(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  setState({ token: null, authRequired: true });
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// Keep every tab in sync: a login/logout in one tab writes localStorage, which
// fires `storage` in the others (never in the tab that made the change). A fresh
// token there heals to the app; a cleared token sends it to the login screen.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== TOKEN_KEY) return; // key === null on localStorage.clear()
    const token = readToken();
    setState({ token, authRequired: !token });
  });
}
