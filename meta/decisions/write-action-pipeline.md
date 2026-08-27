---
id: dec.write-action-pipeline
nodes:
  - sleepbot.actions
status: accepted
date: 2026-08-26
---
# Write Action Pipeline

## Context

Phase 2 introduces state-changing actions (propose trade / waiver / add-drop).
The core principle is confirm-by-default: no action changes league state
silently. We need a single place that models a proposed action, evaluates it
against rules, holds it pending confirmation, and executes it on an explicit
signal.

## Decision

The `actions` module owns a `ProposedAction` model and a pending-action store.
Every `propose_*` tool builds a draft, runs it through the `rules` engine,
records it in `audit`, stores it (if not blocked), and returns
`{ actionId, draft, verdict, warnings }` — it never sends anything. A separate
`execute_action(actionId)` performs the write via the platform adapter after an
explicit signal. The default operating **mode is `manual`**: execution requires
that explicit call. An `auto` mode (opt-in) lets actions that pass every
block/protect rule execute without waiting, but is off by default.

## Rationale

Separating propose from execute is the mechanical embodiment of
confirm-by-default and keeps a human (or an explicit, audited rule) in the loop.
Routing every proposal through `rules` and `audit` before it can be stored means
there is no path to a write that skipped evaluation or logging. `manual` as the
default is the safe posture; `auto` is available for users who opt in with eyes
open.

## Consequences

- `execute_action` must re-validate against rules at execution time, not trust
  the proposal snapshot alone (rules or rosters may have changed).
- The pending store is real state and must be persisted (see
  `dec.action-audit-log`), not held in memory, so a cloud redeploy doesn't lose
  drafts.
- A rule never expands what the human could do manually; it only restricts or
  (opt-in) pre-approves.
