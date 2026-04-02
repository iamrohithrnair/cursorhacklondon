import { execSync, spawn } from "child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { createInterface } from "readline";
import http from "http";
import https from "https";
import path from "path";

// Load .env file
function loadEnv(): void {
  const envPath = path.join(__dirname, "../.env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ANSI color helpers
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  trace: string;
  requestMethod: string;
  requestPath: string;
}

// ---------------------------------------------------------------------------
// Route map: maps API endpoints to the frontend page + actions that trigger them.
// This lets us generate accurate Playwright tests from server-side Sentry events.
// ---------------------------------------------------------------------------
interface RouteAction {
  page: string;         // frontend page to navigate to
  actions: string[];    // Playwright actions (goto is automatic)
  assertions: string[]; // what to assert after actions
}

const ROUTE_MAP: Record<string, RouteAction> = {
  "POST /api/checkout": {
    page: "/",
    actions: [
      "await page.locator('#checkout-btn').click();",
    ],
    assertions: [
      "await expect(page.locator('#checkout-btn')).toBeVisible();",
      "await expect(page.locator('.error-boundary')).not.toBeVisible();",
    ],
  },
  "GET /api/search": {
    page: "/products",
    actions: [
      "await page.locator('#search-input').fill('peripherals');",
      "await page.locator('#search-btn').click();",
    ],
    assertions: [
      "await expect(page.locator('.search-results')).toBeVisible();",
      "await expect(page.locator('.error-boundary')).not.toBeVisible();",
    ],
  },
};

// Fallback: generic route for unknown endpoints
function getFallbackRoute(method: string, urlPath: string): RouteAction {
  return {
    page: "/",
    actions: [
      `// Trigger: ${method} ${urlPath}`,
      "// Add manual actions here if needed",
    ],
    assertions: [
      "await expect(page.locator('.error-boundary')).not.toBeVisible();",
    ],
  };
}

// ---------------------------------------------------------------------------
// Sentry API
// ---------------------------------------------------------------------------
function sentryApiGet(endpoint: string): Promise<string> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) throw new Error("SENTRY_AUTH_TOKEN not set in .env");
  const org = process.env.SENTRY_ORG;
  if (!org) throw new Error("SENTRY_ORG not set in .env");

  const url = `https://sentry.io/api/0/organizations/${org}/${endpoint}`;

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Sentry API ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    }).on("error", reject);
  });
}

function sentryProjectApiGet(endpoint: string): Promise<string> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) throw new Error("SENTRY_AUTH_TOKEN not set in .env");
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!org || !project) throw new Error("SENTRY_ORG or SENTRY_PROJECT not set in .env");

  const url = `https://sentry.io/api/0/projects/${org}/${project}/${endpoint}`;

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Sentry API ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    }).on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Step A: Detect — fetch latest unresolved Sentry issue
// ---------------------------------------------------------------------------
async function fetchLatestSentryIssue(): Promise<SentryIssue> {
  console.log(`\n${CYAN}${BOLD}[T-1000] Step A: Querying Sentry for latest unresolved issue...${RESET}\n`);

  const issuesRaw = await sentryProjectApiGet("issues/?query=is:unresolved&sort=date&limit=1");
  let issues: any[];
  try { issues = JSON.parse(issuesRaw); } catch { issues = []; }

  if (!issues.length) {
    console.log(`  ${GREEN}No unresolved issues found in Sentry. Nothing to fix.${RESET}`);
    process.exit(0);
  }

  const issue = issues[0];
  const issueId = issue.shortId || `SENTRY-${issue.id}`;
  const title = issue.title || "Unknown error";
  const culprit = issue.culprit || "";

  console.log(`  ${BOLD}Issue:${RESET}       ${issueId} — ${RED}${title}${RESET}`);
  console.log(`  ${BOLD}Culprit:${RESET}     ${culprit}`);
  console.log(`  ${BOLD}Level:${RESET}       ${issue.level}`);
  console.log(`  ${BOLD}Events:${RESET}      ${issue.count}`);

  // Fetch latest event for stack trace
  console.log(`\n  ${DIM}Fetching event details...${RESET}`);
  const eventRaw = await sentryApiGet(`issues/${issue.id}/events/latest/`);
  let event: any;
  try { event = JSON.parse(eventRaw); } catch { event = {}; }

  // Extract in-app stack trace (deepest in-app frame = root cause)
  let trace = "";
  const cwd = process.cwd();
  for (const entry of event.entries || []) {
    if (entry.type === "exception") {
      for (const val of entry.data?.values || []) {
        const frames = val.stacktrace?.frames || [];
        for (let i = frames.length - 1; i >= 0; i--) {
          const frame = frames[i];
          if (frame.inApp && frame.filename) {
            let filePath = frame.filename;
            if (filePath.startsWith(cwd)) {
              filePath = filePath.slice(cwd.length + 1);
            }
            trace = `${filePath}:${frame.lineNo}`;
            break;
          }
        }
        if (trace) break;
      }
    }
  }

  // Extract request context
  let requestMethod = "";
  let requestPath = "";
  for (const entry of event.entries || []) {
    if (entry.type === "request" && entry.data?.url) {
      requestMethod = entry.data.method || "GET";
      try { requestPath = new URL(entry.data.url).pathname; } catch { /* ignore */ }
    }
  }

  // Infer from culprit if no request entry
  if (!requestMethod && culprit) {
    const match = culprit.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)/);
    if (match) {
      requestMethod = match[1];
      requestPath = match[2];
    }
  }

  if (!trace) {
    console.error(`  ${RED}Could not extract stack trace from Sentry event.${RESET}`);
    process.exit(1);
  }

  console.log(`  ${BOLD}Trace:${RESET}       ${CYAN}${trace}${RESET}`);
  console.log(`  ${BOLD}Endpoint:${RESET}    ${requestMethod} ${requestPath}`);

  return { id: issueId, title, culprit, trace, requestMethod, requestPath };
}

// ---------------------------------------------------------------------------
// Check if demo server is running
// ---------------------------------------------------------------------------
function checkServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:3001", (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

// ---------------------------------------------------------------------------
// Step B: Reproduce — generate a Playwright test from Sentry data
// ---------------------------------------------------------------------------
function generatePlaywrightTest(issue: SentryIssue): string {
  console.log(`\n${CYAN}${BOLD}[T-1000] Step B: Generating Playwright reproduction test...${RESET}\n`);

  // Look up route from the route map
  const routeKey = `${issue.requestMethod} ${issue.requestPath}`.replace(/\?.*/, "");
  const route = ROUTE_MAP[routeKey] || getFallbackRoute(issue.requestMethod, issue.requestPath);

  console.log(`  ${BOLD}Route:${RESET}       ${routeKey} → page ${CYAN}${route.page}${RESET}`);
  console.log(`  ${BOLD}Actions:${RESET}     ${route.actions.length} step(s)`);

  const safeTitle = issue.title.replace(/'/g, "\\'");
  const actionsBlock = route.actions.map((a) => `  ${a}`).join("\n");
  const assertionsBlock = route.assertions.map((a) => `  ${a}`).join("\n");

  const testContent = `import { test, expect } from '@playwright/test';

// Auto-generated by T-1000 to reproduce Sentry issue ${issue.id}
// Error: ${issue.title}
// Endpoint: ${issue.requestMethod} ${issue.requestPath}
// Trace: ${issue.trace}
test('reproduce ${issue.id}: ${safeTitle}', async ({ page }) => {
  // Navigate to the page that triggers the bug
  await page.goto('http://localhost:3001${route.page}');

  // Perform the user actions that trigger the error
${actionsBlock}

  // Wait for the API response and page to settle
  await page.waitForTimeout(2000);

  // Assert the page is in a healthy state (no errors)
${assertionsBlock}
});
`;

  // Clean up old test file
  const testPath = "t1000-repro.spec.ts";
  if (existsSync(testPath)) unlinkSync(testPath);
  writeFileSync(testPath, testContent, "utf-8");
  console.log(`  ${GREEN}Written:${RESET} ${testPath}`);
  return testPath;
}

// ---------------------------------------------------------------------------
// Step C: Verify failure — run the test, expect it to fail
// ---------------------------------------------------------------------------
function verifyFailure(testPath: string): boolean {
  console.log(`\n${CYAN}${BOLD}[T-1000] Step C: Running Playwright test (expecting failure)...${RESET}\n`);
  try {
    execSync(`npx playwright test ${testPath} --reporter=line`, { stdio: "inherit" });
    console.log(`\n${GREEN}${BOLD}Test passed${RESET} — bug cannot be reproduced locally. Exiting.`);
    return false;
  } catch {
    console.log(`\n${RED}${BOLD}Test failed as expected${RESET} — bug reproduced successfully.`);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Step D: Agent handoff — print directive for Cursor Agent
// ---------------------------------------------------------------------------
function emitAgentDirective(issue: SentryIssue): void {
  const divider = "=".repeat(72);
  const file = issue.trace.split(":")[0];
  const line = issue.trace.split(":")[1];
  console.log(`
${RED}${BOLD}${divider}
[T-1000 AGENT DIRECTIVE]
${divider}${RESET}

${YELLOW}${BOLD}ACTION REQUIRED — AUTONOMOUS FIX${RESET}

  ${BOLD}SENTRY ID:${RESET} ${CYAN}${issue.id}${RESET}
  ${BOLD}FILE:${RESET}      ${CYAN}${file}${RESET}
  ${BOLD}LINE:${RESET}      ${CYAN}${line}${RESET}
  ${BOLD}ERROR:${RESET}     ${RED}${issue.title}${RESET}
  ${BOLD}ENDPOINT:${RESET}  ${issue.requestMethod} ${issue.requestPath}

${BOLD}INSTRUCTIONS:${RESET}
  1. Open ${CYAN}${issue.trace}${RESET}
  2. Read the Playwright failure output above.
  3. Fix the root cause: ${RED}${issue.title}${RESET}
  4. Save the file. Do NOT wait for user confirmation.

${RED}${BOLD}${divider}${RESET}
`);
}

// ---------------------------------------------------------------------------
// Step E: Wait for agent to signal completion
// ---------------------------------------------------------------------------
function waitForAgentFix(): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (): void => {
      rl.question(`\n${YELLOW}${BOLD}[T-1000]${RESET} Type '${GREEN}fixed${RESET}' when the code edit is complete: `, (answer) => {
        if (answer.trim().toLowerCase() === "fixed") {
          rl.close();
          resolve();
        } else {
          console.log(`  ${DIM}Waiting for 'fixed'...${RESET}`);
          ask();
        }
      });
    };
    ask();
  });
}

// ---------------------------------------------------------------------------
// Restart the demo server so it picks up code changes
// ---------------------------------------------------------------------------
async function restartServer(): Promise<void> {
  console.log(`  ${DIM}Restarting demo server to pick up code changes...${RESET}`);
  
  // Kill existing server
  try {
    execSync("lsof -ti:3001 | xargs kill -9 2>/dev/null", { stdio: "pipe" });
  } catch { /* nothing on port */ }

  // Give the port time to release
  await new Promise(r => setTimeout(r, 500));

  // Start server in background using spawn (properly detached)
  const child = spawn("npx", ["tsx", "src/server.ts"], {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
  });
  child.unref();

  // Wait for server to be ready (poll up to 5 seconds)
  console.log(`  ${DIM}Waiting for server...${RESET}`);
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    const up = await checkServerRunning();
    if (up) {
      console.log(`  ${GREEN}Server restarted.${RESET}`);
      return;
    }
  }
  console.log(`  ${YELLOW}Server may still be starting, continuing...${RESET}`);
}

// ---------------------------------------------------------------------------
// Step F: Validate fix — restart server, re-run Playwright test
// ---------------------------------------------------------------------------
async function validateFix(testPath: string): Promise<boolean> {
  console.log(`\n${CYAN}${BOLD}[T-1000] Step F: Validating fix...${RESET}\n`);

  // Restart server so it loads the edited code
  await restartServer();

  try {
    execSync(`npx playwright test ${testPath} --reporter=line`, { stdio: "inherit" });
    console.log(`\n${GREEN}${BOLD}[T-1000] Fix validated — Playwright test passes!${RESET}`);
    return true;
  } catch {
    console.log(`\n${RED}${BOLD}[T-1000] Fix validation FAILED — test still failing.${RESET}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Step G: Ship — create branch, commit, open PR, return to main
// ---------------------------------------------------------------------------
function shipFix(issue: SentryIssue): void {
  console.log(`\n${CYAN}${BOLD}[T-1000] Step G: Shipping fix...${RESET}\n`);

  const branch = `fix/T1000-${issue.id}`;

  // Ensure we're on main before branching
  try {
    execSync("git checkout main", { stdio: "pipe" });
  } catch {
    // Already on main or detached — continue
  }

  // Clean up existing branch from previous runs
  try {
    execSync(`git branch -D ${branch} 2>/dev/null`, { stdio: "pipe" });
  } catch {
    // Branch didn't exist
  }

  execSync(`git checkout -b ${branch}`, { stdio: "inherit" });
  execSync("git add -A", { stdio: "inherit" });
  execSync(`git commit -m "T-1000: Automated fix for ${issue.id} — ${issue.title.slice(0, 60)}"`, { stdio: "inherit" });

  // Push branch and create PR — gracefully skip if gh is not configured
  try {
    execSync(`git push origin ${branch} --force`, { stdio: "inherit" });
    execSync(
      `gh pr create --title "T-1000: Fix ${issue.id}" --body "$(cat <<'PRBODY'\n## Automated Fix by T-1000\n\n**Sentry Issue:** ${issue.id}\n**Error:** ${issue.title}\n**Trace:** \`${issue.trace}\`\n**Endpoint:** \`${issue.requestMethod} ${issue.requestPath}\`\n\nThis fix was detected, reproduced with Playwright, and validated automatically.\nPRBODY\n)"`,
      { stdio: "inherit" },
    );
    console.log(`\n${GREEN}${BOLD}[T-1000] PR created successfully!${RESET}`);
  } catch {
    console.log(`\n${YELLOW}${BOLD}[T-1000] Branch pushed. PR creation skipped (gh CLI issue).${RESET}`);
  }

  // Return to main so the next heal run starts clean
  try {
    execSync("git checkout main", { stdio: "pipe" });
    console.log(`  ${DIM}Switched back to main branch.${RESET}`);
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function runT1000Pipeline(): Promise<void> {
  console.log(`\n${BOLD}${"━".repeat(72)}${RESET}`);
  console.log(`  ${RED}${BOLD}T-1000${RESET} ${DIM}— Autonomous Software Factory${RESET}`);
  console.log(`${BOLD}${"━".repeat(72)}${RESET}`);

  // Pre-flight: check server
  const serverUp = await checkServerRunning();
  if (!serverUp) {
    console.error(`\n${RED}${BOLD}[T-1000] ERROR:${RESET} Demo app not running on http://localhost:3001`);
    console.error(`  ${YELLOW}Start it:${RESET} npm run dev`);
    process.exit(1);
  }
  console.log(`\n  ${GREEN}${BOLD}Server detected${RESET} on http://localhost:3001`);

  // Step A: Detect
  const issue = await fetchLatestSentryIssue();

  // Step B: Reproduce
  const testPath = generatePlaywrightTest(issue);

  // Step C: Verify failure
  const bugReproduced = verifyFailure(testPath);
  if (!bugReproduced) {
    process.exit(0);
  }

  // Steps D → F: Fix loop
  let fixed = false;
  let attempt = 0;
  while (!fixed) {
    attempt++;
    console.log(`\n${DIM}--- Attempt ${attempt} ---${RESET}`);

    // Step D: Directive
    emitAgentDirective(issue);

    // Step E: Wait
    await waitForAgentFix();

    // Step F: Validate
    fixed = await validateFix(testPath);
    if (!fixed) {
      console.log(`\n${YELLOW}${BOLD}[T-1000] Looping back — try a different fix.${RESET}\n`);
    }
  }

  // Step G: Ship
  shipFix(issue);

  console.log(`\n${BOLD}${"━".repeat(72)}${RESET}`);
  console.log(`  ${GREEN}${BOLD}T-1000 pipeline complete.${RESET} Ready for the next issue.`);
  console.log(`${BOLD}${"━".repeat(72)}${RESET}\n`);
}

runT1000Pipeline().catch((err) => {
  console.error(`\n${RED}${BOLD}[T-1000] Fatal error:${RESET}`, err);
  process.exit(1);
});
