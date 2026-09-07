import { api, useAsync } from "../../lib/api";
import { cn } from "../../lib/cn";
import type { PlayerRef } from "../../lib/types";
import { Async, Card, CardHeader, EmptyState, PositionBadge } from "../../components/ui";

function Group({ label, players }: { label: string; players: PlayerRef[] }) {
  if (!players.length) return null;
  return (
    <div>
      <div className="bg-surface-2/60 px-5 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.09em] text-faint">
        {label}
      </div>
      {players.map((p, i) => (
        <div
          key={p.playerId}
          className={cn("flex items-center gap-3 px-5 py-2.5", i % 2 === 1 && "bg-surface-2/35")}
        >
          <PositionBadge pos={p.position} />
          <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-faint">{p.team ?? "FA"}</span>
        </div>
      ))}
    </div>
  );
}

export function MyTeam({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.myRoster(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(roster) =>
        !roster ? (
          <Card>
            <EmptyState>
              No “my team” set. Add <code className="rounded bg-surface-2 px-1 py-0.5">sleeper.username</code>{" "}
              to your league config so SleepBot knows which roster is yours.
            </EmptyState>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader
              title={roster.ownerName}
              right={
                <span className="tabular-nums text-muted">
                  {roster.wins}-{roster.losses}
                  {roster.ties ? `-${roster.ties}` : ""} · {roster.pointsFor.toFixed(1)} PF
                </span>
              }
            />
            <Group label="Starters" players={roster.starters} />
            <Group label="Bench" players={roster.bench} />
            <Group label="IR" players={roster.reserve} />
            <Group label="Taxi" players={roster.taxi} />
          </Card>
        )
      }
    </Async>
  );
}
