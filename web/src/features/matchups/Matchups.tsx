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
        for (const m of matchups)
          byGame.set(m.matchupId, [...(byGame.get(m.matchupId) ?? []), m]);
        const games = [...byGame.values()];
        if (!games.length)
          return (
            <Card>
              <EmptyState>No matchups for this week yet.</EmptyState>
            </Card>
          );
        // Your game first.
        games.sort(
          (a, b) =>
            Number(b.some((s) => s.isYou)) - Number(a.some((s) => s.isYou)),
        );
        return (
          <Card className="overflow-hidden">
            <CardHeader
              title="This week’s matchups"
              right={
                <span className="text-muted">Week {matchups[0].week}</span>
              }
            />
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
        "flex items-center gap-[14px] border-l-[3px] px-[15px] py-[13px] text-[13.5px] leading-[18px]",
        mine
          ? "border-accent bg-accent-tint"
          : cn("border-transparent", zebra && "bg-surface-2"),
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          aWins ? "font-semibold text-text" : "font-semibold text-muted",
        )}
      >
        {a.isYou && "★ "}
        {a.ownerName}
      </span>
      <span
        className={cn(
          "w-[54px] shrink-0 text-[15px] text-right font-bold tabular-nums",
          aWins ? "text-ok" : "text-muted",
        )}
      >
        {a.points.toFixed(1)}
      </span>
      <span className="text-faint">–</span>
      <span
        className={cn(
          "w-[54px] shrink-0 text-[15px] font-bold tabular-nums",
          b && !aWins ? "text-ok" : "text-muted",
        )}
      >
        {b ? b.points.toFixed(1) : "—"}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-right",
          b && !aWins ? "font-semibold text-text" : "font-semibold text-muted",
        )}
      >
        {b ? `${b.isYou ? "★ " : ""}${b.ownerName}` : "(bye)"}
      </span>
    </div>
  );
}
