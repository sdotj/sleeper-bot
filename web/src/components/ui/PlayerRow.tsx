import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { PositionBadge } from "./Badge";

/** One player line: position badge, name (+ team), optional right-aligned slot. */
export function PlayerRow({
  pos,
  name,
  team,
  right,
  className,
}: {
  pos: string;
  name: string;
  team?: string | null;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 py-2", className)}>
      <PositionBadge pos={pos} />
      <div className="min-w-0 flex-1 truncate">
        <span className="font-medium">{name}</span>
        {team && <span className="ml-2 text-xs text-faint">{team}</span>}
      </div>
      {right != null && <div className="shrink-0 text-xs tabular-nums text-muted">{right}</div>}
    </div>
  );
}
