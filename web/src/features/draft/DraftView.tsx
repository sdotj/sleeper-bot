import { useEffect, useState } from "react";
import { api, useAsync } from "../../lib/api";
import {
  Async,
  Badge,
  Button,
  Card,
  Select,
  TextInput,
} from "../../components/ui";
import { Chat } from "../chat/Chat";
import { DraftBoard } from "./DraftBoard";
import { Recommendations } from "./Recommendations";
import { cn } from "../../lib/cn";

export function DraftView({ leagueId }: { leagueId: string }) {
  const drafts = useAsync(() => api.drafts(leagueId), [leagueId]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [manualDraftId, setManualDraftId] = useState("");
  const [rosterId, setRosterId] = useState("");
  const [position, setPosition] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [tick, setTick] = useState(0);

  // A pasted mock-draft id wins; else the dropdown; else the first league draft.
  const activeDraft =
    manualDraftId.trim() || draftId || drafts.data?.[0]?.draftId || null;
  const yourRosterId = rosterId ? Number(rosterId) : undefined;

  // resetKey drops stale data when the draft (or roster/position) changes, but
  // keeps it across the 5s poll `tick` so the board doesn't flash (audit #16).
  const board = useAsync(
    () =>
      activeDraft
        ? api.draftBoard(leagueId, activeDraft, yourRosterId)
        : Promise.resolve(null),
    [leagueId, activeDraft, yourRosterId, tick],
    { resetKey: `${leagueId}:${activeDraft}:${yourRosterId ?? ""}` },
  );
  const recs = useAsync(
    () =>
      activeDraft
        ? api.draftRecs(leagueId, activeDraft, {
            rosterId: yourRosterId,
            position: position || undefined,
            limit: 12,
          })
        : Promise.resolve([]),
    [leagueId, activeDraft, position, yourRosterId, tick],
    {
      resetKey: `${leagueId}:${activeDraft}:${yourRosterId ?? ""}:${position}`,
    },
  );

  // Poll while the draft isn't finished so board + chat context stay live.
  const polling = !!activeDraft && board.data?.draft.status !== "complete";
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, [polling]);

  return (
    <div className="space-y-[22px]">
      <Card className="relative flex flex-wrap items-center justify-between gap-3 px-[18px] py-4">
        {board.data ? (
          <>
            <div>
              <h2 className="text-[16px] font-semibold">
                {board.data.draft.season}{" "}
                <span className="capitalize">{board.data.draft.type}</span>{" "}
                Draft
              </h2>
              <p className="mt-1 text-xs text-muted">
                {board.data.draft.teams} teams · {board.data.draft.rounds}{" "}
                rounds · {board.data.pickCount} picks
              </p>
            </div>
            <Badge
              variant="accent"
              className="sm:ml-auto rounded-[10px]! border-accent! bg-accent-tint! px-[14px] py-[10px] text-[13px]"
            >
              {board.data.onTheClock
                ? `On the clock · pick ${board.data.onTheClock.pickNo}`
                : board.data.draft.status}
              {board.data.yourNextPickNo != null &&
                ` · your next #${board.data.yourNextPickNo}`}
            </Badge>
          </>
        ) : (
          <h2 className="text-[16px] font-semibold">Draft room</h2>
        )}
        <details className="group text-xs text-muted">
          <summary className="cursor-pointer">Draft controls</summary>
          <div className="absolute inset-x-0 top-full z-20 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4 shadow-lg">
            <Select
              value={
                manualDraftId.trim()
                  ? ""
                  : (draftId ?? drafts.data?.[0]?.draftId ?? "")
              }
              onChange={(e) => {
                setManualDraftId("");
                setDraftId(e.target.value);
              }}
              disabled={(drafts.data ?? []).length === 0}
            >
              {(drafts.data ?? []).length === 0 && (
                <option value="">no league drafts</option>
              )}
              {(drafts.data ?? []).map((d) => (
                <option key={d.draftId} value={d.draftId}>
                  {d.season} {d.type} · {d.status} · {d.rounds}×{d.teams}
                </option>
              ))}
            </Select>
            <TextInput
              inputMode="numeric"
              placeholder="or paste mock draft id"
              value={manualDraftId}
              onChange={(e) =>
                setManualDraftId(e.target.value.replace(/\D/g, ""))
              }
              className="w-44"
            />
            <TextInput
              inputMode="numeric"
              placeholder="your roster id (optional)"
              value={rosterId}
              onChange={(e) => setRosterId(e.target.value.replace(/\D/g, ""))}
              className="w-40"
            />
            <Button onClick={() => setTick((n) => n + 1)}>Refresh</Button>
            <Button
              variant="primary"
              onClick={() => setChatOpen((o) => !o)}
              disabled={!activeDraft}
            >
              {chatOpen ? "Close chat" : "Start chat"}
            </Button>
            {polling && <Badge variant="ok">live · 5s</Badge>}
          </div>
        </details>
      </Card>

      {drafts.loading ? (
        <Async state={drafts}>{() => null}</Async>
      ) : (
        <div className={cn("gap-4", chatOpen ? "lg:flex lg:items-start" : "")}>
          <div className="grid min-w-0 flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Recommendations
              state={recs}
              position={position}
              onPosition={setPosition}
            />
            {board.data && <DraftBoard board={board.data} />}
            {board.error && (
              <p className="text-sm text-danger">{board.error}</p>
            )}
          </div>

          {chatOpen && activeDraft && (
            <aside className="mt-4 rounded-xl border border-border bg-surface p-3 lg:mt-0 lg:w-96 lg:shrink-0 lg:sticky lg:top-4">
              <div className="h-[70vh]">
                <Chat
                  key={activeDraft}
                  draftContext={{
                    leagueId,
                    draftId: activeDraft,
                    rosterId: yourRosterId,
                  }}
                  placeholder="Ask about this draft…"
                  emptyHint={
                    <>
                      This chat sees the{" "}
                      <strong className="text-text">live board</strong> — who’s
                      on the clock, recent picks, your next pick, and best
                      available by value. Ask “who should I take here?” or “what
                      do I need most?”. It refreshes every turn.
                    </>
                  }
                />
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
