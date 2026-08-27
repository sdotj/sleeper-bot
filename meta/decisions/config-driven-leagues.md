---
id: dec.config-driven-leagues
nodes:
  - sleepbot.config
status: accepted
date: 2026-08-26
---
# Config-driven Leagues

## Context

SleepBot must support multiple leagues and platforms over time, and must never
commit secrets. It also needs to fail loudly on misconfiguration rather than
mid-request.

## Decision

Leagues live in a `leagues[]` array (`config/leagues.json`) from day one, even
with a single entry. Each entry has a user-chosen `id` label, a `platform`
discriminator, and a platform-specific block validated by a zod schema. Secrets
are referenced as `env:VAR_NAME` and resolved from the environment at load time,
never stored inline. A `ConfigRegistry` loads, validates, and resolves a league
label to its entry; unknown labels throw a helpful error listing valid ids.

## Rationale

The `leagues[]` array makes multi-league/multi-platform support a config edit,
not a code change — every tool takes a league label. Validating at load time
(with duplicate-id and platform/block-consistency checks) turns configuration
mistakes into clear startup errors. The `env:` indirection keeps tokens/cookies
out of version control while still being declarative.

## Consequences

- Adding a league or platform is appending an object; the tool interface is
  unchanged.
- `env:` references fail loudly at load when a variable is unset.
- Config is the one module every league-scoped operation resolves through.
