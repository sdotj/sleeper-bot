import { useEffect, useState } from "react";
import { api, useAsync } from "../../lib/api";
import { Async, Badge, Button, Select, TextInput } from "../../components/ui";
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
  const activeDraft = manualDraftId.trim() || draftId || drafts.data?.[0]?.draftId || null;
  const yourRosterId = rosterId ? Number(rosterId) : undefined;

  // resetKey drops stale data when the draft (or roster/position) changes, but
  // keeps it across the 5s poll `tick` so the board doesn't flash (audit #16).
  const board = useAsync(
    () => (activeDraft ? api.draftBoard(leagueId, activeDraft, yourRosterId) : Promise.resolve(null)),
    [leagueId, activeDraft, yourRosterId, tick],
    { resetKey: `${leagueId}:${activeDraft}:${yourRosterId ?? ""}` },
  );
  const recs = useAsync(
    () =>
      activeDraft
        ? api.draftRecs(leagueId, activeDraft, { rosterId: yourRosterId, position: position || undefined, limit: 12 })
        : Promise.resolve([]),
    [leagueId, activeDraft, position, yourRosterId, tick],
    { resetKey: `${leagueId}:${activeDraft}:${yourRosterId ?? ""}:${position}` },
  );

  // Poll while the draft isn't finished so board + chat context stay live.
  const polling = !!activeDraft && board.data?.draft.status !== "complete";
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, [polling]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={manualDraftId.trim() ? "" : draftId ?? drafts.data?.[0]?.draftId ?? ""}
          onChange={(e) => {
            setManualDraftId("");
            setDraftId(e.target.value);
          }}
          disabled={(drafts.data ?? []).length === 0}
        >
          {(drafts.data ?? []).length === 0 && <option value="">no league drafts</option>}
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
          onChange={(e) => setManualDraftId(e.target.value.replace(/\D/g, ""))}
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
        <Button variant="primary" onClick={() => setChatOpen((o) => !o)} disabled={!activeDraft}>
          {chatOpen ? "Close chat" : "Start chat"}
        </Button>
        {polling && <Badge variant="ok">live · 5s</Badge>}
      </div>

      {drafts.loading ? (
        <Async state={drafts}>{() => null}</Async>
      ) : (
        <div className={cn("gap-4", chatOpen ? "lg:flex lg:items-start" : "")}>
          <div className="min-w-0 flex-1 space-y-4">
            {board.data && <DraftBoard board={board.data} />}
            <Recommendations state={recs} position={position} onPosition={setPosition} />
          </div>

          {chatOpen && activeDraft && (
            <aside className="mt-4 rounded-xl border border-border bg-surface p-3 lg:mt-0 lg:w-96 lg:shrink-0 lg:sticky lg:top-4">
              <div className="h-[70vh]">
                <Chat
                  key={activeDraft}
                  draftContext={{ leagueId, draftId: activeDraft, rosterId: yourRosterId }}
                  placeholder="Ask about this draft…"
                  emptyHint={
                    <>
                      This chat sees the <strong className="text-text">live board</strong> — who’s on
                      the clock, recent picks, your next pick, and best available by value. Ask “who
                      should I take here?” or “what do I need most?”. It refreshes every turn.
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
