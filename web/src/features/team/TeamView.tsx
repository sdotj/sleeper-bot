import { useEffect, type RefObject } from "react";
import { MyTeam } from "../myTeam/MyTeam";
import { Standings } from "../standings/Standings";
import { Matchups } from "../matchups/Matchups";

export const TEAM_SECTIONS = ["My Team", "Standings", "Matchups"] as const;
export type TeamSection = (typeof TEAM_SECTIONS)[number];
export type SectionRefs = Record<TeamSection, RefObject<HTMLElement>>;

const HEADINGS: Record<TeamSection, string> = {
  "My Team": "My Team",
  Standings: "Standings",
  Matchups: "This week",
};

/** Stable DOM id for a section, so the nav can scroll to it without ref plumbing. */
export const sectionDomId = (s: TeamSection) => `sec-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/**
 * The combined "team" view (dec: UI refresh): My Team, Standings, and Matchups
 * stacked on one scroll page. The nav tabs jump to a section; an
 * IntersectionObserver scroll-spy reports which section is in view so the active
 * tab tracks the scroll. `scroll-mt` keeps a jumped-to section clear of the
 * sticky header.
 */
export function TeamView({
  leagueId,
  refs,
  onActiveSection,
}: {
  leagueId: string;
  refs: SectionRefs;
  onActiveSection: (s: TeamSection) => void;
}) {
  useEffect(() => {
    const header = document.querySelector("[data-sticky-header]");
    const top = (header instanceof HTMLElement ? header.offsetHeight : 160) + 8;
    const obs = new IntersectionObserver(
      (entries) => {
        const inView = entries.filter((e) => e.isIntersecting);
        if (!inView.length) return;
        // The topmost section (in TEAM_SECTIONS order) currently crossing the band.
        const active = TEAM_SECTIONS.find((s) => inView.some((e) => e.target === refs[s].current));
        if (active) onActiveSection(active);
      },
      { rootMargin: `-${top}px 0px -55% 0px`, threshold: 0 },
    );
    for (const s of TEAM_SECTIONS) {
      const el = refs[s].current;
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [leagueId, refs, onActiveSection]);

  return (
    <div className="space-y-9">
      {TEAM_SECTIONS.map((s) => (
        <section key={s} id={sectionDomId(s)} ref={refs[s]} className="scroll-mt-[210px] space-y-3">
          <h2 className="px-1 text-sm font-semibold text-muted">{HEADINGS[s]}</h2>
          {s === "My Team" && <MyTeam leagueId={leagueId} />}
          {s === "Standings" && <Standings leagueId={leagueId} />}
          {s === "Matchups" && <Matchups leagueId={leagueId} />}
        </section>
      ))}
    </div>
  );
}
