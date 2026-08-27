---
id: dec.sleeper-session-auth
nodes:
  - sleepbot.auth
status: accepted
date: 2026-08-26
revisit_triggers:
  - "If Sleeper publishes an official write API with OAuth"
  - "If Sleeper's session/refresh-token mechanics change"
---
# Sleeper Session Auth

## Context

Sleeper has no official write API. Trades, waiver claims, and add/drops go
through Sleeper's unofficial private app API, which requires a session token
captured from a logged-in session. The goal is a bot that runs continuously on
a cloud server and recovers from auth failure on its own where it safely can.

Fully autonomous re-auth (the server logging in with the user's password and
defeating any bot-detection / 2FA) is explicitly out of scope: it means handling
raw credentials and bypassing bot mitigation, which is unsafe and against
Sleeper's terms. It is also fragile.

## Decision

The `auth` module owns Sleeper session credentials behind a swappable
`SessionProvider` interface. On a write it detects expiry (HTTP 401); if a
token-refresh exchange is available it refreshes automatically (a token swap,
not a password login) and retries. If the session is unrecoverable, the server
enters a `needs-reauth` state: **writes pause, reads keep working, and the user
is notified** (Phase 3 UI / push) to supply a fresh token. No password
automation, ever.

## Rationale

This delivers the practical intent — a 24/7 bot that self-heals — without
crossing the credential/bot-detection line. Reads never depend on auth, so the
read tools stay up regardless. Failing safe (pause + notify) is strictly better
than silent breakage or risky auto-login. The `SessionProvider` seam means if
Sleeper's refresh mechanics turn out to support longer-lived automation, we swap
the provider without touching callers.

## Consequences

- Tokens live in a secret store / env, never in committed config (`env:` refs).
- The write path must surface a typed `needs-reauth` error the tools translate
  into a clear, actionable message.
- A notification channel is required for the fail-safe path (stubbed until
  Phase 3).
- Writes remain best-effort against an unofficial API and may break if Sleeper
  changes it; this is documented at the call site.

## Update (2026-08-26): implementation reality

Wired against Sleeper's private GraphQL API (`https://sleeper.com/graphql`),
protocol per cameron-eth/sleeper-sdk. Two facts refined the design:

- **The token is a JWT.** We decode its `exp` up front, so `needs-reauth` is
  flagged *before* a doomed write, not only after one — better than the
  reactive-only plan.
- **There is no refresh endpoint.** Recovery is always a manual re-capture, so
  the "refresh where safe" branch is effectively unused for Sleeper; the
  fail-safe (`markInvalid` → pause writes, notify) is the real path.
- The live endpoint returns auth failures as a bare message ("Your token is
  invalid.") with no `code`, so auth-error detection matches on message too.
- `SLEEPER_TOKEN` is the env var (ecosystem convention); `get_auth_status`
  surfaces state + expiry. Some regions may need a VPN to reach the endpoint —
  reported as a plain network error, never worked around.
