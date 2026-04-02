# T-1000 Demo Script

## Prerequisites (do once before the demo)

```bash
npm install
npx playwright install chromium
```

Ensure `.env` has your Sentry credentials:
```
SENTRY_AUTH_TOKEN=<your-token>
SENTRY_ORG=raw-angel
SENTRY_PROJECT=my-node-app
```

Ensure the checkout bug exists in `src/components/Checkout.tsx` line 40:
```ts
const discountMultiplier = (100 - cart.discount.percentage) / 100;
```

If you previously fixed it, run `npm run reset` to restore it.

---

## Part 1: Fix a Production Bug (5 min)

### 1. Start the demo app

```bash
npm run dev
```

Open http://localhost:3000 in a browser. Show the audience the store UI.

### 2. Trigger the bug

Click the **Checkout** button. A red error appears:
> Cannot read properties of undefined (reading 'percentage')

This error has been captured by Sentry. You can show it in the Sentry dashboard if you want.

### 3. Run the T-1000 pipeline

In a second terminal (or Cursor terminal):

```bash
npm run heal
```

Walk the audience through what happens on screen:

- **Step A** — T-1000 queries Sentry API, finds the unresolved TypeError
- **Step B** — Generates a Playwright test from the error's endpoint and route map
- **Step C** — Runs the test. It fails — the bug is reproduced locally
- **Step D** — Emits a directive: file, line number, error, instructions

### 4. Fix the bug

Open `src/components/Checkout.tsx` line 40. Change:

```ts
const discountMultiplier = (100 - cart.discount.percentage) / 100;
```

To:

```ts
const discountMultiplier = cart.discount ? (100 - cart.discount.percentage) / 100 : 1;
```

Save the file.

### 5. Signal completion

Type `fixed` in the pipeline terminal.

### 6. Watch the magic

- **Step F** — T-1000 restarts the server, re-runs the Playwright test — it passes
- **Step G** — Creates a git branch, commits, pushes, opens a GitHub PR
- Returns to `main` branch automatically

### 7. Show the result

- Refresh the browser, click Checkout — it works now (shows order confirmation)
- Show the PR on GitHub

---

## Part 2: Introduce a New Bug Live (5 min)

### 1. Reset to main

The pipeline already returned to main. If not:

```bash
git checkout main
```

### 2. Show the working products page

Navigate to http://localhost:3000/products in the browser. Search for "peripherals" — results appear correctly.

### 3. Break it live

Open `src/components/Search.ts`. Change line 22 from:

```ts
(p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
```

To something like:

```ts
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

## Talking Points

- **"Zero human triage"** — T-1000 pulls the error directly from Sentry. No one had to read the stack trace, file a ticket, or assign the bug.
- **"Playwright as proof"** — The bug isn't just detected, it's reproduced with an actual E2E test. The same test validates the fix. This test ships as a regression test with the PR.
- **"Any endpoint, any bug"** — The route map makes test generation generic. New routes can be added in seconds.
- **"Loop until fixed"** — If the first fix attempt fails validation, T-1000 loops back and asks for another attempt. It doesn't ship broken code.
- **"Back to main"** — After shipping a PR, the pipeline returns to main so you can immediately heal the next issue.

---

## If Something Goes Wrong

| Problem | Fix |
|---------|-----|
| `npm run heal` says server not running | Run `npm run dev` in another terminal first |
| Sentry returns no issues | Trigger the bug in the browser first, wait 5-10s |
| Playwright test passes (bug not reproduced) | Restart the server: `Ctrl+C` then `npm run dev` |
| Git branch already exists | Pipeline handles this automatically (deletes old branch) |
| `gh pr create` fails | PR creation is optional — the fix is still committed locally |
| Need to re-demo from scratch | Run `npm run reset` then `npm run dev` |
