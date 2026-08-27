import { useState } from "react";
import { api, useAsync } from "./api";
import { Audit, Matchups, MyTeam, Standings } from "./views";
import { Chat } from "./chat";

const TABS = ["My Team", "Standings", "Matchups", "Audit", "Chat"] as const;
type Tab = (typeof TABS)[number];

function AuthBadge({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.auth(leagueId), [leagueId]);
  if (state.loading || !state.data) return null;
  const ok = state.data.state === "ok";
  return (
    <span className={`badge ${ok ? "ok" : "warn"}`} title={state.data.user ?? ""}>
      {ok ? `writes: ready${state.data.user ? ` (${state.data.user})` : ""}` : "writes: needs-reauth"}
    </span>
  );
}

export function App() {
  const leagues = useAsync(() => api.leagues(), []);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("My Team");

  // Default to the first league once loaded.
  const activeLeague = leagueId ?? leagues.data?.[0]?.id ?? null;

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">🏈</span>
          <h1>SleepBot</h1>
        </div>
        <div className="header-right">
          {leagues.data && leagues.data.length > 0 && activeLeague && (
            <>
              <select value={activeLeague} onChange={(e) => setLeagueId(e.target.value)}>
                {leagues.data.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id}
                  </option>
                ))}
              </select>
              <AuthBadge leagueId={activeLeague} />
            </>
          )}
        </div>
      </header>

      {leagues.error && <p className="error">⚠ {leagues.error} — is the API running (npm run api)?</p>}

      {activeLeague && (
        <>
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <main>
            {tab === "My Team" && <MyTeam leagueId={activeLeague} />}
            {tab === "Standings" && <Standings leagueId={activeLeague} />}
            {tab === "Matchups" && <Matchups leagueId={activeLeague} />}
            {tab === "Audit" && <Audit leagueId={activeLeague} />}
            {tab === "Chat" && <Chat />}
          </main>
        </>
      )}
    </div>
  );
}
