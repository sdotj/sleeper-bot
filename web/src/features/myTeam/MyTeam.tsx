import { api, useAsync } from "../../lib/api";
import type { PlayerRef } from "../../lib/types";
import { Async, Card, CardHeader, EmptyState, PlayerRow, SectionLabel } from "../../components/ui";

function Group({ label, players }: { label: string; players: PlayerRef[] }) {
  if (!players.length) return null;
  return (
    <div className="px-5 py-3">
      <SectionLabel className="mb-1.5">{label}</SectionLabel>
      <div className="divide-y divide-border/50">
        {players.map((p) => (
          <PlayerRow key={p.playerId} pos={p.position} name={p.name} right={p.team ?? "FA"} />
        ))}
      </div>
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
          <Card>
            <CardHeader
              title={roster.ownerName}
              right={
                <span className="tabular-nums">
                  {roster.wins}-{roster.losses}
                  {roster.ties ? `-${roster.ties}` : ""} · {roster.pointsFor.toFixed(1)} PF
                </span>
              }
            />
            <div className="divide-y divide-border/60">
              <Group label="Starters" players={roster.starters} />
              <Group label="Bench" players={roster.bench} />
              <Group label="IR" players={roster.reserve} />
              <Group label="Taxi" players={roster.taxi} />
            </div>
          </Card>
        )
      }
    </Async>
  );
}
