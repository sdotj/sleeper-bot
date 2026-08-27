---
id: dec.chat-panel
nodes:
  - sleepbot.chat
status: accepted
date: 2026-08-26
revisit_triggers:
  - "If we switch from raw Messages API tool-use to the MCP connector"
---
# In-app Chat Panel

## Context

The GUI includes a chat panel where the user talks to Claude and Claude uses the
same SleepBot tools. This must run without exposing any secret to the browser
and must reuse the same operations as every other front-end.

## Decision

`chat` is a server-side module running an Anthropic Messages API tool-use loop.
It advertises the SleepBot `core` operations as Claude tools, executes tool
calls against `core`, and streams the conversation back to the browser through
the `api`. The `ANTHROPIC_API_KEY` is read from the server environment only.

Write tools remain confirm-by-default inside the loop: proposals return drafts;
executing a write still requires the explicit `execute` operation, so the chat
cannot silently change league state.

## Rationale

Running the loop server-side keeps the API key and the Sleeper token off the
client and lets the chat reuse `core` exactly like the HTTP routes do. Raw
Messages API tool-use (rather than the MCP connector) keeps the dependency
surface small and the tool definitions co-located with `core`. Confirm-by-default
is preserved end-to-end.

## Consequences

- Requires `ANTHROPIC_API_KEY`; absent it, the chat endpoint fails gracefully
  with a clear "set ANTHROPIC_API_KEY" message (same pattern as needs-reauth).
- Tool schemas are derived from `core`, so adding an operation surfaces it to
  the chat automatically.
- The chat is an increment after the read-only screens; it does not block them.
