import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "../../lib/cn";

const FIELD =
  "h-9 rounded-[9px] border border-border bg-surface-2 text-[13px] text-text " +
  "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 " +
  "disabled:opacity-50 disabled:cursor-default";

export function Button({
  variant = "ghost",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "primary";
}) {
  const variants = {
    ghost:
      "bg-surface-2 text-muted border border-border hover:text-text hover:border-border-strong",
    primary: "bg-accent text-on-accent font-semibold hover:bg-accent-strong",
  };
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-[9px] px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-default",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(FIELD, "px-2.5 hover:border-border-strong", className)}
      {...props}
    />
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(FIELD, "px-3 placeholder:text-faint", className)}
      {...props}
    />
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[0.64rem] font-semibold uppercase tracking-[0.09em] text-faint",
        className,
      )}
    >
      {children}
    </div>
  );
}
