import { useState } from "react";
import { api, useAsync } from "./lib/api";
import { Header } from "./components/layout/Header";
import { TabBar } from "./components/ui";
import { MyTeam } from "./features/myTeam/MyTeam";
import { Standings } from "./features/standings/Standings";
import { Matchups } from "./features/matchups/Matchups";
import { DraftView } from "./features/draft/DraftView";
import { Audit } from "./features/audit/Audit";
import { Chat } from "./features/chat/Chat";

const TABS = ["My Team", "Standings", "Matchups", "Draft", "Audit", "Chat"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const leagues = useAsync(() => api.leagues(), []);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("My Team");
  const active = leagueId ?? leagues.data?.[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Header leagues={leagues.data ?? []} active={active} onSelect={setLeagueId} />

      {leagues.error && (
        <p className="text-sm text-danger">⚠ {leagues.error} — is the API running (npm run api)?</p>
      )}

      {active && (
        <div className="space-y-5">
          <TabBar tabs={TABS} active={tab} onSelect={setTab} />
          <main>
            {tab === "My Team" && <MyTeam leagueId={active} />}
            {tab === "Standings" && <Standings leagueId={active} />}
            {tab === "Matchups" && <Matchups leagueId={active} />}
            {tab === "Draft" && <DraftView leagueId={active} />}
            {tab === "Audit" && <Audit leagueId={active} />}
            {tab === "Chat" && (
              <div className="h-[72vh] rounded-xl border border-border bg-surface p-3">
                <Chat />
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
