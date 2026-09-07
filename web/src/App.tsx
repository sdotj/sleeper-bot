import { useCallback, useRef, useState } from "react";
import { api, useAsync } from "./lib/api";
import { logout, useAuth } from "./lib/auth";
import { cn } from "./lib/cn";
import { Header } from "./components/layout/Header";
import { Login } from "./features/auth/Login";
import { Kpis } from "./features/team/Kpis";
import { TeamView, TEAM_SECTIONS, sectionDomId, type SectionRefs, type TeamSection } from "./features/team/TeamView";
import { DraftView } from "./features/draft/DraftView";
import { Audit } from "./features/audit/Audit";
import { ChatPane } from "./features/chat/ChatPane";
import { Settings } from "./features/settings/Settings";

// The three team tabs scroll one combined page; the rest are standalone pages.
const PAGE_TABS = ["Draft", "Audit", "Chat", "Settings"] as const;
type Page = (typeof PAGE_TABS)[number];
const ALL_TABS = [...TEAM_SECTIONS, ...PAGE_TABS] as const;
type Tab = (typeof ALL_TABS)[number];

export function App() {
  const { token, authRequired } = useAuth();
  if (authRequired) return <Login />;
  return <Dashboard key={token ?? "anon"} loggedIn={Boolean(token)} />;
}

function Nav({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto pb-3 pt-1">
      {ALL_TABS.map((name) => {
        const isActive = name === active;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className={cn(
              "whitespace-nowrap rounded-lg px-3.5 py-2 text-sm transition-colors",
              isActive
                ? "bg-accent font-semibold text-on-accent"
                : "font-medium text-muted hover:text-text",
            )}
          >
            {name}
          </button>
        );
      })}
    </nav>
  );
}

function Dashboard({ loggedIn }: { loggedIn: boolean }) {
  const leagues = useAsync(() => api.leagues(), []);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const active = leagueId ?? leagues.data?.[0]?.id ?? null;

  // null page = the combined team view; `section` tracks scroll-spy within it.
  const [page, setPage] = useState<Page | null>(null);
  const [section, setSection] = useState<TeamSection>("My Team");

  const refs: SectionRefs = {
    "My Team": useRef<HTMLElement>(null),
    Standings: useRef<HTMLElement>(null),
    Matchups: useRef<HTMLElement>(null),
  };
  const onActiveSection = useCallback((s: TeamSection) => setSection(s), []);

  const onTab = (name: Tab) => {
    if ((TEAM_SECTIONS as readonly string[]).includes(name)) {
      const s = name as TeamSection;
      setPage(null);
      setSection(s);
      // Defer so the TeamView is mounted (e.g. when returning from a standalone
      // page), then scroll the section clear of the sticky header — measuring its
      // height so the offset is right at any width / with or without the KPI row.
      requestAnimationFrame(() => {
        const el = document.getElementById(sectionDomId(s));
        if (!el) return;
        const header = document.querySelector("[data-sticky-header]");
        const offset = (header instanceof HTMLElement ? header.offsetHeight : 0) + 12;
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
      });
    } else {
      setPage(name as Page);
    }
  };

  const activeTab: Tab = page ?? section;
  const onTeam = page === null;

  return (
    <div className="min-h-screen">
      <div data-sticky-header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4">
          <Header
            leagues={leagues.data ?? []}
            active={active}
            onSelect={setLeagueId}
            onLogout={loggedIn ? logout : undefined}
          />
          {active && <Nav active={activeTab} onSelect={onTab} />}
          {active && onTeam && <Kpis leagueId={active} />}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {leagues.error && (
          <p className="text-sm text-danger">⚠ {leagues.error} — is the API running (npm run api)?</p>
        )}
        {active &&
          (onTeam ? (
            <TeamView leagueId={active} refs={refs} onActiveSection={onActiveSection} />
          ) : page === "Draft" ? (
            <DraftView leagueId={active} />
          ) : page === "Audit" ? (
            <Audit leagueId={active} />
          ) : page === "Chat" ? (
            <ChatPane />
          ) : (
            <Settings />
          ))}
      </main>
    </div>
  );
}
