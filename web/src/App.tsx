import { useEffect, useRef, useState } from "react";
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

/** Height of the sticky header right now — the scroll-spy line. */
function headerHeight(): number {
  const el = document.querySelector("[data-sticky-header]");
  return el instanceof HTMLElement ? el.offsetHeight : 0;
}

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
              isActive ? "bg-accent font-semibold text-on-accent" : "font-medium text-muted hover:text-text",
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

  // Keep --sticky-h in sync with the header's height, so each section's
  // scroll-margin-top lands it just below the header on a jump.
  useEffect(() => {
    const el = document.querySelector("[data-sticky-header]");
    if (!(el instanceof HTMLElement)) return;
    const set = () => document.documentElement.style.setProperty("--sticky-h", `${el.offsetHeight + 12}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
    };
  });

  // Scroll-spy: the active section is the last one whose top has crossed the
  // header line. A plain scroll listener is steadier than an observer here.
  useEffect(() => {
    if (page !== null) return;
    const onScroll = () => {
      const line = headerHeight() + 24;
      let current: TeamSection = TEAM_SECTIONS[0];
      for (const s of TEAM_SECTIONS) {
        const el = refs[s].current;
        if (el && el.getBoundingClientRect().top <= line) current = s;
      }
      setSection((prev) => (prev === current ? prev : current));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const onTab = (name: Tab) => {
    if ((TEAM_SECTIONS as readonly string[]).includes(name)) {
      const s = name as TeamSection;
      setPage(null);
      setSection(s);
      // Instant jump to a live-computed target (native smooth scroll and
      // scrollIntoView are unreliable in some preview browsers). setTimeout(0)
      // lets TeamView mount when coming from a standalone page; the resulting
      // scroll event lets the spy confirm the active section.
      setTimeout(() => {
        const el = document.getElementById(sectionDomId(s));
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - headerHeight() - 12);
      }, 0);
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
          {active && onTeam && <Kpis key={active} leagueId={active} />}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {leagues.error && (
          <p className="text-sm text-danger">⚠ {leagues.error} — is the API running (npm run api)?</p>
        )}
        {active &&
          // Key league-scoped views by league so switching leagues remounts them
          // with fresh local state and data — no stale draft/roster or a prior
          // league's data lingering under the new one (audit #16).
          (onTeam ? (
            <TeamView key={active} leagueId={active} refs={refs} />
          ) : page === "Draft" ? (
            <DraftView key={active} leagueId={active} />
          ) : page === "Audit" ? (
            <Audit key={active} leagueId={active} />
          ) : page === "Chat" ? (
            <ChatPane />
          ) : (
            <Settings />
          ))}
      </main>
    </div>
  );
}
