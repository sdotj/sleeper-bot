---
id: dec.gui-architecture
nodes:
  - sleepbot.core
  - sleepbot.api
  - sleepbot.gui
status: accepted
date: 2026-08-26
revisit_triggers:
  - "When deploying to the cloud (swap the JSON Store for a hosted DB)"
  - "If the GUI needs realtime push (websockets) rather than request/response"
---
# GUI Architecture

## Context

Phase 3 adds a local GUI (quick-actions + chat). The whole system is meant to
move from laptop to a small cloud server as a deploy change, not a rewrite. The
GUI must reach the exact same fantasy operations Claude uses, without
duplicating adapter/rules/pipeline logic.

## Decision

Introduce a `core` module: shared app wiring (config → adapters → pipeline →
audit → value → session) plus an operations facade — one catalog of async
operations (reads, proposals, execute, pending, audit, auth-status) that every
front-end calls. The MCP server, a new HTTP `api` (Fastify), and the chat loop
all bind to `core`; none reimplements domain logic.

The GUI reaches the tools through the **HTTP `api`**, not by speaking MCP.
A React (Vite) front-end (`gui`) calls local REST endpoints.

## Rationale

A thin HTTP API is the natural cloud shape: a stateless web service, scalable
horizontally behind the shared `Store` (→ hosted DB later), with no stdio
subprocess to manage. Dogfooding MCP was considered and rejected: a browser
cannot speak stdio-MCP, so an HTTP layer would be needed anyway — the MCP route
only adds a hop and a subprocess. "Same tools everywhere" is preserved because
every front-end binds to the same `core` operations. Secrets (`SLEEPER_TOKEN`,
`ANTHROPIC_API_KEY`) stay server-side; the browser only ever talks to our API.

## Consequences

- `core` becomes the single dependency hub; MCP `tools`, `api`, and `chat` are
  thin bindings over it (the MCP tools are refactored onto `core` operations).
- The MCP server stays a separate deployable that imports the same `core`.
- The React app is a separate build (`web/`), served statically in production.
- Cloud deploy = run the `api` service + serve static `gui` + point the `Store`
  at a hosted DB. No domain code changes.
