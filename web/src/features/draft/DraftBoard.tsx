import type { DraftBoard as Board } from "../../lib/types";
import { Badge, Card, CardHeader, PositionBadge, SectionLabel } from "../../components/ui";

export function DraftBoard({ board }: { board: Board }) {
  const otc = board.onTheClock;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="capitalize">{board.draft.status.replace("_", " ")}</span>
            {otc && (
              <Badge variant="accent">
                on the clock · #{otc.pickNo} (R{otc.round})
              </Badge>
            )}
          </span>
        }
        right={
          <span className="tabular-nums">
            {board.pickCount} picks
            {board.yourNextPickNo != null && (
              <> · your next <span className="text-accent">#{board.yourNextPickNo}</span></>
            )}
          </span>
        }
      />
      {board.recentPicks.length > 0 && (
        <div className="px-5 py-3">
          <SectionLabel className="mb-1.5">Recent picks</SectionLabel>
          <ul className="divide-y divide-border/50">
            {board.recentPicks.map((p) => (
              <li key={p.pickNo} className="flex items-center gap-3 py-2">
                <span className="w-9 shrink-0 text-xs tabular-nums text-faint">#{p.pickNo}</span>
                <PositionBadge pos={p.position} />
                <span className="min-w-0 flex-1 truncate">{p.playerName}</span>
                <span className="shrink-0 text-xs text-faint">R{p.round}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
