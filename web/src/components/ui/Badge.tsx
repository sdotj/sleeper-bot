import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "neutral" | "accent" | "ok" | "warn" | "danger";

const VARIANTS: Record<Variant, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  accent: "bg-accent/15 text-accent border-accent/25",
  ok: "bg-ok/15 text-ok border-ok/25",
  warn: "bg-warn/15 text-warn border-warn/25",
  danger: "bg-danger/15 text-danger border-danger/25",
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
  QB: "bg-pos-qb/15 text-pos-qb",
  RB: "bg-pos-rb/15 text-pos-rb",
  WR: "bg-pos-wr/15 text-pos-wr",
  TE: "bg-pos-te/15 text-pos-te",
  K: "bg-pos-k/15 text-pos-k",
  DEF: "bg-pos-def/15 text-pos-def",
};

export function PositionBadge({ pos, className }: { pos: string; className?: string }) {
  const key = (pos || "").toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex w-10 justify-center rounded-md px-1.5 py-1 text-[0.62rem] font-bold tracking-wide",
        POS[key] ?? "bg-surface-2 text-faint",
        className,
      )}
    >
      {key || "—"}
    </span>
  );
}
