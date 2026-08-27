---
id: dec.platform-agnostic-core
nodes:
  - sleepbot.adapters.interface
  - sleepbot.adapters.sleeper
  - sleepbot.sleeper-api
status: accepted
date: 2026-08-26
---
# Platform-agnostic League Core

## Context

SleepBot starts on Sleeper but must extend to ESPN and other platforms without
rewriting tools, rules, the GUI, or the chat loop. Each platform has its own
API shapes, ids, and auth; that variation must not leak upward.

## Decision

Every consumer talks to a single `LeagueAdapter` interface
(`sleepbot.adapters.interface`), never to a platform SDK directly. Each platform
provides one implementation — `SleeperAdapter` (`sleepbot.adapters.sleeper`)
today — that normalizes the platform's data into the interface's domain types.
The external Sleeper HTTP API (`sleepbot.sleeper-api`) is reached only from
inside the Sleeper adapter (its public read client and its unofficial private
write client).

## Rationale

One interface is the seam that makes "add a platform" additive: a new adapter
implements the same methods and every downstream layer is untouched. Keeping all
Sleeper-specific quirks (numeric roster ids, points-as-whole+decimal, the
private GraphQL write path) inside the adapter means the rest of the codebase
reasons only about normalized types.

## Consequences

- New platforms slot in as a sibling adapter module + a `platform` config value;
  no tool/rules/GUI changes (see Phase 4 ESPN).
- The interface is a consumed contract; changing it ripples to every front-end,
  so it changes deliberately.
- The Sleeper actor covers both public reads and the unofficial private writes
  (see `dec.sleeper-session-auth`).
