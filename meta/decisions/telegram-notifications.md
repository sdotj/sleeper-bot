---
id: dec.telegram-notifications
nodes:
  - sleepbot.notify
  - sleepbot.telegram-api
status: accepted
date: 2026-08-28
revisit_triggers:
  - "If we move from long-polling to a webhook (needs a stable public URL)"
  - "If more than one recipient / chat needs alerts"
---
# Telegram Notifications & Approvals

## Context

The autonomous agent proposes actions that (per the agreed policy) often need a
human decision. The user wants those pushed to their phone in real time with
one-tap approve / deny — and, when a rule blocks an action, the ability to
override it case-by-case (dec.autonomous-agent).

## Decision

The `notify` module is a Telegram bot (Bot API over HTTPS). For each proposal it
sends a message with inline buttons:

- allowed (maybe warned) → **Approve** / **Deny**
- rule-blocked → **Override & execute** / **Dismiss** (override is explicit and
  audited as such)
- executed automatically (auto mode, clean) → an informational message, no buttons

A **long-polling loop** (`getUpdates`) handles the button taps
(`callback_query`), calls the shared pipeline via `core` to execute or discard
the pending action, then edits the original message to show the outcome. The bot
token and the single allowed chat id come from env (`TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`); taps from any other chat are ignored. The HTTP transport is
injectable so the flow is unit-tested offline.

## Rationale

Long-polling works identically on a laptop and in the cloud with no public
webhook URL to manage — simplest thing that runs everywhere. Inline buttons give
true one-tap control; editing the message in place leaves a clean record in the
chat. Honoring only the configured chat id keeps a stray Telegram user from
driving your team. This is the human-in-the-loop channel that makes autonomous
operation safe.

## Consequences

- Requires `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`; without them the agent
  degrades to log-only (nothing is sent, nothing auto-executes that needed a tap).
- The poller runs in the always-on process; a webhook mode can be added later
  for efficiency at scale.
- callback_data carries the action id (fits Telegram's 64-byte limit).
