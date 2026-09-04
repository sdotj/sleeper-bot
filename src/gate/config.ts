/**
 * Login-gate configuration, read from the server environment (dec.api-auth-gate).
 *
 * The gate is **enabled only when fully configured** — a username, a scrypt
 * password hash, and a JWT signing secret. This mirrors how the rest of the app
 * degrades: unset ⇒ off (frictionless on a laptop), set ⇒ enforced. A public
 * deploy (`--allow-unauthenticated`) MUST set all three; `docs/deploy.md` says so.
 */
export interface GateConfig {
  enabled: boolean;
  /** True when SOME but not all vars are set — a likely misconfiguration to warn about. */
  partial: boolean;
  username: string;
  passwordHash: string;
  secret: string;
  /** jsonwebtoken-style TTL string, e.g. "7d", "12h". */
  ttl: string;
}

export function loadGateConfig(env: NodeJS.ProcessEnv = process.env): GateConfig {
  const username = env.SLEEPBOT_AUTH_USER?.trim() ?? "";
  const passwordHash = env.SLEEPBOT_AUTH_PASSWORD_HASH?.trim() ?? "";
  const secret = env.SLEEPBOT_JWT_SECRET?.trim() ?? "";
  const set = [username, passwordHash, secret].filter(Boolean).length;
  return {
    enabled: set === 3,
    partial: set > 0 && set < 3,
    username,
    passwordHash,
    secret,
    ttl: env.SLEEPBOT_AUTH_TTL?.trim() || "7d",
  };
}
