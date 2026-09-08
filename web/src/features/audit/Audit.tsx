import { api, useAsync } from "../../lib/api";
import type { AuditEvent } from "../../lib/types";
import {
  Async,
  Badge,
  Card,
  CardHeader,
  EmptyState,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { PendingApprovals } from "./PendingApprovals";

const STATUS = {
  proposed: "accent",
  executed: "ok",
  rejected: "danger",
  failed: "danger",
} as const;

export function Audit({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.audit(leagueId), [leagueId]);
  return (
    <>
      <PendingApprovals leagueId={leagueId} />
      <Async state={state}>
        {(events) => (
          <Card className="overflow-hidden">
            <CardHeader title="Activity log" right={leagueId} />
          {!events.length ? (
            <EmptyState>No actions recorded yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold text-faint">
                    <th className="w-[100px] px-[18px] py-[10px]">WHEN</th>
                    <th className="py-[10px] pr-4">ACTION</th>
                    <th className="w-[140px] py-[10px]">STATUS</th>
                    <th className="w-[80px] px-[18px] py-[10px] text-right">
                      BY
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e: AuditEvent, i) => (
                    <tr
                      key={e.id}
                      className={cn("h-[54px]", i % 2 === 1 && "bg-surface-2")}
                    >
                      <td className="px-[18px] py-[11px] text-[11px] text-faint">
                        <time
                          dateTime={new Date(e.at).toISOString()}
                          title={new Date(e.at).toLocaleString()}
                        >
                          {new Date(e.at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </td>
                      <td className="py-[11px] pr-4 font-medium">
                        {e.summary}
                      </td>
                      <td>
                        <Badge
                          variant={STATUS[e.type]}
                          className="border-0 bg-surface-2 font-medium"
                        >
                          <img
                            src={`/assets/audit-${e.type === "rejected" ? "failed" : e.type}.svg`}
                            width={6}
                            height={6}
                            alt=""
                          />
                          {e.type}
                        </Badge>
                      </td>
                      <td className="px-[18px] text-right text-xs text-muted">
                        {e.actor === "user" ? "you" : e.actor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </Card>
        )}
      </Async>
    </>
  );
}
