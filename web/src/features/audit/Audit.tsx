import { api, useAsync } from "../../lib/api";
import type { AuditEvent } from "../../lib/types";
import { Async, Card, EmptyState } from "../../components/ui";
import { cn } from "../../lib/cn";

const ICON: Record<AuditEvent["type"], string> = {
  proposed: "📝",
  executed: "✅",
  rejected: "🛑",
  failed: "⚠️",
};

export function Audit({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.audit(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(events) => (
        <Card className="overflow-hidden">
          {!events.length ? (
            <EmptyState>No actions recorded yet — this is where you’ll see what SleepBot did.</EmptyState>
          ) : (
            <ul className="divide-y divide-border/60">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 px-5 py-3">
                  <span className="text-lg leading-6">{ICON[e.type] ?? "•"}</span>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "text-sm",
                        (e.type === "rejected" || e.type === "failed") && "text-danger",
                      )}
                    >
                      {e.summary}
                    </div>
                    <div className="mt-0.5 text-xs text-faint">
                      {new Date(e.at).toLocaleString()} · by {e.actor}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </Async>
  );
}
