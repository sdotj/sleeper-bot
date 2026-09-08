import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "neutral" | "accent" | "ok" | "warn" | "danger";

const VARIANTS: Record<Variant, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  accent: "bg-accent/15 text-accent border-accent/25",
  ok: "bg-surface-2 text-ok border-border",
  warn: "bg-surface-2 text-warn border-border",
  danger: "bg-surface-2 text-danger border-border",
};

export function Badge({
  variant = "neutral",
  children,
  className,
}: {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold whitespace-nowrap",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// Literal classes so Tailwind v4 detects them at build time.
const POS: Record<string, string> = {
  QB: "bg-surface-2 text-pos-qb",
  RB: "bg-surface-2 text-pos-rb",
  WR: "bg-surface-2 text-pos-wr",
  TE: "bg-surface-2 text-pos-te",
  K: "bg-surface-2 text-pos-k",
  DEF: "bg-surface-2 text-pos-def",
};

export function PositionBadge({
  pos,
  className,
}: {
  pos: string;
  className?: string;
}) {
  const key = (pos || "").toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex w-[42px] shrink-0 justify-center rounded-md px-1.5 py-[5px] text-[10px] leading-[14px] font-bold tracking-wide",
        POS[key] ?? "bg-surface-2 text-faint",
        className,
      )}
    >
      {key || "—"}
    </span>
  );
}
