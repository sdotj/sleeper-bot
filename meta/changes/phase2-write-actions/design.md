# Design: phase2-write-actions

## Approach

Every write flows through one confirm-by-default pipeline: a `propose_*` tool
builds a draft `ProposedAction`, the `rules` engine evaluates it (protect =
block, warn = flag) consulting `value` for fairness, the result is recorded in
`audit` and, if not blocked, stored pending in the `actions` store. Nothing is
sent. `execute_action(actionId)` performs the write via the platform adapter
after an explicit signal (default `manual` mode) — re-validating rules at
execution time. The Sleeper write client obtains its session credential from
`auth`, which refreshes where safe and otherwise enters `needs-reauth` (writes
pause, reads stay live, user notified). Persistence for both the pending store
and the audit log sits behind a single `Store` interface (JSON-file impl now,
hosted DB later).

Rationale for each piece is recorded in the paired decisions:
`dec.write-action-pipeline`, `dec.rules-engine-and-value`,
`dec.action-audit-log`, `dec.sleeper-session-auth`.

## Changes

ADDED:
- `sleepbot.actions` — ProposedAction model, pending store, execute pipeline
- `sleepbot.value` — pluggable ValueProvider (generic to start)
- `sleepbot.audit` — append-only action log + Store interface
- `sleepbot.auth` — Sleeper session provider with refresh + fail-safe
- decisions pointer (`meta/decisions`) declared on the system node

MODIFIED:
- `sleepbot.rules` — grows from stub to a real block/warn/mode engine
- `sleepbot.adapters.interface` — gains write methods (WriteableLeagueAdapter)
- `sleepbot.adapters.sleeper` — adds the unofficial write client
- `sleepbot.tools` — adds propose_*/execute_action/list_pending_actions tools

REMOVED:
- (none)

RENAMED:
- (none)
