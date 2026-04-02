import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
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
  breadcrumbs: string[];
  trace: string;
}

// Sentry API helper
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

// Step A: Detect — fetch latest unresolved Sentry issue
async function fetchLatestSentryIssue(): Promise<SentryIssue> {
  console.log(`\n${CYAN}${BOLD}[T-1000] Step A: Querying Sentry for latest unresolved issue...${RESET}\n`);

  // Fetch latest unresolved issue
  const issuesRaw = await sentryProjectApiGet("issues/?query=is:unresolved&sort=date&limit=1");
  const issues = JSON.parse(issuesRaw);

  if (!issues.length) {
    console.log(`  ${GREEN}No unresolved issues found in Sentry. Nothing to fix.${RESET}`);
    process.exit(0);
  }

  const issue = issues[0];
  const issueId = issue.shortId || issue.id;
  const title = issue.title;

  console.log(`  ${BOLD}Issue:${RESET}       ${issueId} — ${RED}${title}${RESET}`);
  console.log(`  ${BOLD}Level:${RESET}       ${issue.level}`);
  console.log(`  ${BOLD}First seen:${RESET}  ${issue.firstSeen}`);
  console.log(`  ${BOLD}Events:${RESET}      ${issue.count}`);

  // Fetch latest event for stack trace and breadcrumbs
  console.log(`\n  ${DIM}Fetching event details...${RESET}`);
  const eventRaw = await sentryApiGet(`issues/${issue.id}/events/latest/`);
  const event = JSON.parse(eventRaw);

  // Extract in-app stack trace (deepest in-app frame = root cause)
  let trace = "";
  const cwd = process.cwd();
  for (const entry of event.entries || []) {
    if (entry.type === "exception") {
      for (const val of entry.data.values) {
        const frames = val.stacktrace?.frames || [];
        // Find the deepest in-app frame (last in array = top of stack)
        for (let i = frames.length - 1; i >= 0; i--) {
          const frame = frames[i];
          if (frame.inApp && frame.filename) {
            // Convert absolute path to relative
            let filePath = frame.filename;
            if (filePath.startsWith(cwd)) {
              filePath = filePath.slice(cwd.length + 1);
            }
            trace = `${filePath}:${frame.lineNo}`;
            break;
          }
        }
      }
    }
  }

  // Extract breadcrumbs
  const breadcrumbs: string[] = [];
  for (const entry of event.entries || []) {
    if (entry.type === "breadcrumbs") {
      for (const bc of entry.data.values) {
        const cat = bc.category || "unknown";
        const msg = bc.message || "";
        if (cat === "http" && bc.data) {
          breadcrumbs.push(`HTTP ${bc.data.method || "GET"} ${bc.data.url || ""} → ${bc.data.status_code || "?"}`);
        } else if (cat === "navigation" && bc.data) {
          breadcrumbs.push(`User navigated to ${bc.data.to || bc.data.from || "/"}`);
        } else if (cat === "ui.click") {
          breadcrumbs.push(`User clicked ${msg}`);
        } else if (msg) {
          breadcrumbs.push(`[${cat}] ${msg}`);
        }
      }
    }
  }

  // Infer user-facing breadcrumbs from request context
  // API endpoints aren't user-navigable, so map them to the page + action that triggered them
  if (!breadcrumbs.some((b) => b.startsWith("User navigated") || b.startsWith("User clicked"))) {
    let requestPath = "";
    for (const entry of event.entries || []) {
      if (entry.type === "request" && entry.data?.url) {
        try { requestPath = new URL(entry.data.url).pathname; } catch { /* ignore */ }
      }
    }
    const culprit = issue.culprit || "";

    if (requestPath.includes("/api/checkout") || culprit.includes("/api/checkout")) {
      breadcrumbs.length = 0;
      breadcrumbs.push("User navigated to /");
      breadcrumbs.push("User clicked #checkout-btn");
    } else if (requestPath && !requestPath.startsWith("/api/")) {
      breadcrumbs.unshift(`User navigated to ${requestPath}`);
    } else {
      breadcrumbs.length = 0;
      breadcrumbs.push("User navigated to /");
    }
  }

  if (!trace) {
    console.error(`  ${RED}Could not extract stack trace from Sentry event.${RESET}`);
    process.exit(1);
  }

  console.log(`  ${BOLD}Trace:${RESET}       ${CYAN}${trace}${RESET}`);
  console.log(`  ${BOLD}Breadcrumbs:${RESET} ${breadcrumbs.join(` ${DIM}→${RESET} `)}`);

  return { id: issueId, title, breadcrumbs, trace };
}

// Check if demo server is running
function checkServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:3000", (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Step B: Reproduce — generate a Playwright test from breadcrumbs
function generatePlaywrightTest(issue: SentryIssue): string {
  console.log(`\n${CYAN}${BOLD}[T-1000] Step B: Generating Playwright reproduction test...${RESET}\n`);

  const steps = issue.breadcrumbs.map((crumb) => {
    if (crumb.startsWith("User navigated to ")) {
      const urlPath = crumb.replace("User navigated to ", "");
      return `  await page.goto('http://localhost:3000${urlPath}');`;
    }
    if (crumb.startsWith("User clicked ")) {
      const selector = crumb.replace("User clicked ", "");
      return `  await page.locator('${selector}').click();`;
    }
    return `  // Breadcrumb: ${crumb}`;
  });

  const safeTitle = issue.title.replace(/'/g, "\\'");

  const testContent = `import { test, expect } from '@playwright/test';

// Auto-generated by T-1000 to reproduce Sentry issue ${issue.id}
// ${issue.title}
test('reproduce ${issue.id}: ${safeTitle}', async ({ page }) => {
${steps.join("\n")}

  // Wait for the page to settle after the user action
  await page.waitForTimeout(2000);

  // Assert no unhandled errors — page should not crash
  await expect(page.locator('#checkout-btn')).toBeVisible();
  await expect(page.locator('.error-boundary')).not.toBeVisible();
});
`;

  const testPath = "t1000-repro.spec.ts";
  writeFileSync(testPath, testContent, "utf-8");
  console.log(`  ${GREEN}Written:${RESET} ${testPath}`);
  return testPath;
}

// Step C: Verify failure — run the test, expect it to fail
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

// Step D: Agent handoff — print directive for Cursor Agent
function emitAgentDirective(issue: SentryIssue): void {
  const divider = "=".repeat(72);
  const file = issue.trace.split(":")[0];
  const line = issue.trace.split(":")[1];
  console.log(`
${RED}${BOLD}${divider}
[T-1000 AGENT DIRECTIVE]
${divider}${RESET}

${YELLOW}${BOLD}ACTION REQUIRED — AUTONOMOUS FIX${RESET}

  ${BOLD}FILE:${RESET}    ${CYAN}${file}${RESET}
  ${BOLD}LINE:${RESET}    ${CYAN}${line}${RESET}
  ${BOLD}ERROR:${RESET}   ${RED}${issue.title}${RESET}

${BOLD}INSTRUCTIONS:${RESET}
  1. Open ${CYAN}${issue.trace}${RESET}
  2. Analyze the Playwright failure output above.
  3. Fix the code to resolve: ${RED}${issue.title}${RESET}
  4. Do NOT wait for user confirmation. Edit the file now.

${RED}${BOLD}${divider}${RESET}
`);
}

// Step E: Wait for agent to signal completion
function waitForAgentFix(): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (): void => {
      rl.question(`\n${YELLOW}${BOLD}[T-1000]${RESET} Type '${GREEN}fixed${RESET}' when the Cursor Agent has completed code edits: `, (answer) => {
        if (answer.trim().toLowerCase() === "fixed") {
          rl.close();
          resolve();
        } else {
          console.log(`  ${DIM}Unrecognized input. Waiting for 'fixed'...${RESET}`);
          ask();
        }
      });
    };
    ask();
  });
}

// Step F: Validate fix — re-run Playwright test
function validateFix(testPath: string): boolean {
  console.log(`\n${CYAN}${BOLD}[T-1000] Step F: Re-running Playwright test to validate fix...${RESET}\n`);
  try {
    execSync(`npx playwright test ${testPath} --reporter=line`, { stdio: "inherit" });
    console.log(`\n${GREEN}${BOLD}[T-1000] Fix validated — Playwright test passes.${RESET}`);
    return true;
  } catch {
    console.log(`\n${RED}${BOLD}[T-1000] Fix validation failed — test still failing.${RESET}`);
    return false;
  }
}

// Step G: Ship — create branch, commit, open PR
function shipFix(issue: SentryIssue): void {
  console.log(`\n${CYAN}${BOLD}[T-1000] Step G: Shipping fix...${RESET}\n`);

  const branch = `fix/T1000-${issue.id}`;

  // Clean up existing branch if re-running
  try {
    execSync(`git branch -D ${branch} 2>/dev/null`, { stdio: "pipe" });
  } catch {
    // Branch didn't exist, that's fine
  }

  execSync(`git checkout -b ${branch}`, { stdio: "inherit" });
  execSync(`git add .`, { stdio: "inherit" });
  execSync(`git commit -m "T-1000: Automated fix for ${issue.id}"`, { stdio: "inherit" });

  // Attempt PR creation — gracefully skip if gh is not configured
  try {
    execSync(
      `gh pr create --title "T-1000 Auto-Fix: ${issue.title}" --body "Automated RCA and Playwright regression test generated by T-1000.\n\nIssue: ${issue.id}\nTrace: ${issue.trace}"`,
      { stdio: "inherit" },
    );
    console.log(`\n${GREEN}${BOLD}[T-1000] PR created. Pipeline complete.${RESET}`);
  } catch {
    console.log(`\n${YELLOW}${BOLD}[T-1000] Could not create PR (gh CLI not configured). Branch committed locally.${RESET}`);
    console.log(`  ${DIM}Run manually: gh pr create --title "T-1000 Auto-Fix: ${issue.title}"${RESET}`);
  }
}

// Main pipeline
async function runT1000Pipeline(): Promise<void> {
  console.log(`\n${BOLD}${"━".repeat(72)}${RESET}`);
  console.log(`  ${RED}${BOLD}T-1000${RESET} ${DIM}— Autonomous Software Factory${RESET}`);
  console.log(`${BOLD}${"━".repeat(72)}${RESET}`);

  // Pre-flight: check server is running
  const serverUp = await checkServerRunning();
  if (!serverUp) {
    console.error(`\n${RED}${BOLD}[T-1000] ERROR:${RESET} Demo app is not running on http://localhost:3000`);
    console.error(`  ${YELLOW}Start it first:${RESET} npm run dev`);
    process.exit(1);
  }
  console.log(`\n  ${GREEN}${BOLD}Server detected${RESET} on http://localhost:3000`);

  // Step A
  const issue = await fetchLatestSentryIssue();

  // Step B
  const testPath = generatePlaywrightTest(issue);

  // Step C
  const bugReproduced = verifyFailure(testPath);
  if (!bugReproduced) {
    process.exit(0);
  }

  // Steps D → F loop
  let fixed = false;
  let attempt = 0;
  while (!fixed) {
    attempt++;
    console.log(`\n${DIM}--- Attempt ${attempt} ---${RESET}`);

    // Step D
    emitAgentDirective(issue);

    // Step E
    await waitForAgentFix();

    // Step F
    fixed = validateFix(testPath);
    if (!fixed) {
      console.log(`\n${YELLOW}${BOLD}[T-1000] Looping back — agent must try a different fix.${RESET}\n`);
    }
  }

  // Step G
  shipFix(issue);
}

runT1000Pipeline().catch((err) => {
  console.error(`\n${RED}${BOLD}[T-1000] Fatal error:${RESET}`, err);
  process.exit(1);
});
