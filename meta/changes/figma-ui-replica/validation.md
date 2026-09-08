# UI validation

Reference: https://www.figma.com/design/drL5TI3WEuGFKY0QG1dYKh/SleepBot-UI-Refresh

Design context inspected for Dashboard Dark/Light, Team Page Dark, Chat Dark, Settings Dark, Draft Dark and Audit Dark. Shared palettes cover the corresponding light frames.

## Rendered checks
- Local static build with isolated mock API data, never production writes.
- Compared team, chat, draft, settings and audit layouts to Figma screenshots.
- Checked dark and light themes, 1200px desktop and 390px phone viewports.
- Team, chat and draft fit the phone viewport. Wide tables scroll inside their cards.
- Returning from Chat to Standings keeps its heading 12px below the 146px sticky navigation.
- Scrolling to the bottom highlights Matchups even when its short card cannot reach the sticky navigation.
- Corrected duplicate sibling keys discovered during browser checks; team cards no longer linger on standalone pages.
- Browser error/warning log empty after checks.

## Automated checks
- Frontend and backend TypeScript checks pass.
- Production Vite build passes.
- Vitest: 158 passed, one existing PostgreSQL integration test skipped.
- Cairn scan has no errors; the 21 existing missing-contract warnings remain. All hooks pass. Strict `cairn change accept` remains blocked by those pre-existing warnings; feedback was recorded.

## Data limitations
The current domain/API does not provide separate manager names, player projections or opponents, standings streaks, waiver priority/FAAB balance, draft countdown, or chat memory-update events. The UI uses real existing data and explicit unavailable values where necessary. No sample statistics or simulated timers were added to production. Draft controls, authentication, settings saves and chat operations remain connected to the existing API. Live write actions were not exercised during visual QA.
