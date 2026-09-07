import { api, useAsync } from "../../lib/api";
import { cycleTheme, useTheme } from "../../lib/theme";
import type { League } from "../../lib/types";
import { Badge, Button, Select } from "../ui";

/** Cycles System → Light → Dark; the icon reflects the current preference. */
function ThemeToggle() {
  const theme = useTheme();
  const label = theme === "system" ? "System" : theme === "light" ? "Light" : "Dark";
  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={`Theme: ${label}`}
      aria-label={`Theme: ${label} — click to change`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:border-border-strong hover:text-text"
    >
      {theme === "light" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )}
    </button>
  );
}

function AuthBadge({ leagueId }: { leagueId: string }) {
  const s = useAsync(() => api.auth(leagueId), [leagueId]);
  if (s.loading || !s.data) return null;
  const ok = s.data.state === "ok";
  return (
    <Badge variant={ok ? "ok" : "warn"} className="hidden sm:inline-flex">
      {ok ? `writes ready${s.data.user ? ` · ${s.data.user}` : ""}` : "writes: needs-reauth"}
    </Badge>
  );
}

export function Header({
  leagues,
  active,
  onSelect,
  onLogout,
}: {
  leagues: League[];
  active: string | null;
  onSelect: (id: string) => void;
  /** When set (i.e. a login session is active), render a Log out button. */
  onLogout?: () => void;
}) {
  return (
    <header className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-4">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl leading-none">🏈</span>
        <h1 className="text-lg font-bold tracking-tight">SleepBot</h1>
      </div>
      <div className="flex items-center gap-2.5">
        {leagues.length > 0 && active && (
          <>
            <Select value={active} onChange={(e) => onSelect(e.target.value)}>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id}
                </option>
              ))}
            </Select>
            <AuthBadge leagueId={active} />
          </>
        )}
        <ThemeToggle />
        {onLogout && (
          <Button onClick={onLogout} className="hidden sm:inline-flex">
            Log out
          </Button>
        )}
      </div>
    </header>
  );
}
