---
id: dec.mcp-server
nodes:
  - sleepbot.server
status: accepted
date: 2026-08-26
---
# MCP Server Entrypoint

## Context

SleepBot's first surface is an MCP server so Claude clients (Claude Code,
claude.ai) can drive the fantasy tools. It must be portable from a laptop to a
small VPS as a deploy change, not a rewrite.

## Decision

`sleepbot.server` is a thin MCP entrypoint: load config, build the shared core,
register all tools, and serve over stdio. It holds no per-request state —
Sleeper's API and the shared `Store` are the sources of truth. All logging goes
to stderr because stdout is the MCP channel.

## Rationale

Keeping the entrypoint thin (wiring only, no domain logic) means the same core
powers the HTTP api and chat loop unchanged. Statelessness is what makes the
laptop→VPS move a deploy concern rather than a redesign. stdio is the standard
MCP local transport and needs no ports or auth.

## Consequences

- The server learns about tools only through the tools module's registration
  function; it stays free of tool detail.
- Any runtime state must live behind the `Store` (see `dec.action-audit-log`),
  never in server memory.
- A second transport (HTTP) is a separate module (`sleepbot.api`), not a change
  to this entrypoint.
