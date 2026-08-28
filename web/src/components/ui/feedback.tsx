import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-accent",
        className,
      )}
    />
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-5 py-12 text-center text-sm text-muted">{children}</div>;
}

export interface AsyncState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

/** Render loading / error / content for a useAsync() result. */
export function Async<T>({
  state,
  children,
}: {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
}) {
  // Data-first: keep showing content while a refresh is in flight, and don't
  // blank the view on a transient poll error once we have data.
  if (state.data !== undefined) return <>{children(state.data)}</>;
  if (state.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
        <Spinner /> Loading…
      </div>
    );
  }
  if (state.error) {
    return <p className="px-5 py-8 text-sm text-danger">⚠ {state.error}</p>;
  }
  return <EmptyState>No data.</EmptyState>;
}
