# Proposal: figma-ui-replica

## Motivation
The existing UI differs from the SleepBot UI Refresh Figma frames.

## Scope
Match the shared shell, dark and light tokens, roster, standings, matchups, chat, draft, audit and settings layouts. Keep the three team sections on one page with accurate scroll highlighting.

## Evidence
Compare the rendered local UI with the Figma frames, exercise navigation and bottom-of-page highlighting, and run TypeScript, build, tests and Cairn gates.

## Out of scope
Backend data enrichment and production writes. Missing projections, streaks and waiver data must be visibly unavailable, never fabricated.
