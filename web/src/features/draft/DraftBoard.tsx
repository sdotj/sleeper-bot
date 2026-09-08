import type { DraftBoard as Board } from "../../lib/types";
import { Card, CardHeader, EmptyState } from "../../components/ui";
import { cn } from "../../lib/cn";

export function DraftBoard({ board }: { board: Board }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Recent picks" />
      {!board.recentPicks.length && <EmptyState>No picks yet.</EmptyState>}
      <ol>
        {board.recentPicks.map((p, i) => (
          <li
            key={p.pickNo}
            className={cn(
              "flex items-center gap-[10px] px-4 py-[10px]",
              i % 2 === 1 && "bg-surface-2",
            )}
          >
            <span className="w-[34px] shrink-0 text-xs font-semibold tabular-nums text-faint">
              {p.round}.{p.pickNo}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium leading-4">
                {p.playerName}
              </div>
              <div className="mt-px text-[11px] leading-[13px] text-faint">
                {p.position} · {p.team ?? "FA"}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
