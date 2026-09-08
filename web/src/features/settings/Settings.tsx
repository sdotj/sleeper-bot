import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type {
  AgentStatus,
  AgentSweepResult,
  LeagueConfig,
  MemoryNote,
  SleepBotConfigDoc,
  SleeperTokenStatus,
} from "../../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Select,
  TextInput,
} from "../../components/ui";

/**
 * Settings panel (dec.ui-config-editing): edit the leagues config and the
 * Sleeper write token, both persisted server-side (config in the DB, token
 * encrypted). Everything here is behind the login gate.
 */
export function Settings() {
  return (
    <div className="settings-view space-y-[22px]">
      <LeaguesEditor />
      <AgentPanel />
      <SleeperTokenPanel />
      <MemoryPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Autonomous manager (manual check)
// ---------------------------------------------------------------------------

function AgentPanel() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentSweepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setStatus(await api.agentStatus());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  async function runCheck() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.agentSweep());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const on = status?.enabled;
  return (
    <Card>
      <CardHeader
        title="Autonomous manager"
        right={
          status && (
            <Badge variant={on ? "ok" : "neutral"}>
              {on ? `on · ${status.mode ?? "?"}` : "off"}
            </Badge>
          )
        }
      />
      <div className="space-y-3 p-[18px]">
        <p className="text-sm text-muted">
          Run a one-off check now: the manager scans your enabled leagues and
          sends proposals to Telegram with Approve / Deny. You get a summary
          either way.
        </p>
        {error && <p className="text-sm text-danger">⚠ {error}</p>}

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={runCheck} disabled={busy || !on}>
            {busy ? "Checking… (~30s)" : "Run a check now"}
          </Button>
          {busy && (
            <span className="text-xs text-faint">
              Reasoning over your roster…
            </span>
          )}
        </div>

        {!on && status && (
          <p className="text-sm text-warn">
            The manager is off. It needs Telegram (bot token + chat id), an
            Anthropic key, and at least one league with the agent enabled (set
            that per league above).
          </p>
        )}

        {result && !result.ran && (
          <p className="text-sm text-warn">{result.reason}</p>
        )}
        {result?.ran && (
          <div className="text-sm text-muted">
            {result.total ? (
              <p className="text-ok">
                Sent {result.total} proposal{result.total === 1 ? "" : "s"} to
                Telegram. Check your chat.
              </p>
            ) : (
              <p>
                Swept {result.leagues?.length ?? 0} league(s) — nothing worth
                proposing right now. (Sent a summary to Telegram.)
              </p>
            )}
            <ul className="mt-1 space-y-0.5 text-xs text-faint">
              {result.leagues?.map((l) => (
                <li key={l.id}>
                  {l.id}: {l.recommended} rec{l.recommended === 1 ? "" : "s"}
                  {l.skipped ? ` · skipped (${l.skipped})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Assistant memory
// ---------------------------------------------------------------------------

function MemoryPanel() {
  const [notes, setNotes] = useState<MemoryNote[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setError(null);
    try {
      setNotes(await api.memory());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function add() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      await api.addMemory(t);
      setText("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteMemory(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Assistant memory"
        right={
          notes ? (
            <Badge>
              {notes.length} note{notes.length === 1 ? "" : "s"}
            </Badge>
          ) : null
        }
      />
      <div className="space-y-3 p-[18px]">
        <p className="text-sm text-muted">
          Durable facts the assistant applies in every chat. It adds these when
          you say “remember that…”, or add your own.
        </p>
        {error && <p className="text-sm text-danger">⚠ {error}</p>}

        {notes?.length === 0 && (
          <p className="text-sm text-faint">No memory yet.</p>
        )}
        <ul className="space-y-1.5">
          {notes?.map((n) => (
            <li
              key={n.id}
              className="group flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm"
            >
              <span className="flex-1">{n.text}</span>
              {n.source === "model" && <Badge variant="accent">auto</Badge>}
              <button
                className="text-faint hover:text-danger"
                onClick={() => void remove(n.id)}
                title="Forget"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <label className="block flex-1 space-y-1">
            <span className="sr-only">Add a note</span>
            <TextInput
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                }
              }}
              placeholder="Add a note…"
              disabled={busy}
              className="w-full"
            />
          </label>
          <Button
            variant="primary"
            onClick={add}
            disabled={busy || !text.trim()}
          >
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

function LeaguesEditor() {
  const [leagues, setLeagues] = useState<LeagueConfig[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setError(null);
    try {
      const doc = await api.config();
      setLeagues(doc.leagues);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function patch(i: number, next: Partial<LeagueConfig>) {
    setLeagues(
      (ls) => ls && ls.map((l, idx) => (idx === i ? { ...l, ...next } : l)),
    );
    setSaved(false);
  }
  function patchSleeper(
    i: number,
    next: Partial<NonNullable<LeagueConfig["sleeper"]>>,
  ) {
    setLeagues(
      (ls) =>
        ls &&
        ls.map((l, idx) =>
          idx === i
            ? { ...l, sleeper: { leagueId: "", ...l.sleeper, ...next } }
            : l,
        ),
    );
    setSaved(false);
  }
  function patchAgent(
    i: number,
    next: Partial<NonNullable<LeagueConfig["agent"]>>,
  ) {
    setLeagues(
      (ls) =>
        ls &&
        ls.map((l, idx) =>
          idx === i
            ? {
                ...l,
                agent: {
                  enabled: false,
                  autonomy: "manual",
                  ...l.agent,
                  ...next,
                },
              }
            : l,
        ),
    );
    setSaved(false);
  }
  function addLeague() {
    setLeagues((ls) => [
      ...(ls ?? []),
      {
        id: "",
        platform: "sleeper",
        sleeper: { leagueId: "", username: "" },
        valueMode: "redraft",
      },
    ]);
    setSaved(false);
  }
  function removeLeague(i: number) {
    setLeagues((ls) => ls && ls.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  async function save() {
    if (!leagues) return;
    setBusy(true);
    setError(null);
    try {
      const doc: SleepBotConfigDoc = { leagues };
      const persisted = await api.saveConfig(doc);
      setLeagues(persisted.leagues);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetToEnv() {
    if (
      !confirm(
        "Discard the stored config and reload it from the server's environment?",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const doc = await api.resetConfig();
      setLeagues(doc.leagues);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Leagues"
        right={
          <div className="flex items-center gap-2">
            {saved && <Badge variant="ok">saved</Badge>}
            <Button onClick={addLeague} disabled={busy}>
              + Add league
            </Button>
          </div>
        }
      />
      <div className="space-y-[14px] p-[18px]">
        {error && <p className="text-sm text-danger">⚠ {error}</p>}
        {leagues == null && !error && (
          <p className="text-sm text-muted">Loading…</p>
        )}
        {leagues?.length === 0 && (
          <p className="text-sm text-muted">No leagues yet — add one.</p>
        )}

        {leagues?.map((l, i) => (
          <div
            key={i}
            className="space-y-3 rounded-[10px] border border-border bg-surface-2 p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-[0.64rem] font-semibold uppercase tracking-[0.09em] text-faint">
                League {i + 1}
              </span>
              <Button
                onClick={() => removeLeague(i)}
                disabled={busy}
                className="h-auto! border-0! bg-transparent! p-0! text-danger!"
              >
                Remove
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Label (your own id)">
                <TextInput
                  value={l.id}
                  onChange={(e) => patch(i, { id: e.target.value })}
                  placeholder="my-main-league"
                  className="w-full"
                />
              </Field>
              <Field label="Sleeper league id">
                <TextInput
                  value={l.sleeper?.leagueId ?? ""}
                  onChange={(e) =>
                    patchSleeper(i, { leagueId: e.target.value })
                  }
                  placeholder="1234567890"
                  className="w-full"
                />
              </Field>
              <Field label="Sleeper username">
                <TextInput
                  value={l.sleeper?.username ?? ""}
                  onChange={(e) =>
                    patchSleeper(i, { username: e.target.value })
                  }
                  placeholder="your-handle"
                  className="w-full"
                />
              </Field>
              <Field label="Value mode">
                <Select
                  value={l.valueMode}
                  onChange={(e) =>
                    patch(i, {
                      valueMode: e.target.value as LeagueConfig["valueMode"],
                    })
                  }
                  className="w-full"
                >
                  <option value="redraft">redraft (Sleeper ranks)</option>
                  <option value="dynasty">dynasty (KeepTradeCut)</option>
                </Select>
              </Field>
              <Field label="Autonomous agent">
                <Select
                  value={l.agent?.enabled ? "on" : "off"}
                  onChange={(e) =>
                    patchAgent(i, { enabled: e.target.value === "on" })
                  }
                  className="w-full"
                >
                  <option value="off">off</option>
                  <option value="on">on</option>
                </Select>
              </Field>
              <Field label="Autonomy">
                <Select
                  value={l.agent?.autonomy ?? "manual"}
                  onChange={(e) =>
                    patchAgent(i, {
                      autonomy: e.target.value as "manual" | "auto",
                    })
                  }
                  className="w-full"
                  disabled={!l.agent?.enabled}
                >
                  <option value="manual">manual (approve every action)</option>
                  <option value="auto">
                    auto (clean actions auto-execute)
                  </option>
                </Select>
              </Field>
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="primary"
            onClick={save}
            disabled={busy || leagues == null}
          >
            {busy ? "Saving…" : "Save leagues"}
          </Button>
          <Button onClick={resetToEnv} disabled={busy}>
            Reset to env config
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sleeper write token
// ---------------------------------------------------------------------------

function SleeperTokenPanel() {
  const [status, setStatus] = useState<SleeperTokenStatus | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setError(null);
    try {
      setStatus(await api.sleeperToken());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      setStatus(await api.setSleeperToken(token.trim()));
      setToken("");
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (
      !confirm(
        "Remove the stored Sleeper token and revert to the server's env token (if any)?",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.clearSleeperToken());
      setSaved(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ok = status?.state === "ok";
  const days =
    status?.secondsRemaining && status.secondsRemaining > 0
      ? Math.floor(status.secondsRemaining / 86400)
      : null;

  return (
    <Card>
      <CardHeader
        title="Sleeper write access"
        right={
          status && (
            <Badge variant={ok ? "ok" : "warn"}>
              {ok ? "writes ready" : "needs-reauth"}
              {status.source !== "none" ? ` · ${status.source}` : ""}
            </Badge>
          )
        }
      />
      <div className="space-y-3 p-[18px]">
        {error && <p className="text-sm text-danger">⚠ {error}</p>}
        {status && (
          <p className="text-sm text-muted">
            {status.state === "ok" ? (
              <>
                Token active{status.user ? ` for ${status.user}` : ""}
                {days != null
                  ? ` · expires in ~${days} day${days === 1 ? "" : "s"}`
                  : ""}
                .
              </>
            ) : (
              <>
                No usable token — writes are paused (reads still work). Paste a
                fresh token below.
              </>
            )}
          </p>
        )}

        {status && !status.editable && (
          <p className="text-sm text-warn">
            Saving secrets is disabled: set{" "}
            <code className="text-text">SLEEPBOT_SECRET_KEY</code> on the server
            (and redeploy) to store the token from here.
          </p>
        )}

        <div className="flex items-end gap-2">
          <label className="block flex-1 space-y-1">
            <span className="sr-only">New Sleeper token</span>
            <TextInput
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJ…"
              autoComplete="off"
              disabled={busy || !status?.editable}
              className="w-full font-mono"
            />
          </label>
          <Button
            variant="primary"
            onClick={save}
            disabled={busy || !token.trim() || !status?.editable}
          >
            {busy ? "Saving…" : "Save token"}
          </Button>
          {status?.source === "store" && (
            <Button onClick={clear} disabled={busy}>
              Clear
            </Button>
          )}
        </div>
        {saved && <Badge variant="ok">token updated</Badge>}
        <p className="text-xs text-faint">
          Capture it from a logged-in Sleeper session (DevTools → Network → any
          graphql request → copy the{" "}
          <code className="text-muted">authorization</code> header). Stored
          encrypted; applied immediately.
        </p>
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] leading-[13px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
