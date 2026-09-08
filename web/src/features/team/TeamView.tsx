import type { RefObject } from "react";
import { MyTeam } from "../myTeam/MyTeam";
import { Standings } from "../standings/Standings";
import { Matchups } from "../matchups/Matchups";

export const TEAM_SECTIONS = ["My Team", "Standings", "Matchups"] as const;
export type TeamSection = (typeof TEAM_SECTIONS)[number];
export type SectionRefs = Record<TeamSection, RefObject<HTMLElement>>;

/** Stable DOM id for a section, so the nav can scroll to it without ref plumbing. */
export const sectionDomId = (s: TeamSection) =>
  `sec-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/**
 * The combined "team" view (UI refresh): My Team, Standings, and Matchups
 * stacked on one scroll page. The nav (in App) jumps to a section by id and
 * runs the scroll-spy; here we just render the sections with stable ids/refs.
 * `scroll-mt` keeps a deep-linked section clear of the sticky header.
 */
export function TeamView({
  leagueId,
  refs,
}: {
  leagueId: string;
  refs: SectionRefs;
}) {
  return (
    <div className="space-y-[22px]">
      {TEAM_SECTIONS.map((s) => (
        <section
          key={s}
          id={sectionDomId(s)}
          ref={refs[s]}
          style={{ scrollMarginTop: "var(--sticky-h, 210px)" }}
          aria-label={s}
        >
          {s === "My Team" && <MyTeam leagueId={leagueId} />}
          {s === "Standings" && <Standings leagueId={leagueId} />}
          {s === "Matchups" && <Matchups leagueId={leagueId} />}
        </section>
      ))}
    </div>
  );
}
