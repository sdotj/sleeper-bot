import { api, useAsync } from "../../lib/api";
import type { StandingRow } from "../../lib/types";
import { Async, Badge, Card, type Column, DataTable } from "../../components/ui";

const columns: Column<StandingRow>[] = [
  { key: "rank", header: "#", render: (r) => <span className="tabular-nums text-muted">{r.rank}</span>, className: "w-10" },
  {
    key: "team",
    header: "Team",
    render: (r) => (
      <span className="flex items-center gap-2">
        <span className={r.isYou ? "font-semibold" : ""}>{r.ownerName}</span>
        {r.isYou && <Badge variant="ok">you</Badge>}
      </span>
    ),
  },
  {
    key: "rec",
    header: "W-L-T",
    render: (r) => (
      <span className="tabular-nums">
        {r.wins}-{r.losses}
        {r.ties ? `-${r.ties}` : ""}
      </span>
    ),
  },
  { key: "pf", header: "PF", render: (r) => <span className="tabular-nums text-muted">{r.pointsFor.toFixed(1)}</span> },
  { key: "pa", header: "PA", render: (r) => <span className="tabular-nums text-muted">{r.pointsAgainst.toFixed(1)}</span> },
];

export function Standings({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.standings(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(rows) => (
        <Card className="overflow-hidden">
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.rosterId} highlight={(r) => r.isYou} />
        </Card>
      )}
    </Async>
  );
}
