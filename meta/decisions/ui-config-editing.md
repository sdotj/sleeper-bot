---
id: dec.ui-config-editing
nodes:
  - sleepbot.crypto
  - sleepbot.core
  - sleepbot.config
  - sleepbot.gui
status: accepted
date: 2026-09-04
revisit_triggers:
  - "If a second UI-editable secret is added (Anthropic key, Telegram token) — extend the same encrypted-store pattern"
  - "If the deploy becomes multi-instance (config reload is in-process; would need a cross-instance signal)"
  - "If editing bootstrap secrets (JWT/INTERNAL/SECRET_KEY, DATABASE_URL) is ever wanted — currently deliberately out"
---
# Editing config & the Sleeper token from the UI

## Context

Config and secrets are read once from env/file at process start
(dec.gui-architecture, dec.sleeper-session-auth). On Cloud Run the filesystem is
ephemeral and env vars are frozen at container start, and Secret Manager values
are only re-read on a new revision — so nothing edited at runtime survives a
cold start. Yet the operator wants to add/remove leagues, change league settings,
and — the recurring pain — paste a fresh **Sleeper write token** when the old one
expires, without a redeploy.

## Decision

Make the **database the source of truth for editable state**, since it's the only
durable, runtime-writable place. A settings panel (behind the login gate) edits it.

- **Leagues config → the store.** `ConfigRegistry` becomes mutable
  (`applyConfig`) and validates via the existing `configSchema`. On boot the core
  **reconciles**: adopt `config/current` from the store if present, else seed it
  from the env/file config. **Store-authoritative after that first seed** — a
  redeploy with a stale `SLEEPBOT_CONFIG_JSON` can't clobber UI edits; a "Reset to
  env" action is the escape hatch. `saveConfig` validates → persists → adopts live
  and clears the per-league adapter cache, so edits apply with no restart. The
  agent reads config fresh each sweep, so autonomy/enable edits land next sweep
  (0→1 enabled still needs a restart, since the agent isn't started otherwise).
- **Sleeper token → the store, encrypted.** A new `crypto` module (AES-256-GCM,
  key from bootstrap `SLEEPBOT_SECRET_KEY`) seals the token; a DB dump alone can't
  reveal it. Env `SLEEPER_TOKEN` is the seed; a stored value supersedes it. All
  leagues now share ONE `SleeperSessionProvider` (a single account credential), so
  a saved token applies everywhere at once and `setToken` clears `needs-reauth`
  immediately. If `SLEEPBOT_SECRET_KEY` is unset, storing is disabled and the app
  falls back to env (degrade-when-unset, like the login gate).
- **HTTP surface.** `GET/PUT /api/config`, `POST /api/config/reset`,
  `GET/PUT/DELETE /api/secrets/sleeper`. The token endpoints return **status only**
  (state, source, masked) — the token is never echoed back.

## Rationale

The store is the only thing that persists a runtime edit on scale-to-zero, so
"config in the DB, env as seed" is the natural shape — and it's the same
store-backed mutable state chat-history/memory will need, so it's built first.
Writing the token to our own encrypted store (not Secret Manager) is what makes
hot-rotation actually work: Secret Manager is immutable-versioned, needs the
runtime SA to hold `secretmanager.versions.add`, and wouldn't take effect live
anyway. Bootstrap/trust-anchor secrets (`DATABASE_URL`, `SLEEPBOT_JWT_SECRET`,
`SLEEPBOT_INTERNAL_SECRET`, `SLEEPBOT_SECRET_KEY`) stay env-only — editing them
from the UI is impossible (the DB URL) or a lockout/self-compromise risk.

## Consequences

- New bootstrap secret `SLEEPBOT_SECRET_KEY` (32 bytes); unset ⇒ token field is
  read-only. New dep-free `crypto` module + `npm run gen-secret-key`.
- `buildAppContext` gains a `reload`/`saveConfig`/`setSleeperToken`/… surface and
  an injectable store (for tests). Sessions are now shared per-account, not
  per-league.
- Config edits and token changes are NOT written to the action audit log (its
  shape is action-scoped); the token record carries an `updatedAt`, and changes
  log a redacted server line. A dedicated settings-audit trail is a later option.
- Single-instance reload only; multi-instance would need a cross-instance signal.
