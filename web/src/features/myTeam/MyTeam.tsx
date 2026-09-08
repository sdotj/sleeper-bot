import { api, useAsync } from "../../lib/api";
import { cn } from "../../lib/cn";
import type { PlayerRef } from "../../lib/types";
import {
  Async,
  Card,
  CardHeader,
  EmptyState,
  PositionBadge,
} from "../../components/ui";

function Group({ label, players }: { label: string; players: PlayerRef[] }) {
  if (!players.length) return null;
  return (
    <div>
      <div className="bg-surface-2 px-[18px] py-[9px] text-[10px] leading-[13px] font-semibold uppercase tracking-[0.09em] text-faint">
        {label}
      </div>
      {players.map((p, i) => (
        <div
          key={p.playerId}
          className={cn(
            "flex items-center gap-3 px-[18px] py-[10px] min-h-[51px]",
            i % 2 === 1 && "bg-surface-2",
          )}
        >
          <PositionBadge pos={p.position} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium leading-[17px]">
              {p.name}
            </div>
            <div className="mt-0.5 text-[11px] leading-[13px] text-faint">
              {p.team ?? "FA"}
            </div>
          </div>
          <span
            title="Projection unavailable"
            className="text-[13px] font-semibold text-muted"
          >
            —
          </span>
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
              No “my team” set. Add{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5">
                sleeper.username
              </code>{" "}
              to your league config so SleepBot knows which roster is yours.
            </EmptyState>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  My Team{" "}
                  <span className="text-[13px] font-medium text-muted">
                    {roster.ownerName}
                  </span>
                </span>
              }
              right={
                <span
                  className="text-accent"
                  title="Player projections are unavailable"
                >
                  Proj —
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
