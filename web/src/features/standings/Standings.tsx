import { api, useAsync } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Async, Card, CardHeader } from "../../components/ui";

export function Standings({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.standings(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(rows) => (
        <Card className="overflow-hidden">
          <CardHeader title="Standings" right={`${rows.length} teams`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] table-fixed text-[13px] leading-4">
              <colgroup>
                <col className="w-[56px]" />
                <col />
                <col className="w-[72px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[96px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold text-faint">
                  <th className="py-[10px] pl-[18px] text-left">#</th>
                  <th className="text-left">TEAM</th>
                  {["W-L", "PF", "PA", "STREAK"].map((t) => (
                    <th key={t} className="py-[10px] pr-[18px] text-right">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.rosterId}
                    className={cn(
                      "h-[55px]",
                      r.isYou
                        ? "bg-accent-tint"
                        : i % 2 === 1 && "bg-surface-2",
                    )}
                  >
                    <td
                      className={cn(
                        "pl-[18px] text-[14px] font-bold",
                        r.isYou
                          ? "text-accent shadow-[inset_3px_0_var(--color-accent)]"
                          : "text-muted",
                      )}
                    >
                      {r.rank}
                    </td>
                    <td className="py-[11px] pr-3">
                      <div className="truncate text-[14px] font-semibold">
                        {r.ownerName}
                      </div>
                      <div className="mt-0.5 text-[11.5px] leading-[14px] text-faint">
                        {r.isYou ? "Your team" : `Team ${r.rosterId}`}
                      </div>
                    </td>
                    <td className="pr-[18px] text-right font-semibold tabular-nums">
                      {r.wins}-{r.losses}
                      {r.ties ? `-${r.ties}` : ""}
                    </td>
                    <td className="pr-[18px] text-right tabular-nums">
                      {r.pointsFor.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="pr-[18px] text-right tabular-nums text-muted">
                      {r.pointsAgainst.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td
                      className="pr-[18px] text-right text-faint"
                      title="Streak unavailable"
                    >
                      —
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Async>
  );
}
