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

## Interaction refinements
- Dashboard summary cards now share the sticky navigation container. Browser checks at scrollY 747 kept its bottom at 275px and the Standings heading at 287px (12px clear).
- Dashboard tabs smoothly scroll with the measured sticky offset; reduced-motion users retain immediate navigation. Observed an intermediate scrollY of 527 before settling at 747.
- User chat bubbles align to the right, assistants to the left; mobile bubbles leave 15% of the available width clear.
- Custom league menu opens 8px below its trigger. Selecting SecondLeague updated the trigger and dismissed the menu in the isolated preview.
- Account menu closes on outside clicks and Escape; Escape restores focus to its trigger. Both menus share keyboard navigation and dismissal logic.
- Production build, frontend TypeScript, and all 173 tests pass (one existing integration test skipped). Cairn scan reports no errors and all hooks pass, with the same 21 existing contract warnings.
