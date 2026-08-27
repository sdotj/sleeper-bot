---
id: dec.read-tools
nodes:
  - sleepbot.tools
status: accepted
date: 2026-08-26
---
# MCP Tool Layer

## Context

Claude needs a set of tools to read and (Phase 2) act on leagues. Each tool must
validate input, do one thing, and return model-readable output — without
duplicating domain logic that also serves the HTTP api and chat.

## Decision

`sleepbot.tools` is a thin MCP binding over the shared `core` operations. Each
tool file validates its input with a zod schema, calls one core operation via
the `AppContext`, and formats the result; a shared `guard` wraps handlers so a
thrown error becomes a readable MCP error instead of crashing the server. Read
tools (Phase 1) and write tools (Phase 2, confirm-by-default) register through a
single `registerAllTools` entrypoint.

## Rationale

Binding to `core` (rather than reaching into adapters/pipeline directly) is what
keeps "the same tools everywhere" literally true — Claude, the GUI, and the chat
loop share one catalog of operations (see `dec.gui-architecture`). Thin tools
with a shared error guard keep each file focused and the happy path clean.

## Consequences

- Adding a capability is: add a core operation, then a thin tool that calls it.
- Tool descriptions are the model's contract; they state confirm-by-default
  semantics for writes explicitly.
- The tools module depends on `core`, not on individual adapters.
