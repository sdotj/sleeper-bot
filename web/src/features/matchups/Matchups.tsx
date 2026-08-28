import { api, useAsync } from "../../lib/api";
import type { Matchup } from "../../lib/types";
import { Async, Badge, Card, EmptyState } from "../../components/ui";
import { cn } from "../../lib/cn";

function Side({ side }: { side: Matchup }) {
  return (
    <div className={cn("flex items-center justify-between px-4 py-3", side.isYou && "bg-mine/10")}>
      <span className="flex items-center gap-2">
        <span className={side.isYou ? "font-semibold" : ""}>{side.ownerName}</span>
        {side.isYou && <Badge variant="ok">you</Badge>}
      </span>
      <span className="font-semibold tabular-nums">{side.points.toFixed(1)}</span>
    </div>
  );
}

export function Matchups({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.matchups(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(matchups) => {
        const games = new Map<number, Matchup[]>();
        for (const m of matchups) games.set(m.matchupId, [...(games.get(m.matchupId) ?? []), m]);
        const list = [...games.values()];
        if (!list.length)
          return (
            <Card>
              <EmptyState>No matchups for this week yet.</EmptyState>
            </Card>
          );
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((sides, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="divide-y divide-border/60">
                  {sides.map((s) => (
                    <Side key={s.rosterId} side={s} />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        );
      }}
    </Async>
  );
}
