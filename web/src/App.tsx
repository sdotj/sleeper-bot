import { useEffect, useRef, useState } from "react";
import { api, useAsync } from "./lib/api";
import { logout, useAuth } from "./lib/auth";
import { cn } from "./lib/cn";
import { Header } from "./components/layout/Header";
import { Login } from "./features/auth/Login";
import { scrollSection } from "./features/team/scrollSection";
import { Kpis } from "./features/team/Kpis";
import {
  TeamView,
  TEAM_SECTIONS,
  sectionDomId,
  type SectionRefs,
  type TeamSection,
} from "./features/team/TeamView";
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

function Nav({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
}) {
  return (
    <nav
      aria-label="Main navigation"
      className="flex items-center gap-[6px] overflow-x-auto py-[22px]"
    >
      {ALL_TABS.map((name) => {
        const isActive = name === active;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            aria-current={isActive ? "location" : undefined}
            className={cn(
              "whitespace-nowrap rounded-[10px] px-3.5 py-[9px] text-[13px] leading-4 transition-colors",
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
  const activeLeague = (leagues.data ?? []).find((l) => l.id === active);

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
    const set = () =>
      document.documentElement.style.setProperty(
        "--sticky-h",
        `${el.offsetHeight + 12}px`,
      );
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
    };
  }, []);

  // Scroll-spy: the active section is the last one whose top has crossed the
  // header line. A plain scroll listener is steadier than an observer here.
  useEffect(() => {
    if (page !== null) return;
    const onScroll = () => {
      const current = scrollSection(
        TEAM_SECTIONS.flatMap((name) => {
          const element = refs[name].current;
          return element
            ? [{ name, top: element.getBoundingClientRect().top }]
            : [];
        }),
        headerHeight() + 24,
        window.scrollY,
        window.innerHeight,
        document.documentElement.scrollHeight,
      );
      if (current) setSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const observer = new ResizeObserver(onScroll);
    for (const s of TEAM_SECTIONS)
      if (refs[s].current) observer.observe(refs[s].current!);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, active]);

  const onTab = (name: Tab) => {
    if ((TEAM_SECTIONS as readonly string[]).includes(name)) {
      const s = name as TeamSection;
      setPage(null);
      setSection(s);
      // Wait for the dashboard and pinned cards to be visible before measuring.
      setTimeout(() => {
        const el = document.getElementById(sectionDomId(s));
        if (el)
          window.scrollTo({
            top:
              el.getBoundingClientRect().top +
              window.scrollY -
              headerHeight() -
              12,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
          });
      }, 0);
    } else {
      setPage(name as Page);
      window.scrollTo(0, 0);
    }
  };

  const activeTab: Tab = page ?? section;
  const onTeam = page === null;

  return (
    <div className="min-h-screen mx-auto max-w-[1200px] border-x border-border bg-bg">
      <div data-sticky-header className="sticky top-0 z-30 bg-bg">
        <div>
          <Header
            leagues={leagues.data ?? []}
            active={active}
            onSelect={setLeagueId}
            onLogout={loggedIn ? logout : undefined}
          />
          {active && (
            <div className="px-4 sm:px-7">
              <Nav active={activeTab} onSelect={onTab} />
              <div hidden={!onTeam}>
                <Kpis key={active} leagueId={active} />
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="px-4 pb-7 sm:px-7">
        {active && (
          <div key={`team:${active}`} hidden={!onTeam}>
            <TeamView leagueId={active} refs={refs} />
          </div>
        )}
        {leagues.error && (
          <p className="text-sm text-danger">
            ⚠ {leagues.error} — is the API running (npm run api)?
          </p>
        )}
        {active &&
          // Key league-scoped views by league so switching leagues remounts them
          // with fresh local state and data — no stale draft/roster or a prior
          // league's data lingering under the new one (audit #16).
          (onTeam ? null : page === "Draft" ? (
            activeLeague?.capabilities && !activeLeague.capabilities.draft ? (
              <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
                Drafts aren’t available for {activeLeague.platform} leagues —
                the platform doesn’t expose a draft API SleepBot can read.
              </div>
            ) : (
              <DraftView key={active} leagueId={active} />
            )
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
