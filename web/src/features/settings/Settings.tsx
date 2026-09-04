import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { LeagueConfig, SleepBotConfigDoc, SleeperTokenStatus } from "../../lib/types";
import { Badge, Button, Card, CardHeader, Select, TextInput } from "../../components/ui";

/**
 * Settings panel (dec.ui-config-editing): edit the leagues config and the
 * Sleeper write token, both persisted server-side (config in the DB, token
 * encrypted). Everything here is behind the login gate.
 */
export function Settings() {
  return (
    <div className="space-y-5">
      <LeaguesEditor />
      <SleeperTokenPanel />
    </div>
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
    setLeagues((ls) => ls && ls.map((l, idx) => (idx === i ? { ...l, ...next } : l)));
    setSaved(false);
  }
  function patchSleeper(i: number, next: Partial<NonNullable<LeagueConfig["sleeper"]>>) {
    setLeagues(
      (ls) => ls && ls.map((l, idx) => (idx === i ? { ...l, sleeper: { leagueId: "", ...l.sleeper, ...next } } : l)),
    );
    setSaved(false);
  }
  function patchAgent(i: number, next: Partial<NonNullable<LeagueConfig["agent"]>>) {
    setLeagues(
      (ls) =>
        ls &&
        ls.map((l, idx) =>
          idx === i ? { ...l, agent: { enabled: false, autonomy: "manual", ...l.agent, ...next } } : l,
        ),
    );
    setSaved(false);
  }
  function addLeague() {
    setLeagues((ls) => [
      ...(ls ?? []),
      { id: "", platform: "sleeper", sleeper: { leagueId: "", username: "" }, valueMode: "redraft" },
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
    if (!confirm("Discard the stored config and reload it from the server's environment?")) return;
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
      <div className="space-y-4 p-5">
        {error && <p className="text-sm text-danger">⚠ {error}</p>}
        {leagues == null && !error && <p className="text-sm text-muted">Loading…</p>}
        {leagues?.length === 0 && <p className="text-sm text-muted">No leagues yet — add one.</p>}

        {leagues?.map((l, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-surface-2/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[0.64rem] font-semibold uppercase tracking-[0.09em] text-faint">
                League {i + 1}
              </span>
              <Button onClick={() => removeLeague(i)} disabled={busy} className="text-danger">
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
                  onChange={(e) => patchSleeper(i, { leagueId: e.target.value })}
                  placeholder="1234567890"
                  className="w-full"
                />
              </Field>
              <Field label="Sleeper username">
                <TextInput
                  value={l.sleeper?.username ?? ""}
                  onChange={(e) => patchSleeper(i, { username: e.target.value })}
                  placeholder="your-handle"
                  className="w-full"
                />
              </Field>
              <Field label="Value mode">
                <Select
                  value={l.valueMode}
                  onChange={(e) => patch(i, { valueMode: e.target.value as LeagueConfig["valueMode"] })}
                  className="w-full"
                >
                  <option value="redraft">redraft (Sleeper ranks)</option>
                  <option value="dynasty">dynasty (KeepTradeCut)</option>
                </Select>
              </Field>
              <Field label="Autonomous agent">
                <Select
                  value={l.agent?.enabled ? "on" : "off"}
                  onChange={(e) => patchAgent(i, { enabled: e.target.value === "on" })}
                  className="w-full"
                >
                  <option value="off">off</option>
                  <option value="on">on</option>
                </Select>
              </Field>
              <Field label="Autonomy (when agent on)">
                <Select
                  value={l.agent?.autonomy ?? "manual"}
                  onChange={(e) => patchAgent(i, { autonomy: e.target.value as "manual" | "auto" })}
                  className="w-full"
                  disabled={!l.agent?.enabled}
                >
                  <option value="manual">manual (approve every action)</option>
                  <option value="auto">auto (clean actions auto-execute)</option>
                </Select>
              </Field>
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <Button variant="primary" onClick={save} disabled={busy || leagues == null}>
            {busy ? "Saving…" : "Save leagues"}
          </Button>
          <Button onClick={resetToEnv} disabled={busy}>
            Reset to env config
          </Button>
        </div>
        <p className="text-xs text-faint">
          Saved to the database and applied live — no redeploy. “Reset to env” restores the config the
          server booted with (SLEEPBOT_CONFIG_JSON / config file).
        </p>
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
    if (!confirm("Remove the stored Sleeper token and revert to the server's env token (if any)?")) return;
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
      <div className="space-y-3 p-5">
        {error && <p className="text-sm text-danger">⚠ {error}</p>}
        {status && (
          <p className="text-sm text-muted">
            {status.state === "ok" ? (
              <>
                Token active{status.user ? ` for ${status.user}` : ""}
                {days != null ? ` · expires in ~${days} day${days === 1 ? "" : "s"}` : ""}.
              </>
            ) : (
              <>No usable token — writes are paused (reads still work). Paste a fresh token below.</>
            )}
          </p>
        )}

        {status && !status.editable && (
          <p className="text-sm text-warn">
            Saving secrets is disabled: set <code className="text-text">SLEEPBOT_SECRET_KEY</code> on the
            server (and redeploy) to store the token from here.
          </p>
        )}

        <div className="flex items-end gap-2">
          <label className="block flex-1 space-y-1">
            <span className="text-xs font-medium text-muted">New token (paste the Sleeper JWT)</span>
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
          <Button variant="primary" onClick={save} disabled={busy || !token.trim() || !status?.editable}>
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
          Capture it from a logged-in Sleeper session (DevTools → Network → any graphql request → copy
          the <code className="text-muted">authorization</code> header). Stored encrypted; applied
          immediately.
        </p>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
