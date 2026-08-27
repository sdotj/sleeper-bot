---
id: dec.rules-engine-and-value
nodes:
  - sleepbot.value
  - sleepbot.rules
status: accepted
date: 2026-08-26
revisit_triggers:
  - "When a real player-value source (web/stats/expert consensus) is integrated"
---
# Rules Engine and Player Value

## Context

The user wants configurable guardrails on write actions — e.g. "never trade
Ja'Marr Chase, everything else is fair game" — and the ability to run either
fully hands-off (rules still enforced) or approving each action. Some rules
(fairness) need a notion of player value; the user is comfortable with value
starting generic and improving over time.

## Decision

Rules live in `rules.json` and are evaluated against every proposed action.
Three rule kinds:

- **protect** — hard block: never trade/drop a named player. Needs no value data.
- **warn** — flag (does not block): e.g. a trade with a large value differential.
- and a global **mode** (`manual` | `auto`) governing whether passing actions may
  auto-execute (see `dec.write-action-pipeline`).

Player value is provided by the `value` module behind a `ValueProvider`
interface. The initial implementation is deliberately generic (a blend of
Sleeper trending/ADP plus a static rankings file). It is swappable for richer
web/stats/expert sources later without touching the rules engine.

## Rationale

Protect rules deliver the headline use case ("never trade Chase") with zero
dependency on a value source, so they work on day one. Warn rules degrade
gracefully when value is rough. Putting value behind an interface keeps the
rules engine stable while the value source evolves. A rule can only restrict or
(opt-in) pre-approve — never widen what the human could already do.

## Consequences

- `rules` depends on `value` (warn rules) and on the adapter interface (to read
  league state, e.g. positional rank).
- Early warn-rule output is only as good as the generic value source; this is
  expected and flagged to the user.
- The rules config schema is versioned so rule kinds can be added later.
