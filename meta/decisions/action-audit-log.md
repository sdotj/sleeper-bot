---
id: dec.action-audit-log
nodes:
  - sleepbot.audit
status: accepted
date: 2026-08-26
---
# Action Audit Log

## Context

The bot may act while the user is away (especially in `auto` mode), and a
Phase-3 UI should show "what SleepBot did." We need a durable record of every
action's lifecycle. The stateless-server principle forbids reliance on
local-machine-only state, so persistence must survive a cloud redeploy.

## Decision

The `audit` module keeps an append-only log of every action's lifecycle event —
`proposed`, `executed`, `rejected` — each with timestamp, actor (user/rule/auto),
rule verdicts, and the action payload. Both the audit log and the pending-action
store persist through a single `Store` interface. The initial implementation is
a JSON-file store for local development; a hosted-DB implementation swaps in for
cloud as a deploy change, not a rewrite.

## Rationale

Append-only gives a trustworthy history that later events never mutate. A
`Store` seam honors the stateless-server principle: nothing in the code assumes
a local disk, so moving to a real database is a configuration/implementation
swap. JSON-file first keeps local iteration fast before any infra exists.

## Consequences

- The `Store` interface is the single persistence boundary for both pending
  actions and audit events.
- The JSON-file implementation is explicitly a dev default; a note flags that a
  cloud deploy must supply a durable, concurrent-safe store.
- Audit records are read by the Phase-3 UI, so their shape is treated as a
  consumed contract.
