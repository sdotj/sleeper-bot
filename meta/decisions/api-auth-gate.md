---
id: dec.api-auth-gate
nodes:
  - sleepbot.gate
  - sleepbot.api
status: accepted
date: 2026-09-04
revisit_triggers:
  - "If more than one user needs access (move from one predetermined login to a user store)"
  - "If tokens need server-side revocation (add a deny-list / short TTL + refresh)"
  - "If the browser threat model tightens (move the token from localStorage to an httpOnly cookie + CSRF)"
---
# HTTP API Login Gate

## Context

A public Cloud Run deploy needs `--allow-unauthenticated` because Telegram
webhooks can't send Google OIDC (dec.telegram-notifications). That leaves the
GUI and `/api/chat` — which spends the Anthropic budget — openly reachable. This
is a single-operator app, so it needs one thing: a login in front of the whole
HTTP surface, enforced server-side.

## Decision

Add a `gate` module: a single **predetermined username + password**, verified
server-side, that mints a **JWT** the browser sends as `Authorization: Bearer`
on every call.

- **Credentials.** The password is stored as a **scrypt hash** in
  `SLEEPBOT_AUTH_PASSWORD_HASH` (never the raw password), alongside
  `SLEEPBOT_AUTH_USER` and a signing secret `SLEEPBOT_JWT_SECRET`. A
  `npm run hash-password` CLI produces the hash. Password check is constant-time;
  the username is compared constant-time too and the password is always hashed
  even on a bad username, so timing doesn't reveal which was wrong.
- **Tokens.** `@fastify/jwt` (HS256) signs a `{ sub }` token on `POST /api/login`
  with TTL `SLEEPBOT_AUTH_TTL` (default 7d). An `onRequest` guard calls
  `jwtVerify()` on every route except the public set: `GET /api/health`,
  `POST /api/login`, the static GUI / SPA fallback (so the login page loads), and
  `/internal/*` (which carry their own `SLEEPBOT_INTERNAL_SECRET`).
- **Enabled only when configured.** All three vars set ⇒ enforced; unset ⇒ the
  API is open (frictionless localhost), logged loudly. A public deploy MUST set
  them (`docs/deploy.md`).
- **Client.** The token lives in `localStorage` and rides on every fetch. A 401
  carrying `code: "auth_required"` (distinct from a Sleeper-token reauth 401)
  sends the SPA back to a full-screen login; on success the app remounts and
  refetches with the token. A Log out button clears it.

## Rationale

One user, one login is the smallest thing that closes the open-surface hole.
scrypt over plaintext so a leaked secret yields only a slow-to-brute hash, not a
reusable password (the more secure of the two options weighed). `@fastify/jwt`
over a hand-rolled signer to avoid owning auth crypto. localStorage + bearer over
an httpOnly cookie because it fits the existing fetch client with no CSRF
plumbing, and this app renders no untrusted HTML (low XSS surface). The gate is
opt-in-by-config so local dev stays zero-friction while the cloud deploy is
safe — the same degrade-when-unset pattern the agent and chat already use.

## Consequences

- `api` depends on `gate`; `buildApiServer` is now async (registers the plugin
  before routes so its guard covers them).
- New env: `SLEEPBOT_AUTH_USER`, `SLEEPBOT_AUTH_PASSWORD_HASH`,
  `SLEEPBOT_JWT_SECRET`, optional `SLEEPBOT_AUTH_TTL`. New dep `@fastify/jwt`.
- No server-side session store: a token is valid until it expires. Rotating
  `SLEEPBOT_JWT_SECRET` invalidates all outstanding tokens (the revocation lever).
- Single user only; multi-user or token revocation are the revisit triggers.
- The `/internal/*` secret and this login secret are separate concerns and stay
  separate.
