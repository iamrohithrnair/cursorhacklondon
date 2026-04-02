# T-1000: The Self-Healing Production Sentinel

You know that sinking feeling when your phone buzzes at 2 AM? Production's down. Again. And now you're bleary-eyed, digging through stack traces, trying to figure out what broke while the rest of the world sleeps.

What if that never happened again?

T-1000 is an autonomous "Software Factory" — a Cursor IDE plugin that closes the loop between production crashes and code fixes. It watches your errors in real-time via Sentry, and when something breaks, it doesn't just alert you. It *fixes* it.

Here's what actually happens: T-1000 intercepts the failure, synthesizes a Playwright E2E test to reproduce the bug locally, hands that context to a Cursor Agent that applies a surgical fix, validates the solution against your test suite, and opens a Pull Request. All before you've even seen the alert.

The hours-long triage process? Now it's seconds. Zero human intervention. Just a verified, test-backed PR waiting for your review.

## Quick Start

```bash
npm install
npx playwright install chromium
npm run dev          # Terminal 1: starts the buggy demo app on :3001
npm run heal         # Terminal 2: runs the T-1000 pipeline
```

Or, if you're in Cursor, just type `/heal` and watch it work.

## How It Actually Works

Look, the magic isn't complicated once you break it down:

1. **Detect** — T-1000 pulls the latest unresolved issue from Sentry. Real errors, real stack traces.

2. **Reproduce** — It reads the error breadcrumbs and *writes* a Playwright test. Not from a template. Dynamically generated to reproduce exactly what went wrong.

3. **Verify** — Runs that test locally. If it fails, great — we've confirmed the bug exists on your machine.

4. **Handoff** — Emits a structured directive to the Cursor Agent. Think of it as giving the AI a very specific mission brief.

5. **Fix** — The agent reads the file, understands the context, and edits the code. No hand-holding required.

6. **Validate** — Re-runs the Playwright test. Did the fix work? Only moves forward if the test passes.

7. **Ship** — Creates a branch, commits the fix, opens a GitHub PR. Done.

## The Architecture

```
.cursor/skills/heal/SKILL.md  # Instructions for the Cursor agent
src/index.ts                  # T-1000 orchestrator (the brain)
src/server.ts                 # Demo web app (port 3001)
src/components/Checkout.tsx   # The buggy component (agent fixes this)
src/public/index.html         # Simple checkout page UI
playwright.config.ts          # Playwright config
.cursor-plugin/plugin.json    # Cursor plugin manifest
```

## The Demo Bug

We've left a bug in `src/components/Checkout.tsx` on purpose. Line 42 tries to access `.percentage` on an undefined `discount` object. Click "Checkout" without a discount code? Boom — 500 error.

T-1000 catches this from Sentry, writes a test that clicks that button, watches it fail, tells the agent exactly where to look, and waits for the fix. Then it verifies. Then it ships.

That's the whole point. You shouldn't have to be in the loop for bugs this straightforward. Let the machines handle the mechanical stuff so you can focus on the work that actually needs a human brain.

---

Built for the Cursor Hackathon. Because production errors shouldn't ruin your sleep.
