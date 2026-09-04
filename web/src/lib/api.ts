import { useEffect, useState } from "react";
import { authHeaders, getToken, signalAuthRequired } from "./auth";
import type {
  AuditEvent,
  AuthStatus,
  Conversation,
  ConversationSummary,
  Draft,
  DraftBoard,
  DraftRecommendation,
  League,
  Matchup,
  MemoryNote,
  Roster,
  SleepBotConfigDoc,
  SleeperTokenStatus,
  StandingRow,
} from "./types";

async function get<T>(url: string): Promise<T> {
  const sent = getToken(); // token this request carries (may be null in a pre-login tab)
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    // A login-required 401 (distinct from a Sleeper-token reauth) sends us back
    // to the login screen — unless the stored token changed since we sent, in
    // which case signalAuthRequired heals instead of wiping.
    if (res.status === 401 && body.code === "auth_required") signalAuthRequired(sent);
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Mutating request (POST/PUT/DELETE) sharing the same auth + error handling as get. */
async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const sent = getToken();
  const res = await fetch(url, {
    method,
    headers: authHeaders(body === undefined ? {} : { "content-type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (res.status === 401 && b.code === "auth_required") signalAuthRequired(sent);
    throw new Error(b.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  leagues: () => get<League[]>("/api/leagues"),
  myRoster: (id: string) => get<Roster | null>(`/api/leagues/${id}/my-roster`),
  standings: (id: string) => get<StandingRow[]>(`/api/leagues/${id}/standings`),
  matchups: (id: string, week?: number) =>
    get<Matchup[]>(`/api/leagues/${id}/matchups${week ? `?week=${week}` : ""}`),
  auth: (id: string) => get<AuthStatus>(`/api/leagues/${id}/auth`),
  audit: (id: string) => get<AuditEvent[]>(`/api/audit?leagueId=${encodeURIComponent(id)}`),
  drafts: (id: string) => get<Draft[]>(`/api/leagues/${id}/drafts`),
  draftBoard: (id: string, draftId: string, yourRosterId?: number) =>
    get<DraftBoard>(
      `/api/leagues/${id}/drafts/${draftId}/board${yourRosterId != null ? `?yourRosterId=${yourRosterId}` : ""}`,
    ),
  draftRecs: (
    id: string,
    draftId: string,
    o: { rosterId?: number; position?: string; limit?: number } = {},
  ) => {
    const q = new URLSearchParams();
    if (o.rosterId != null) q.set("rosterId", String(o.rosterId));
    if (o.position) q.set("position", o.position);
    if (o.limit != null) q.set("limit", String(o.limit));
    return get<DraftRecommendation[]>(`/api/leagues/${id}/drafts/${draftId}/recommendations?${q}`);
  },

  // --- settings ---
  config: () => get<SleepBotConfigDoc>("/api/config"),
  saveConfig: (config: SleepBotConfigDoc) => send<SleepBotConfigDoc>("PUT", "/api/config", config),
  resetConfig: () => send<SleepBotConfigDoc>("POST", "/api/config/reset"),
  sleeperToken: () => get<SleeperTokenStatus>("/api/secrets/sleeper"),
  setSleeperToken: (token: string) =>
    send<SleeperTokenStatus>("PUT", "/api/secrets/sleeper", { token }),
  clearSleeperToken: () => send<SleeperTokenStatus>("DELETE", "/api/secrets/sleeper"),

  // --- chat history ---
  conversations: () => get<ConversationSummary[]>("/api/conversations"),
  conversation: (id: string) => get<Conversation>(`/api/conversations/${id}`),
  sendChat: (message: string, conversationId?: string) =>
    send<{ conversationId: string; reply: string; toolCalls: string[] }>("POST", "/api/chat", {
      message,
      conversationId,
    }),
  renameConversation: (id: string, title: string) =>
    send<Conversation>("PATCH", `/api/conversations/${id}`, { title }),
  deleteConversation: (id: string) => send<{ ok: true }>("DELETE", `/api/conversations/${id}`),

  // --- long-term memory ---
  memory: () => get<MemoryNote[]>("/api/memory"),
  addMemory: (text: string) => send<MemoryNote>("POST", "/api/memory", { text }),
  deleteMemory: (id: string) => send<{ ok: true }>("DELETE", `/api/memory/${id}`),
};

/** Tiny async-data hook: re-runs when any dep changes. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({
    loading: true,
  });
  useEffect(() => {
    let live = true;
    // Keep any previous data visible while refetching (e.g. draft polling) so
    // the UI doesn't flash to a spinner on every refresh.
    setState((s) => ({ data: s.data, loading: true }));
    fn()
      .then((data) => live && setState({ data, loading: false }))
      .catch((err) => live && setState((s) => ({ data: s.data, error: (err as Error).message, loading: false })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
