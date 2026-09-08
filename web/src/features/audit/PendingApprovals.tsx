import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { PendingAction } from "../../lib/types";
import { Badge, Button, Card, CardHeader } from "../../components/ui";

/**
 * The confirm-by-default approval list (audit #8). Chat and the agent create
 * DRAFTS; nothing is sent until it's approved here. Each row shows the exact,
 * name-resolved action plus any rule warnings, with Approve (send) and Cancel.
 * Hidden entirely when there's nothing pending.
 */
export function PendingApprovals({ leagueId }: { leagueId: string }) {
  const [items, setItems] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.pending(leagueId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function act(id: string, kind: "execute" | "cancel") {
    setBusyId(id);
    setError(null);
    try {
      if (kind === "execute") await api.executeAction(id);
      else await api.cancelAction(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  // Nothing to approve → render nothing (keeps the Activity page clean).
  if (loading || (items.length === 0 && !error)) return null;

  return (
    <Card className="mb-4">
      <CardHeader title="Pending approvals" right={`${items.length} awaiting`} />
      {error && <p className="px-[18px] py-2 text-[13px] text-danger">⚠ {error}</p>}
      <ul className="divide-y divide-border">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-[18px] py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-text">{a.summary}</p>
              <p className="mt-0.5 text-[11px] text-faint">
                {a.kind.replace("_", " ")} · {a.leagueId} ·{" "}
                {new Date(a.createdMs).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              {a.verdict.warnings.length > 0 && (
                <Badge variant="warn" className="mt-1.5">
                  ⚠ {a.verdict.warnings.join("; ")}
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="primary"
                disabled={busyId === a.id}
                onClick={() => void act(a.id, "execute")}
              >
                {busyId === a.id ? "Sending…" : "Approve & send"}
              </Button>
              <Button disabled={busyId === a.id} onClick={() => void act(a.id, "cancel")}>
                Cancel
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
