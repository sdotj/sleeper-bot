import { api, useAsync } from "../../lib/api";
import { cycleTheme, useTheme } from "../../lib/theme";
import type { League } from "../../lib/types";
import { Button, Select } from "../ui";

/** Account controls remain available without crowding the mockup's header. */
export function Header({
  leagues,
  active,
  onSelect,
  onLogout,
}: {
  leagues: League[];
  active: string | null;
  onSelect: (id: string) => void;
  onLogout?: () => void;
}) {
  const theme = useTheme();
  const { data: status } = useAsync(
    () => (active ? api.auth(active) : Promise.resolve(null)),
    [active],
  );
  const ready = status?.state === "ok";
  return (
    <header className="flex h-[68px] items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-7">
      <div className="flex shrink-0 items-center gap-[9px]">
        <span className="text-[22px] leading-[22px]">🏈</span>
        <h1 className="text-[18px] font-bold leading-[22px]">SleepBot</h1>
      </div>
      <div className="flex min-w-0 items-center gap-2.5">
        {active && (
          <Select
            aria-label="League"
            className="h-8! min-w-0 max-w-[190px] text-[13px]"
            value={active}
            onChange={(e) => onSelect(e.target.value)}
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id}
              </option>
            ))}
          </Select>
        )}
        {status && (
          <span
            className={`hidden items-center gap-[6px] whitespace-nowrap rounded-full border border-border bg-surface-2 px-[11px] py-[5px] text-xs font-medium sm:inline-flex ${ready ? "text-ok" : "text-warn"}`}
          >
            {ready && (
              <img src="/assets/status-ready.svg" width={7} height={7} alt="" />
            )}
            {ready
              ? `writes ready${status.user ? ` · ${status.user}` : ""}`
              : "writes: needs-reauth"}
          </span>
        )}
        <details className="relative shrink-0">
          <summary
            aria-label="Account and appearance"
            className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full bg-accent text-[13px] font-bold text-on-accent [&::-webkit-details-marker]:hidden"
          >
            {status?.user?.slice(0, 1).toUpperCase() || "S"}
          </summary>
          <div className="absolute right-0 top-10 z-40 flex w-44 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-lg">
            <Button onClick={cycleTheme}>Theme: {theme}</Button>
            {onLogout && <Button onClick={onLogout}>Log out</Button>}
          </div>
        </details>
      </div>
    </header>
  );
}
