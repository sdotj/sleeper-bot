import type { DraftRecommendation } from "../../lib/types";
import {
  Async,
  type AsyncState,
  Card,
  CardHeader,
  PositionBadge,
  EmptyState,
} from "../../components/ui";
import { cn } from "../../lib/cn";

const POSITIONS = ["", "QB", "RB", "WR", "TE", "K", "DEF"] as const;

export function Recommendations({
  state,
  position,
  onPosition,
}: {
  state: AsyncState<DraftRecommendation[]>;
  position: string;
  onPosition: (pos: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Best available"
        right={
          <div className="flex flex-wrap gap-[6px]">
            {POSITIONS.map((p) => (
              <button
                key={p || "all"}
                aria-pressed={position === p}
                onClick={() => onPosition(p)}
                className={cn(
                  "rounded-[7px] border px-[10px] py-[5px] text-[11px] font-medium",
                  position === p
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface-2 text-muted",
                )}
              >
                {p || "All"}
              </button>
            ))}
          </div>
        }
      />
      <Async state={state}>
        {(recs) =>
          recs.length ? (
            <ol>
              {recs.map((r, i) => (
                <li
                  key={r.playerId}
                  className={cn(
                    "flex items-center gap-3 px-[18px] py-[11px]",
                    i === 0
                      ? "bg-accent-tint shadow-[inset_3px_0_var(--color-accent)]"
                      : i % 2 === 1 && "bg-surface-2",
                  )}
                >
                  <PositionBadge pos={r.position} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium leading-[17px]">
                      {r.name}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 text-[11.5px] leading-[14px]",
                        i === 0 ? "text-accent" : "text-faint",
                      )}
                    >
                      {i === 0 ? "★ " : ""}
                      {r.team ?? "FA"} · {r.reason}
                    </div>
                  </div>
                  <span className="text-[15px] font-semibold tabular-nums">
                    {r.value.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState>No available players for this filter.</EmptyState>
          )
        }
      </Async>
    </Card>
  );
}
