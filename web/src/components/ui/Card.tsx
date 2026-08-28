import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface/90 shadow-lg shadow-black/25 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  right,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5",
        className,
      )}
    >
      <h3 className="text-[0.95rem] font-semibold tracking-tight">{title}</h3>
      {right != null && <div className="text-sm text-muted">{right}</div>}
    </div>
  );
}
