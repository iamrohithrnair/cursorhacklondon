# T-1000 Demo: Complete Step-by-Step Guide

## Phase 0: Pre-Demo Setup (Do Once)

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browser
npx playwright install chromium

# 3. Verify .env has Sentry credentials (already configured)
cat .env
# Should show:
# SENTRY_AUTH_TOKEN=sntryu_...
# SENTRY_ORG=raw-angel
# SENTRY_PROJECT=my-node-app

# 4. Ensure the bug exists in Checkout.tsx line 40
# Should be: const discountMultiplier = (100 - cart.discount.percentage) / 100;
# If previously fixed, reset:
npm run reset

# 5. Authenticate GitHub CLI (for PR creation)
gh auth status
# If not logged in: gh auth login
```

---

## Phase 1: Load the Plugin in Cursor

```bash
# 1. Create the local plugins directory (if not exists)
mkdir -p ~/.cursor/plugins/local

# 2. Symlink your plugin to Cursor's plugins folder
ln -sf "$(pwd)" ~/.cursor/plugins/local/t-1000

# 3. Verify the symlink
ls -la ~/.cursor/plugins/local/
```

**In Cursor IDE:**
1. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
2. Type **"Developer: Reload Window"** and press Enter
3. Wait for Cursor to reload

**Verify plugin loaded:**
- Open Cursor Chat
- Type `/` — you should see `heal` in the autocomplete list

---

## Phase 2: Trigger a Bug in Sentry

**Terminal 1: Start the demo app**
```bash
npm run dev
# Output: T-1000 Demo App running on http://localhost:3000
```

**In Browser:**
1. Open http://localhost:3000
2. Click the **"Checkout"** button
3. You'll see a red error: `Cannot read properties of undefined (reading 'percentage')`

**Wait 5-10 seconds** for Sentry to ingest the error.

---

## Phase 3: Run the T-1000 Pipeline

**Option A: Using Cursor Chat (Plugin Way)**
1. Open Cursor Chat panel
2. Type `/heal` and press Enter
3. The skill instructions tell the agent to run `npx tsx src/index.ts`

**Option B: Using Terminal Directly**
```bash
# Terminal 2
npm run heal
```

---

## Phase 4: Watch the Pipeline Execute

The terminal will show:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  T-1000 — Autonomous Software Factory
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Server detected on http://localhost:3000

[T-1000] Step A: Querying Sentry for latest unresolved issue...
  Issue:       MY-NODE-APP-XX — TypeError: Cannot read properties of undefined (reading 'percentage')
  Culprit:     POST /api/checkout
  Trace:       src/components/Checkout.tsx:40

[T-1000] Step B: Generating Playwright reproduction test...
  Route:       POST /api/checkout → page /
  Written: t1000-repro.spec.ts

[T-1000] Step C: Running Playwright test (expecting failure)...
  ✘ Test failed as expected — bug reproduced successfully.

========================================================================
[T-1000 AGENT DIRECTIVE]
========================================================================

ACTION REQUIRED — AUTONOMOUS FIX

  SENTRY ID: MY-NODE-APP-XX
  FILE:      src/components/Checkout.tsx
  LINE:      40
  ERROR:     TypeError: Cannot read properties of undefined (reading 'percentage')
  ENDPOINT:  POST /api/checkout

INSTRUCTIONS:
  1. Open src/components/Checkout.tsx:40
  2. Read the Playwright failure output above.
  3. Fix the root cause: TypeError: Cannot read...
  4. Save the file. Do NOT wait for user confirmation.

========================================================================

[T-1000] Type 'fixed' when the code edit is complete:
```

---

## Phase 5: Fix the Bug

**Open** `src/components/Checkout.tsx` **line 40**

**Change this:**
```typescript
const discountMultiplier = (100 - cart.discount.percentage) / 100;
```

**To this:**
```typescript
const discountMultiplier = cart.discount ? (100 - cart.discount.percentage) / 100 : 1;
```

**Save the file** (`Cmd+S`)

---

## Phase 6: Signal Completion

In the pipeline terminal, type:
```
fixed
```

Press Enter.

---

## Phase 7: Watch Validation & PR Creation

```
[T-1000] Step F: Validating fix...
  Restarting demo server to pick up code changes...
  Server restarted.

Running Playwright test t1000-repro.spec.ts...
  ✓ reproduce MY-NODE-APP-XX: TypeError...

[T-1000] Fix validated — Playwright test passes!

[T-1000] Step G: Shipping fix...
  Switched to branch 'fix/T1000-MY-NODE-APP-XX'
  [fix/T1000-MY-NODE-APP-XX abc1234] T-1000: Automated fix for MY-NODE-APP-XX
  
Creating pull request...
  https://github.com/your-org/cursorhacklondon/pull/1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  T-1000 pipeline complete. Ready for the next issue.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase 8: Verify the Fix

1. **Refresh browser** at http://localhost:3000
2. Click **"Checkout"** — it now works (shows order confirmation)
3. **Show the GitHub PR** in browser

---

## Quick Reference: All Commands

| Step | Command |
|------|---------|
| Install deps | `npm install && npx playwright install chromium` |
| Start demo app | `npm run dev` |
| Run pipeline | `npm run heal` |
| Reset to buggy state | `npm run reset` |
| Symlink plugin | `ln -sf "$(pwd)" ~/.cursor/plugins/local/t-1000` |
| Reload Cursor | `Cmd+Shift+P` → "Developer: Reload Window" |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `/heal` not showing in Cursor | Verify symlink exists, reload Cursor window |
| "Server not running" | Run `npm run dev` first |
| "No unresolved issues" | Trigger bug in browser, wait 5-10s for Sentry |
| Test passes (bug not reproduced) | Restart server: `Ctrl+C` then `npm run dev` |
| `gh pr create` fails | Install/auth GitHub CLI: `gh auth login` |
| Need to demo again | Run `npm run reset` to restore the bug |

---

## Bonus: Demo a Second Bug Live

### 1. Reset to main
The pipeline already returned to main. If not:
```bash
git checkout main
```

### 2. Show the working products page
Navigate to http://localhost:3000/products in the browser. Search for "peripherals" — results appear correctly.

### 3. Break it live
Open `src/components/Search.ts`. Change line 22 from:
```typescript
(p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
```

To something like:
```typescript
(p) => p.details.name.toLowerCase().includes(q)
```

Save the file. Restart the server (`Ctrl+C` then `npm run dev`).

### 4. Trigger the new bug
Go to http://localhost:3000/products and click **Search**. A red error appears:
> Cannot read properties of undefined (reading 'name')

Wait ~5 seconds for Sentry to ingest the event.

### 5. Run T-1000 again
```bash
npm run heal
```

The audience sees T-1000:
- Detects the **new** issue from Sentry (different file, different error)
- Generates a **different** Playwright test (navigates to /products, fills search, clicks search button)
- Reproduces the failure
- Emits directive pointing to `Search.ts`

### 6. Fix it
The Cursor agent (or you manually) fixes `Search.ts`. Type `fixed`.

### 7. PR #2 created
T-1000 validates the fix, creates a second branch and PR.

---

## Talking Points for Judges

- **"Zero human triage"** — T-1000 pulls the error directly from Sentry. No one had to read the stack trace, file a ticket, or assign the bug.
- **"Playwright as proof"** — The bug isn't just detected, it's reproduced with an actual E2E test. The same test validates the fix. This test ships as a regression test with the PR.
- **"Any endpoint, any bug"** — The route map makes test generation generic. New routes can be added in seconds.
- **"Loop until fixed"** — If the first fix attempt fails validation, T-1000 loops back and asks for another attempt. It doesn't ship broken code.
- **"Back to main"** — After shipping a PR, the pipeline returns to main so you can immediately heal the next issue.
