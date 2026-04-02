# T-1000 — Autonomous Software Factory

A Cursor IDE plugin that detects production errors via Sentry, reproduces them with Playwright E2E tests, autonomously fixes the code, validates the fix, and ships a GitHub PR.

## Quick Start

```bash
npm install
npx playwright install chromium
npm run dev          # Terminal 1: starts the buggy demo app on :3000
npm run heal         # Terminal 2: runs the T-1000 pipeline
```

## How It Works

1. **Detect** — Fetches the latest Sentry issue (mock or real via MCP)
2. **Reproduce** — Dynamically generates a Playwright test from error breadcrumbs
3. **Verify** — Runs the test, confirms it fails (bug reproduced locally)
4. **Handoff** — Emits a structured directive for the Cursor Agent
5. **Fix** — Agent reads the directive, edits the buggy code autonomously
6. **Validate** — Re-runs the Playwright test, confirms the fix passes
7. **Ship** — Creates a git branch and opens a GitHub PR

## Architecture

```
src/index.ts                  # T-1000 orchestrator pipeline (Steps A→G)
src/server.ts                 # Demo web app (Node http server, port 3000)
src/components/Checkout.tsx   # Buggy component (the agent fixes this)
src/public/index.html         # Checkout page UI
skills/heal/SKILL.md          # Instructions for the Cursor agent
playwright.config.ts          # Playwright configuration
.cursor-plugin/plugin.json    # Cursor plugin manifest
```

## The Demo Bug

`src/components/Checkout.tsx` has a `TypeError` on line 42 — it accesses `.percentage` on an undefined `discount` object. When a user clicks "Checkout" without a discount code applied, the server crashes with a 500 error. The T-1000 detects this, writes a Playwright test that reproduces it, and instructs the agent to fix it.
