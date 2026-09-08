import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-border bg-surface",
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
        "flex items-center justify-between gap-3 border-b border-border px-[18px] py-[15px]",
        className,
      )}
    >
      <h3 className="text-[15px] leading-[18px] font-semibold">{title}</h3>
      {right != null && <div className="text-xs text-muted">{right}</div>}
    </div>
  );
}
