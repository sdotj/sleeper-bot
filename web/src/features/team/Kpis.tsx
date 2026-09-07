import { api, useAsync } from "../../lib/api";
import { cn } from "../../lib/cn";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function Kpi({ label, value, sub, subClass }: { label: string; value: string; sub: string; subClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="text-[0.62rem] font-semibold uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className="mt-1 text-[1.6rem] font-bold leading-none tabular-nums">{value}</div>
      <div className={cn("mt-1.5 text-xs font-medium text-muted", subClass)}>{sub}</div>
    </div>
  );
}

/**
 * The pinned KPI row for the combined Team view — rank / record / points for /
 * points against, computed from the standings (your row). Renders nothing until
 * standings load or if no "you" is configured, so the sticky header stays clean.
 */
export function Kpis({ leagueId }: { leagueId: string }) {
  const { data } = useAsync(() => api.standings(leagueId), [leagueId]);
  const rows = data ?? [];
  const me = rows.find((r) => r.isYou);
  if (!me) return null;

  const teams = rows.length;
  const games = me.wins + me.losses + me.ties;
  const rec = `${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ""}`;
  const winPct = games ? Math.round((me.wins / games) * 100) : 0;
  const paRank = 1 + rows.filter((r) => r.pointsAgainst < me.pointsAgainst).length;

  return (
    <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-4">
      <Kpi
        label="League rank"
        value={ordinal(me.rank)}
        sub={`of ${teams}`}
        subClass={me.rank <= teams / 2 ? "text-ok" : undefined}
      />
      <Kpi label="Record" value={rec} sub={`${winPct}% win rate`} />
      <Kpi label="Points for" value={me.pointsFor.toFixed(0)} sub={`${games ? (me.pointsFor / games).toFixed(1) : "0.0"} / wk`} />
      <Kpi label="Points against" value={me.pointsAgainst.toFixed(0)} sub={`${ordinal(paRank)} fewest`} />
    </div>
  );
}
