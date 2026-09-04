import { api, useAsync } from "../../lib/api";
import type { League } from "../../lib/types";
import { Badge, Button, Select } from "../ui";

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
        {onLogout && (
          <Button onClick={onLogout} className="hidden sm:inline-flex">
            Log out
          </Button>
        )}
      </div>
    </header>
  );
}
