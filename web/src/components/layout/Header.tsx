import { api, useAsync } from "../../lib/api";
import { cycleTheme, useTheme } from "../../lib/theme";
import type { League } from "../../lib/types";
import { Button } from "../ui";
import { HeaderMenu } from "./HeaderMenu";

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
          <HeaderMenu
            label="League"
            trigger={
              <>
                <span className="truncate">{active}</span>
                <span aria-hidden="true" className="text-faint">
                  ▾
                </span>
              </>
            }
            triggerClassName="flex h-8 max-w-[190px] items-center gap-2 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px]"
          >
            {(close) =>
              leagues.map((league) => (
                <button
                  key={league.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={league.id === active}
                  onClick={() => {
                    onSelect(league.id);
                    close();
                  }}
                  className={`rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface-2 ${league.id === active ? "bg-accent-tint font-semibold text-accent" : "text-text"}`}
                >
                  {league.id}
                </button>
              ))
            }
          </HeaderMenu>
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
        <HeaderMenu
          label="Account and appearance"
          trigger={status?.user?.slice(0, 1).toUpperCase() || "S"}
          triggerClassName="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-on-accent"
        >
          {(close) => (
            <>
              <Button role="menuitem" onClick={cycleTheme}>
                Theme: {theme}
              </Button>
              {onLogout && (
                <Button
                  role="menuitem"
                  onClick={() => {
                    close();
                    onLogout();
                  }}
                >
                  Log out
                </Button>
              )}
            </>
          )}
        </HeaderMenu>
      </div>
    </header>
  );
}
