# T-1000 Cursor Rules

This project is the T-1000 Autonomous Software Factory — a Cursor IDE plugin that detects Sentry errors, reproduces them with Playwright, fixes the code, and ships PRs.

## Key Files
- `src/index.ts` — Orchestrator pipeline (do not modify during /heal)
- `src/components/Checkout.tsx` — Demo buggy component (the agent fixes this)
- `src/server.ts` — Demo web app server
- `skills/heal/SKILL.md` — Agent instructions for the /heal skill

## Conventions
- TypeScript strict mode, ES2022 target
- No external web frameworks — uses Node built-in `http` module
- Playwright for E2E testing (Chromium only)
