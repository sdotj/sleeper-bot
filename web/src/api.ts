import { useEffect, useState } from "react";
import type { AuditEvent, AuthStatus, League, Matchup, Roster, StandingRow } from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
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
};

/** Tiny async-data hook: re-runs when any dep changes. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({
    loading: true,
  });
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    fn()
      .then((data) => live && setState({ data, loading: false }))
      .catch((err) => live && setState({ error: (err as Error).message, loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
