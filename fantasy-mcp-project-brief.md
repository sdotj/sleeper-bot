# Fantasy Football MCP Server — Project Brief

## Goal
Build a Model Context Protocol (MCP) server called 'SleepBot' that connects Claude to fantasy
football leagues, starting with Sleeper (read-only, then write actions with a
rules engine), later extended to ESPN and multiple leagues. Eventually paired
with a local GUI (quick actions + chat).

## Architecture principles
- **Platform-agnostic core.** Every tool operates against a common internal
  interface (`LeagueAdapter`), implemented per-platform (`SleeperAdapter` now,
  `EspnAdapter` later). GUI, rules engine, and MCP tool signatures never need
  to know which platform they're talking to.
- **Config-driven, not hardcoded.** Leagues live in a `leagues[]` array from
  day one, even with only one entry today.
- **Confirm-by-default for writes.** No action that changes league state
  executes silently. Every write tool returns a proposed action; a separate
  `execute_action` tool (or explicit rule marked `autoExecute: true`) is
  required to actually send it.
- **Stateless server.** No reliance on local-machine-only state, so this can
  move from "runs on my laptop" to "runs on a small VPS" later as a deploy
  change, not a rewrite.

## Phase 1 — Scaffold + Sleeper read tools

### File structure
```
fantasy-mcp/
├── src/
│   ├── index.ts                 # MCP server entrypoint
│   ├── config/
│   │   ├── schema.ts            # zod schema for leagues.json
│   │   └── loader.ts
│   ├── adapters/
│   │   ├── LeagueAdapter.ts     # interface all platforms implement
│   │   └── sleeper/
│   │       ├── SleeperAdapter.ts
│   │       └── sleeperClient.ts # thin wrapper around api.sleeper.app
│   ├── tools/
│   │   ├── getLeagueInfo.ts
│   │   ├── getRosters.ts
│   │   ├── getMatchups.ts
│   │   ├── getStandings.ts
│   │   ├── getTransactions.ts
│   │   ├── searchPlayers.ts
│   │   └── index.ts             # registers all tools with the MCP server
│   └── rules/                   # stubbed out, built in Phase 2
├── config/
│   └── leagues.example.json
├── .env.example
├── package.json
└── tsconfig.json
```

### Config schema (`leagues.json`)
```jsonc
{
  "leagues": [
    {
      "id": "my-main-league",        // your own label, used in tool calls
      "platform": "sleeper",         // "sleeper" | "espn"
      "sleeper": {
        "leagueId": "123456789012345678",
        "username": "yourusername"
      }
      // future entry: { "platform": "espn", "espn": { "leagueId": ..., "swid": "env:ESPN_SWID", "espnS2": "env:ESPN_S2" } }
    }
  ]
}
```
Secrets (ESPN cookies, later a Sleeper session token for writes) are referenced
as `env:VAR_NAME` and pulled from `.env` at runtime — never stored in the JSON
directly.

### Phase 1 MCP tools (all read-only, Sleeper public API — no auth required)
| Tool | Purpose |
|---|---|
| `list_leagues` | Returns configured leagues (from config, not API) |
| `get_league_info` | League settings, scoring type, season, roster positions |
| `get_rosters` | All rosters: players, starters, bench, IR |
| `get_matchups` | Weekly matchups + scores |
| `get_standings` | Wins/losses/points for/against, sorted |
| `get_transactions` | Trades, waivers, free-agent moves |
| `search_players` | Look up players by name, filter by position/team |
| `get_trending_players` | Sleeper's trending adds/drops |

Each tool takes `leagueId` (your config label, e.g. `"my-main-league"`) as a
parameter so multi-league support is just "pass a different id," no code
changes needed.

## Phase 2 — Sleeper write actions + rules engine

**Note on write access:** Sleeper has no official public write API. Actions
like proposing a trade, add/drop, and waiver claims go through Sleeper's
private app API, which requires your session auth (captured from a logged-in
session) and is unofficial/reverse-engineered — it works today but isn't
guaranteed to stay stable. Flag this clearly in the code comments so future-you
remembers why it might break.

### New tools
- `propose_trade(leagueId, offer)` → returns a **draft** trade object, does not send it
- `propose_waiver_claim(leagueId, addPlayerId, dropPlayerId, faabBid)` → draft only
- `propose_add_drop(leagueId, addPlayerId, dropPlayerId)` → draft only
- `execute_action(actionId)` → sends a previously-proposed action after your explicit confirmation
- `list_pending_actions(leagueId)` → shows drafts awaiting confirmation

### Rules engine
- Rules stored in config (`rules.json`), evaluated against every proposed
  action before it's shown to you.
- Rule types to start with:
  - **Block rules**: e.g. block dropping any player ranked top-24 at their position
  - **Warn rules**: e.g. flag trades with >20% value differential (needs a
    value source — placeholder using Sleeper's trending/ADP data initially)
  - **Auto-execute rules** (opt-in, off by default): e.g. auto-accept a trade
    only if it exactly matches a pre-approved offer you configured
- A rule never *expands* what's allowed beyond what you, the human, can already
  do manually — it only restricts or (if explicitly opted in) pre-approves.

## Phase 3 — GUI
- Local React app (Vite) calling the same MCP tools via a thin local API layer
- Quick actions: view roster, check waivers, propose trade, view matchup, see pending actions
- Chat panel: talks to Claude, which uses the same MCP tools

## Phase 4 — ESPN adapter
- Implement `EspnAdapter` against ESPN's private fantasy API (cookie-based:
  `SWID` + `espn_s2` from a logged-in browser session)
- Same tool interface — GUI and rules engine require no changes, just a new
  `platform: "espn"` config entry

## Open questions to resolve during Phase 2 (write actions)
- How do we capture and refresh your Sleeper session credential without you
  manually re-logging-in constantly?
- What's the source of truth for "player value" used in trade-fairness warn
  rules — ADP, expert consensus rankings, something else?
- Do you want a persistent log of every proposed/executed/rejected action for
  your own audit trail?

## Suggested first Claude Code prompt
> Set up a TypeScript MCP server project for fantasy football league
> management. Start with a Sleeper read-only connector: tools for league
> info, rosters, matchups, standings, transactions, and player search, using
> Sleeper's public API (no auth needed). Structure config around a `leagues`
> array so ESPN and multiple leagues can be added later without changing the
> tool interface. Use the file structure and config schema in
> `fantasy-mcp-project-brief.md`.# Fantasy Football MCP Server — Project Brief

## Goal
Build a Model Context Protocol (MCP) server that connects Claude to fantasy
football leagues, starting with Sleeper (read-only, then write actions with a
rules engine), later extended to ESPN and multiple leagues. Eventually paired
with a local GUI (quick actions + chat).

## Architecture principles
- **Platform-agnostic core.** Every tool operates against a common internal
  interface (`LeagueAdapter`), implemented per-platform (`SleeperAdapter` now,
  `EspnAdapter` later). GUI, rules engine, and MCP tool signatures never need
  to know which platform they're talking to.
- **Config-driven, not hardcoded.** Leagues live in a `leagues[]` array from
  day one, even with only one entry today.
- **Confirm-by-default for writes.** No action that changes league state
  executes silently. Every write tool returns a proposed action; a separate
  `execute_action` tool (or explicit rule marked `autoExecute: true`) is
  required to actually send it.
- **Stateless server.** No reliance on local-machine-only state, so this can
  move from "runs on my laptop" to "runs on a small VPS" later as a deploy
  change, not a rewrite.

## Phase 1 — Scaffold + Sleeper read tools

### File structure
```
fantasy-mcp/
├── src/
│   ├── index.ts                 # MCP server entrypoint
│   ├── config/
│   │   ├── schema.ts            # zod schema for leagues.json
│   │   └── loader.ts
│   ├── adapters/
│   │   ├── LeagueAdapter.ts     # interface all platforms implement
│   │   └── sleeper/
│   │       ├── SleeperAdapter.ts
│   │       └── sleeperClient.ts # thin wrapper around api.sleeper.app
│   ├── tools/
│   │   ├── getLeagueInfo.ts
│   │   ├── getRosters.ts
│   │   ├── getMatchups.ts
│   │   ├── getStandings.ts
│   │   ├── getTransactions.ts
│   │   ├── searchPlayers.ts
│   │   └── index.ts             # registers all tools with the MCP server
│   └── rules/                   # stubbed out, built in Phase 2
├── config/
│   └── leagues.example.json
├── .env.example
├── package.json
└── tsconfig.json
```

### Config schema (`leagues.json`)
```jsonc
{
  "leagues": [
    {
      "id": "my-main-league",        // your own label, used in tool calls
      "platform": "sleeper",         // "sleeper" | "espn"
      "sleeper": {
        "leagueId": "123456789012345678",
        "username": "yourusername"
      }
      // future entry: { "platform": "espn", "espn": { "leagueId": ..., "swid": "env:ESPN_SWID", "espnS2": "env:ESPN_S2" } }
    }
  ]
}
```
Secrets (ESPN cookies, later a Sleeper session token for writes) are referenced
as `env:VAR_NAME` and pulled from `.env` at runtime — never stored in the JSON
directly.

### Phase 1 MCP tools (all read-only, Sleeper public API — no auth required)
| Tool | Purpose |
|---|---|
| `list_leagues` | Returns configured leagues (from config, not API) |
| `get_league_info` | League settings, scoring type, season, roster positions |
| `get_rosters` | All rosters: players, starters, bench, IR |
| `get_matchups` | Weekly matchups + scores |
| `get_standings` | Wins/losses/points for/against, sorted |
| `get_transactions` | Trades, waivers, free-agent moves |
| `search_players` | Look up players by name, filter by position/team |
| `get_trending_players` | Sleeper's trending adds/drops |

Each tool takes `leagueId` (your config label, e.g. `"my-main-league"`) as a
parameter so multi-league support is just "pass a different id," no code
changes needed.

## Phase 2 — Sleeper write actions + rules engine

**Note on write access:** Sleeper has no official public write API. Actions
like proposing a trade, add/drop, and waiver claims go through Sleeper's
private app API, which requires your session auth (captured from a logged-in
session) and is unofficial/reverse-engineered — it works today but isn't
guaranteed to stay stable. Flag this clearly in the code comments so future-you
remembers why it might break.

### New tools
- `propose_trade(leagueId, offer)` → returns a **draft** trade object, does not send it
- `propose_waiver_claim(leagueId, addPlayerId, dropPlayerId, faabBid)` → draft only
- `propose_add_drop(leagueId, addPlayerId, dropPlayerId)` → draft only
- `execute_action(actionId)` → sends a previously-proposed action after your explicit confirmation
- `list_pending_actions(leagueId)` → shows drafts awaiting confirmation

### Rules engine
- Rules stored in config (`rules.json`), evaluated against every proposed
  action before it's shown to you.
- Rule types to start with:
  - **Block rules**: e.g. block dropping any player ranked top-24 at their position
  - **Warn rules**: e.g. flag trades with >20% value differential (needs a
    value source — placeholder using Sleeper's trending/ADP data initially)
  - **Auto-execute rules** (opt-in, off by default): e.g. auto-accept a trade
    only if it exactly matches a pre-approved offer you configured
- A rule never *expands* what's allowed beyond what you, the human, can already
  do manually — it only restricts or (if explicitly opted in) pre-approves.

## Phase 3 — GUI
- Local React app (Vite) calling the same MCP tools via a thin local API layer
- Quick actions: view roster, check waivers, propose trade, view matchup, see pending actions
- Chat panel: talks to Claude, which uses the same MCP tools

## Phase 4 — ESPN adapter
- Implement `EspnAdapter` against ESPN's private fantasy API (cookie-based:
  `SWID` + `espn_s2` from a logged-in browser session)
- Same tool interface — GUI and rules engine require no changes, just a new
  `platform: "espn"` config entry

## Open questions to resolve during Phase 2 (write actions)
- How do we capture and refresh your Sleeper session credential without you
  manually re-logging-in constantly?
- What's the source of truth for "player value" used in trade-fairness warn
  rules — ADP, expert consensus rankings, something else?
- Do you want a persistent log of every proposed/executed/rejected action for
  your own audit trail?