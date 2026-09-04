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

export function getToken(): string | null {
  return state.token;
}

/** Merge the bearer header into an outgoing request's headers (no-op without a token). */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return state.token ? { ...extra, Authorization: `Bearer ${state.token}` } : extra;
}

/** The API client calls this on a 401 whose body carries `code: "auth_required"`. */
export function signalAuthRequired(): void {
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
