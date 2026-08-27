# Proposal: phase2-write-actions

## Motivation

Phase 1 is read-only. Phase 2 adds the ability to act on a league — propose
trades, waiver claims, and add/drops — under strict confirm-by-default control,
with user-configurable guardrails and a durable record of everything the bot
does. This is the foundation for a bot that can eventually run unattended in the
cloud.

## Scope

- Proposed-action model + pending-action store + confirm-then-execute pipeline
  (`sleepbot.actions`), default operating mode `manual`.
- Rules engine with protect/warn rules and a global mode (`sleepbot.rules`).
- Pluggable, initially-generic player value provider (`sleepbot.value`).
- Append-only audit log of proposed/executed/rejected actions, behind a `Store`
  interface with a JSON-file implementation (`sleepbot.audit`).
- Sleeper session-credential handling with refresh-where-safe and a fail-safe
  `needs-reauth` state (`sleepbot.auth`).
- Write methods on the adapter interface + a Sleeper write client.

## Out of scope

- Automated password login / bot-detection bypass (explicitly excluded — see
  `dec.sleeper-session-auth`).
- A real web/stats player-value source (generic to start; swapped later).
- The Phase 3 GUI and the notification transport for `needs-reauth` (stubbed).
- ESPN writes (Phase 4).
