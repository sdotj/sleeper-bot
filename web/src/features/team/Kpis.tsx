import { api, useAsync } from "../../lib/api";
import { cn } from "../../lib/cn";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function Kpi({
  label,
  value,
  sub,
  subClass,
}: {
  label: string;
  value: string;
  sub: string;
  subClass?: string;
}) {
  return (
    <div className="h-[107px] rounded-xl border border-border bg-surface px-[18px] py-[15px]">
      <div className="text-[11px] leading-[13px] font-semibold uppercase tracking-[0.6px] text-faint">
        {label}
      </div>
      <div className="mt-[7px] text-[27px] font-bold leading-[33px] tabular-nums">
        {value}
      </div>
      <div
        className={cn(
          "mt-[7px] text-xs leading-[15px] font-medium text-muted",
          subClass,
        )}
      >
        {sub}
      </div>
    </div>
  );
}

/** League overview from live standings. Waiver data is not yet exposed by the API. */
export function Kpis({ leagueId }: { leagueId: string }) {
  const { data } = useAsync(() => api.standings(leagueId), [leagueId]);
  const rows = data ?? [];
  const me = rows.find((r) => r.isYou);
  if (!me) return null;

  const teams = rows.length;
  const games = me.wins + me.losses + me.ties;
  const rec = `${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ""}`;
  const winPct = games
    ? ((me.wins + me.ties / 2) / games).toFixed(3).replace(/^0/, "")
    : ".000";

  return (
    <div className="grid grid-cols-2 gap-[14px] pb-[22px] sm:grid-cols-4">
      <Kpi
        label="League rank"
        value={ordinal(me.rank)}
        sub={`of ${teams}`}
        subClass={me.rank <= teams / 2 ? "text-ok" : undefined}
      />
      <Kpi label="Record" value={rec} sub={`${winPct} win rate`} />
      <Kpi
        label="Points for"
        value={me.pointsFor.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })}
        sub={`${games ? (me.pointsFor / games).toFixed(1) : "0.0"} avg / week`}
      />
      <Kpi label="Waiver" value="—" sub="Data unavailable" />
    </div>
  );
}
