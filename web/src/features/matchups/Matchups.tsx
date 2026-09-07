import { api, useAsync } from "../../lib/api";
import { cn } from "../../lib/cn";
import type { Matchup } from "../../lib/types";
import { Async, Card, CardHeader, EmptyState } from "../../components/ui";

export function Matchups({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.matchups(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(matchups) => {
        const byGame = new Map<number, Matchup[]>();
        for (const m of matchups) byGame.set(m.matchupId, [...(byGame.get(m.matchupId) ?? []), m]);
        const games = [...byGame.values()];
        if (!games.length)
          return (
            <Card>
              <EmptyState>No matchups for this week yet.</EmptyState>
            </Card>
          );
        // Your game first.
        games.sort((a, b) => Number(b.some((s) => s.isYou)) - Number(a.some((s) => s.isYou)));
        return (
          <Card className="overflow-hidden">
            <CardHeader title="This week" right={<span className="text-muted">Week {matchups[0].week}</span>} />
            {games.map((sides, i) => (
              <GameRow key={i} sides={sides} zebra={i % 2 === 1} />
            ))}
          </Card>
        );
      }}
    </Async>
  );
}

function GameRow({ sides, zebra }: { sides: Matchup[]; zebra: boolean }) {
  const [a, b] = sides;
  const aWins = b ? a.points >= b.points : true;
  const mine = a.isYou || b?.isYou;
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-l-2 px-5 py-3 text-sm",
        mine ? "border-accent bg-accent-tint" : cn("border-transparent", zebra && "bg-surface-2/35"),
      )}
    >
      <span className={cn("min-w-0 flex-1 truncate", a.isYou ? "font-semibold" : b ? "text-muted" : "")}>
        {a.isYou && "★ "}
        {a.ownerName}
      </span>
      <span className={cn("w-14 text-right font-bold tabular-nums", aWins ? "text-ok" : "text-muted")}>
        {a.points.toFixed(1)}
      </span>
      <span className="text-faint">–</span>
      <span className={cn("w-14 font-bold tabular-nums", b && !aWins ? "text-ok" : "text-muted")}>
        {b ? b.points.toFixed(1) : "—"}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-right", b?.isYou ? "font-semibold" : b ? "text-muted" : "")}>
        {b ? `${b.isYou ? "★ " : ""}${b.ownerName}` : "(bye)"}
      </span>
    </div>
  );
}
