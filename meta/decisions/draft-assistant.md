---
id: dec.draft-assistant
nodes:
  - sleepbot.draft
status: accepted
date: 2026-08-27
revisit_triggers:
  - "If Sleeper's real-time draft websocket is reverse-engineered (enables auto-picking)"
---
# Draft Assistant (read-only)

## Context

The user wants SleepBot to help during (mock and real) drafts: see the live
board, know who's on the clock, and get pick recommendations with real value and
roster-need context — and to chat through the draft. A key constraint surfaced
during design: Sleeper draft picks are submitted over an **undocumented
real-time websocket**, not the REST/GraphQL surface the other writes use.

## Decision

The `draft` module is a READ-ONLY assistant. It reads drafts, picks, and the
player pool via the platform adapter (public Sleeper endpoints, no auth), and
ranks available players with the `value` provider (KTC). It produces a board
view (status, on-the-clock via snake math, recent picks) and recommendations
(best available overall and by roster need). It does NOT submit picks — the user
makes the pick in Sleeper; SleepBot then sees the updated board. Drafts are found
by league discovery OR an explicit `draftId` (so mock drafts work even when not
linked to a league).

## Rationale

Reads + recommendations deliver the whole draft experience except the final tap,
with zero write risk and no dependency on a fragile, undocumented websocket.
Building the pick-write over that websocket was rejected as uncertain and
fragile (see the draft-picks decision in the session). The read/recommend
interface is future-proof: if the websocket is ever reverse-engineered, a
`propose_pick`/execute path can be added behind the same confirm-by-default
pattern without changing the assistant.

## Consequences

- No auth needed for the draft assistant; it works immediately.
- Recommendations are only as good as the value source (KTC) and the simple
  roster-need heuristic; both are swappable.
- On-the-clock is computed from snake ordering + `slot_to_roster_id`, which
  Sleeper populates once a draft is set up; it is null when not yet determinable.
- A live GUI draft view can poll the board endpoint during a draft.
