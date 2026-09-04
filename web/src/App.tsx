import { useState } from "react";
import { api, useAsync } from "./lib/api";
import { logout, useAuth } from "./lib/auth";
import { Header } from "./components/layout/Header";
import { TabBar } from "./components/ui";
import { Login } from "./features/auth/Login";
import { MyTeam } from "./features/myTeam/MyTeam";
import { Standings } from "./features/standings/Standings";
import { Matchups } from "./features/matchups/Matchups";
import { DraftView } from "./features/draft/DraftView";
import { Audit } from "./features/audit/Audit";
import { ChatPane } from "./features/chat/ChatPane";
import { Settings } from "./features/settings/Settings";

const TABS = ["My Team", "Standings", "Matchups", "Draft", "Audit", "Chat", "Settings"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const { token, authRequired } = useAuth();
  // A 401 from any protected call flips `authRequired`; show the login screen.
  if (authRequired) return <Login />;
  // Remount the app when the token changes so every panel refetches with it.
  return <Dashboard key={token ?? "anon"} loggedIn={Boolean(token)} />;
}

function Dashboard({ loggedIn }: { loggedIn: boolean }) {
  const leagues = useAsync(() => api.leagues(), []);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("My Team");
  const active = leagueId ?? leagues.data?.[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Header
        leagues={leagues.data ?? []}
        active={active}
        onSelect={setLeagueId}
        onLogout={loggedIn ? logout : undefined}
      />

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
            {tab === "Chat" && <ChatPane />}
            {tab === "Settings" && <Settings />}
          </main>
        </div>
      )}
    </div>
  );
}
