---
id: dec.chat-history-memory
nodes:
  - sleepbot.history
  - sleepbot.chat
  - sleepbot.core
  - sleepbot.gui
status: accepted
date: 2026-09-04
revisit_triggers:
  - "If threads grow large enough that char-budget replay drops useful context — add pgvector semantic retrieval"
  - "If chat becomes multi-user — conversations and memory would need per-user scoping (data/users/…)"
  - "If memory grows large — the whole block is injected every turn; may need relevance selection"
---
# Chat history & memory

## Context

The chat loop is stateless (dec.chat-panel): the client holds the messages and
re-sends the full history each turn, so a reload loses everything and there's no
way to revisit past chats. The DB (now the app's durable, runtime-writable store
after dec.ui-config-editing) makes persistence possible. The roadmap item is
"chat history + memory"; this decision covers the design and Phase 1 (history).

## Decision

**Phase 1 — persistent multi-thread history.**

- **Server-owned main chat.** `/api/chat` for the main chat takes
  `{ conversationId?, message }`; the server loads the thread, appends, runs the
  existing tool loop over a trimmed history, and saves the user + assistant
  messages. New threads are lazily created on the first message and titled from
  it. Nothing is persisted until the turn succeeds, so a missing
  `ANTHROPIC_API_KEY` can't leave an orphan thread.
- **Draft-room chat stays ephemeral** — same route, but a body with
  `draftContext` keeps the old "client sends full history, returns { reply }"
  path. Draft chat is bound to a live board and shouldn't accumulate as history.
- **A new `history` module**, not part of `chat`. `ChatHistory` is a pure sink
  over the `Store` (a `chat_conversations` collection; messages inline per
  conversation doc — fine at personal scale). Keeping it separate means `core`
  can compose it and `chat` can use it with **no dependency cycle** (chat already
  depends on core). The persisted-turn orchestration lives in `chat/session.ts`
  (`runPersistedTurn`), with an injectable runner so it's testable offline.
- **Routes** (behind the login gate): `GET /api/conversations`,
  `GET/PATCH/DELETE /api/conversations/:id`, plus the reworked `POST /api/chat`.
- **Context trimming:** replay the most recent messages within a char budget
  (~chars/4 ≈ tokens); semantic retrieval (pgvector) is a later upgrade.
- **GUI:** a `ChatPane` with a conversation sidebar (new / switch / rename /
  delete); the ephemeral `<Chat/>` component is retained for the draft room.

**Phase 2 — memory (built).** A `MemoryStore` (also in `history`) over a
`chat_memory` collection of short notes `{ id, text, createdAt, source }`.
`memoryBlock()` formats them (ids included) into the system prompt every
persisted turn (draft chat excluded). Model-assisted + manual: the chat gains a
`remember_fact` tool (saves, source "model") and a `forget_fact` tool (removes by
the id shown in the block); the user curates the list via `GET/POST/DELETE
/api/memory` and a memory editor in the Settings panel. `add()` de-dupes on
identical text. `runChatTurn` gained a `systemExtra` hook for the injection.

## Rationale

Server-owned history is the clean base that also enables memory and retrieval;
it moves the source of truth to the DB where it belongs on scale-to-zero. A
separate `history` module avoids a core↔chat cycle and keeps persistence testable
without the model. Inline messages per doc are the simplest thing that works for
one user; splitting messages into their own rows is only worth it at scale.

## Consequences

- New `history` module + `chat/session.ts`; `AppContext` gains `chatHistory`.
- `/api/chat` has two shapes on one route (draft = ephemeral, main = persisted).
- No new deploy inputs — rides on the existing `DATABASE_URL` store. Without a
  DB (local JSON file) it still works, just single-instance/ephemeral-in-cloud.
- Conversations are unscoped (single user); multi-user is a revisit trigger.
