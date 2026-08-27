import { useEffect, useState } from "react";
import { api, useAsync } from "./api";

const POSITIONS = ["", "QB", "RB", "WR", "TE", "K", "DEF"] as const;

export function DraftView({ leagueId }: { leagueId: string }) {
  const drafts = useAsync(() => api.drafts(leagueId), [leagueId]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [manualDraftId, setManualDraftId] = useState<string>("");
  const [rosterId, setRosterId] = useState<string>("");
  const [position, setPosition] = useState<string>("");
  const [tick, setTick] = useState(0);

  // A pasted mock-draft id wins; else the dropdown selection; else the first
  // league draft. The board/recs endpoints accept any draft id.
  const activeDraft = manualDraftId.trim() || draftId || drafts.data?.[0]?.draftId || null;
  const yourRosterId = rosterId ? Number(rosterId) : undefined;

  const board = useAsync(
    () => (activeDraft ? api.draftBoard(leagueId, activeDraft, yourRosterId) : Promise.resolve(null)),
    [leagueId, activeDraft, yourRosterId, tick],
  );
  const recs = useAsync(
    () =>
      activeDraft
        ? api.draftRecs(leagueId, activeDraft, { rosterId: yourRosterId, position: position || undefined, limit: 12 })
        : Promise.resolve([]),
    [leagueId, activeDraft, position, yourRosterId, tick],
  );

  // Auto-refresh while a draft is live.
  const live = board.data?.draft.status === "drafting";
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [live]);

  if (drafts.loading) return <p className="muted">Loading…</p>;
  if (drafts.error) return <p className="error">⚠ {drafts.error}</p>;

  return (
    <div className="draft">
      <div className="draft-controls">
        <select
          value={manualDraftId.trim() ? "" : (draftId ?? drafts.data?.[0]?.draftId ?? "")}
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
        </select>
        <input
          type="text"
          inputMode="numeric"
          placeholder="or paste mock draft id"
          value={manualDraftId}
          onChange={(e) => setManualDraftId(e.target.value.replace(/\D/g, ""))}
          style={{ width: "11rem" }}
        />
        <input
          type="text"
          inputMode="numeric"
          placeholder="your roster id (optional)"
          value={rosterId}
          onChange={(e) => setRosterId(e.target.value.replace(/\D/g, ""))}
          style={{ width: "9rem" }}
        />
        <button onClick={() => setTick((n) => n + 1)}>Refresh</button>
        {live && <span className="badge ok">live · auto-refresh</span>}
      </div>

      {board.data && (
        <div className="card draft-board">
          <div className="card-head">
            <h3>
              {board.data.draft.status}
              {board.data.onTheClock && (
                <span className="muted"> · on the clock: pick {board.data.onTheClock.pickNo} (R{board.data.onTheClock.round})</span>
              )}
            </h3>
            <span className="record">
              {board.data.pickCount} picks
              {board.data.yourNextPickNo != null && <> · your next: #{board.data.yourNextPickNo}</>}
            </span>
          </div>
          {board.data.recentPicks.length > 0 && (
            <div className="player-group">
              <h4>Recent picks</h4>
              <ul className="players">
                {board.data.recentPicks.map((p) => (
                  <li key={p.pickNo}>
                    <span className="pick-no">#{p.pickNo}</span>
                    <span className="pname">
                      {p.playerName} <span className="team">{p.position}</span>
                    </span>
                    <span className="team">R{p.round}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="pos-filter">
        {POSITIONS.map((p) => (
          <button key={p || "all"} className={position === p ? "active" : ""} onClick={() => setPosition(p)}>
            {p || "All"}
          </button>
        ))}
      </div>

      {recs.loading && <p className="muted">Loading recommendations…</p>}
      {recs.error && <p className="error">⚠ {recs.error}</p>}
      {recs.data && (
        <ol className="recs">
          {recs.data.map((r) => (
            <li key={r.playerId}>
              <span className={`pos pos-${r.position.toLowerCase()}`}>{r.position || "—"}</span>
              <span className="pname">
                {r.name} <span className="team">{r.team ?? "FA"}</span>
              </span>
              <span className="rec-reason muted">{r.reason}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
