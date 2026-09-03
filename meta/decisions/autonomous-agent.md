---
id: dec.autonomous-agent
nodes:
  - sleepbot.agent
status: accepted
date: 2026-08-28
revisit_triggers:
  - "If the agent needs a smarter schedule (e.g. pre-waiver-deadline timing)"
  - "If trade proposals need a counterparty-value model beyond current heuristics"
---
# Autonomous Manager

## Context

The user wants a 24/7 cloud process that watches their league (rosters,
matchups, player news, waivers) and takes action — waiver adds, drops, and trade
proposals — with real-time approval over Telegram (dec.telegram-notifications).

## Decision

The `agent` module runs a scheduled **sweep** per agent-enabled league. Each
sweep runs **Claude** (the read operations + web search for news/injuries + an
agent-only `recommend_action` tool) under a "manage this team" prompt; Claude
emits zero or more recommendations. The agent-runner then puts each
recommendation through the **existing pipeline** (rules → audit →
confirm-by-default) and applies a three-way autonomy policy:

- **allowed, no warnings** → auto-execute when the league's `autonomy` is `auto`,
  else send Approve/Deny to Telegram.
- **allowed, with warnings** → always send Approve/Deny (never auto).
- **rule-blocked** → send Override/Dismiss (explicit human override only).

The agent is **opt-in per league** (an `agent` config block); with no
`SLEEPER_TOKEN` the write fails safe (needs-reauth) and Telegram becomes the
re-auth prompt.

## Rationale

The agent is an autonomous *caller* of machinery we already built and tested
(rules engine, action pipeline, audit, needs-reauth) — it adds no new
write-safety logic, which is what makes hands-off operation trustworthy. The
`recommend_action` seam separates Claude's reasoning from the system's
execute/notify control, so routing (auto / approve / override) is deterministic
code, not left to the model. The three-way policy is exactly the user's choices
(auto-within-rules, approve warned, override blocked).

## Consequences

- Autonomy is per-league; the schema default is safe (`manual`) so the
  open-source default never auto-trades — the operator opts a league into `auto`.
- Trades are proposal-only (two-party; the other manager must accept) and lean on
  the current value heuristics; adds/drops are single-roster and higher-confidence.
- The scheduler + Telegram poller run in the always-on API process, gated by
  config; disabled entirely when no league enables the agent.
- Every autonomous action is audited with `actor: "auto"` (or `"user"` on a tap),
  so the GUI audit log shows exactly what it did while you were away.
