import type { DraftRecommendation } from "../../lib/types";
import { Async, type AsyncState, Card, CardHeader, PlayerRow } from "../../components/ui";
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
          <div className="flex flex-wrap gap-1">
            {POSITIONS.map((p) => (
              <button
                key={p || "all"}
                onClick={() => onPosition(p)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  position === p
                    ? "bg-accent/20 text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {p || "All"}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-5 py-2">
        <Async state={state}>
          {(recs) => (
            <ol className="divide-y divide-border/50">
              {recs.map((r) => (
                <PlayerRow
                  key={r.playerId}
                  pos={r.position}
                  name={r.name}
                  team={r.team ?? "FA"}
                  right={<span className="text-faint">{r.reason}</span>}
                />
              ))}
            </ol>
          )}
        </Async>
      </div>
    </Card>
  );
}
