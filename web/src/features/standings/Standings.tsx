import { api, useAsync } from "../../lib/api";
import { cn } from "../../lib/cn";
import type { StandingRow } from "../../lib/types";
import { Async, Card, CardHeader } from "../../components/ui";

export function Standings({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.standings(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(rows) => (
        <Card className="overflow-hidden">
          <CardHeader title="Standings" right={<span className="text-muted">{rows.length} teams</span>} />
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="flex items-center gap-3 border-b border-border px-5 py-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.09em] text-faint">
                <span className="w-6">#</span>
                <span className="flex-1">Team</span>
                <span className="w-16 text-right">W-L</span>
                <span className="w-20 text-right">PF</span>
                <span className="w-20 text-right">PA</span>
              </div>
              {rows.map((r, i) => (
                <StandingRowView key={r.rosterId} r={r} zebra={i % 2 === 1} />
              ))}
            </div>
          </div>
        </Card>
      )}
    </Async>
  );
}

function StandingRowView({ r, zebra }: { r: StandingRow; zebra: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-l-2 px-5 py-3",
        r.isYou
          ? "border-accent bg-accent-tint"
          : cn("border-transparent", zebra && "bg-surface-2/35"),
      )}
    >
      <span className={cn("w-6 font-bold tabular-nums", r.isYou ? "text-accent" : "text-muted")}>{r.rank}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
        <span className={r.isYou ? "font-semibold" : "font-medium"}>{r.ownerName}</span>
        {r.isYou && <span className="text-xs font-semibold text-accent">you</span>}
      </span>
      <span className="w-16 text-right font-semibold tabular-nums">
        {r.wins}-{r.losses}
        {r.ties ? `-${r.ties}` : ""}
      </span>
      <span className="w-20 text-right tabular-nums">{r.pointsFor.toFixed(1)}</span>
      <span className="w-20 text-right tabular-nums text-muted">{r.pointsAgainst.toFixed(1)}</span>
    </div>
  );
}
