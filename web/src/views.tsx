import { api, useAsync } from "./api";
import type { Matchup, PlayerRef } from "./types";

/** Small helper: loading / error / content. */
function Async<T>({ state, children }: { state: ReturnType<typeof useAsync<T>>; children: (d: T) => JSX.Element }) {
  if (state.loading) return <p className="muted">Loading…</p>;
  if (state.error) return <p className="error">⚠ {state.error}</p>;
  return state.data !== undefined ? children(state.data) : <p className="muted">No data.</p>;
}

function PlayerList({ title, players }: { title: string; players: PlayerRef[] }) {
  if (!players.length) return null;
  return (
    <div className="player-group">
      <h4>{title}</h4>
      <ul className="players">
        {players.map((p) => (
          <li key={p.playerId}>
            <span className={`pos pos-${p.position.toLowerCase()}`}>{p.position || "—"}</span>
            <span className="pname">{p.name}</span>
            <span className="team">{p.team ?? "FA"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MyTeam({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.myRoster(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(roster) =>
        !roster ? (
          <p className="muted">
            No “my team” set. Add <code>sleeper.username</code> to your league config so SleepBot
            knows which roster is yours.
          </p>
        ) : (
          <div className="card">
            <div className="card-head">
              <h3>{roster.ownerName}</h3>
              <span className="record">
                {roster.wins}-{roster.losses}
                {roster.ties ? `-${roster.ties}` : ""} · {roster.pointsFor.toFixed(1)} PF
              </span>
            </div>
            <PlayerList title="Starters" players={roster.starters} />
            <PlayerList title="Bench" players={roster.bench} />
            <PlayerList title="IR" players={roster.reserve} />
            <PlayerList title="Taxi" players={roster.taxi} />
          </div>
        )
      }
    </Async>
  );
}

export function Standings({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.standings(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(rows) => (
        <table className="grid">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>W-L-T</th>
              <th>PF</th>
              <th>PA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rosterId} className={r.isYou ? "you" : ""}>
                <td>{r.rank}</td>
                <td>
                  {r.ownerName}
                  {r.isYou && <span className="you-tag">you</span>}
                </td>
                <td>
                  {r.wins}-{r.losses}
                  {r.ties ? `-${r.ties}` : ""}
                </td>
                <td>{r.pointsFor.toFixed(1)}</td>
                <td>{r.pointsAgainst.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Async>
  );
}

export function Matchups({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.matchups(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(matchups) => {
        const byGame = new Map<number, Matchup[]>();
        for (const m of matchups) {
          const g = byGame.get(m.matchupId) ?? [];
          g.push(m);
          byGame.set(m.matchupId, g);
        }
        const games = [...byGame.values()];
        if (!games.length) return <p className="muted">No matchups for this week yet.</p>;
        return (
          <div className="matchups">
            {games.map((sides, i) => (
              <div key={i} className="matchup">
                {sides.map((s) => (
                  <div key={s.rosterId} className={`side ${s.isYou ? "you" : ""}`}>
                    <span className="mname">
                      {s.ownerName}
                      {s.isYou && <span className="you-tag">you</span>}
                    </span>
                    <span className="mscore">{s.points.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      }}
    </Async>
  );
}

const AUDIT_ICON: Record<string, string> = {
  proposed: "📝",
  executed: "✅",
  rejected: "🛑",
  failed: "⚠️",
};

export function Audit({ leagueId }: { leagueId: string }) {
  const state = useAsync(() => api.audit(leagueId), [leagueId]);
  return (
    <Async state={state}>
      {(events) =>
        !events.length ? (
          <p className="muted">No actions recorded yet — this is where you’ll see what SleepBot did.</p>
        ) : (
          <ul className="audit">
            {events.map((e) => (
              <li key={e.id} className={`audit-${e.type}`}>
                <span className="audit-icon">{AUDIT_ICON[e.type] ?? "•"}</span>
                <div>
                  <div className="audit-summary">{e.summary}</div>
                  <div className="muted small">
                    {new Date(e.at).toLocaleString()} · by {e.actor}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      }
    </Async>
  );
}
