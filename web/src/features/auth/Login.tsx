import { useState } from "react";
import { login } from "../../lib/auth";
import { Button, TextInput } from "../../components/ui";

/**
 * Full-screen login gate (dec.api-auth-gate). Shown when the API reports that a
 * token is required (or after logout). On success the auth store flips and the
 * app remounts with the bearer token attached to every call.
 */
export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-lg"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">🏈</span>
          <h1 className="text-lg font-bold tracking-tight">SleepBot</h1>
        </div>
        <p className="text-sm text-muted">Sign in to continue.</p>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Username</span>
          <TextInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
            className="w-full"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Password</span>
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full"
          />
        </label>

        {error && <p className="text-sm text-danger">⚠ {error}</p>}

        <Button type="submit" variant="primary" disabled={busy || !username.trim() || !password} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
