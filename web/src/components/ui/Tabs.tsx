import { cn } from "../../lib/cn";

export function TabBar<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly T[];
  active: T;
  onSelect: (tab: T) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface/60 p-1">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onSelect(t)}
          className={cn(
            "h-8 rounded-lg px-3.5 text-sm font-medium transition-colors",
            t === active
              ? "bg-accent text-on-accent font-semibold shadow-sm shadow-accent/30"
              : "text-muted hover:bg-surface-2 hover:text-text",
          )}
        >
          {t}
        </button>
      ))}
    </nav>
  );
}
