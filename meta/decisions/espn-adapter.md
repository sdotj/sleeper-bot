---
id: dec.espn-adapter
nodes:
  - sleepbot.adapters.espn
  - sleepbot.espn-api
status: accepted
date: 2026-09-07
revisit_triggers:
  - "If ESPN writes are wanted (their write API is undocumented + CSRF-protected — a separate effort)"
  - "If cross-platform drafts are wanted (the draft assistant's values are Sleeper-id / KeepTradeCut-based)"
  - "If ESPN's read host or view/cookie protocol changes (it is unofficial)"
---
# ESPN Adapter (read-only)

## Context

The platform-agnostic `LeagueAdapter` (dec.platform-agnostic-core) was designed
so a second platform is a new adapter, not a rewrite. ESPN is the last roadmap
platform. Its fantasy API is unofficial: one big league object fetched from
`lm-api-reads.fantasy.espn.com` with `view=` params, and private leagues
authenticate with the `SWID` + `espn_s2` cookies.

## Decision

Add `EspnAdapter` implementing the same `LeagueAdapter` contract, with an
injectable `EspnClient` (the test seam), mirroring the Sleeper structure. It is
**read-only**:

- **Supported:** league info, rosters, my roster, standings, matchups,
  transactions, player search, and trending (approximated from ESPN's ownership
  `percentChange`, since ESPN has no Sleeper-style trending feed).
- **Identity:** "your team" is the one whose `owners` contains the configured
  **SWID** (the same cookie that authorizes a private league) — ESPN has no
  username. Config's `espn.swid` / `espn.espnS2` are optional (public leagues
  need neither) and support `env:VAR`. Season defaults to the current NFL season,
  overridable via `espn.season`.
- **Deferred → `EspnUnsupportedError`:** drafts (the draft assistant ranks by
  Sleeper ids / KeepTradeCut values, which don't map to ESPN) and all writes.
  `writeAuthStatus` reports `needs-reauth`.

ESPN's numeric position / pro-team / lineup-slot ids are normalized in
`espnMaps.ts`; everything above the adapter still sees only the neutral types.

## Rationale

Read-only covers the real value — viewing an ESPN league and getting chat /
analysis over it — without taking on ESPN's fragile, undocumented write path or
forcing the Sleeper-specific draft-value model onto a platform it doesn't fit.
Making the unsupported methods throw a *clear* error (rather than returning empty
or half-working data) keeps the failure honest for tools and the GUI. Injecting
the client means the whole adapter is unit-tested against fixtures — no ESPN
account or network — exactly like the Sleeper adapter.

## Consequences

- `espn.swid` / `espn.espnS2` became optional in the config schema; `espn.season`
  was added. `core` builds `EspnAdapter` for `platform: "espn"` leagues.
- A league on ESPN gets reads + chat immediately; anything under drafts or writes
  surfaces `EspnUnsupportedError` until those are built.
- Live verification needs a real ESPN league id (+ cookies for a private one);
  the fixture tests prove the normalization independently.
