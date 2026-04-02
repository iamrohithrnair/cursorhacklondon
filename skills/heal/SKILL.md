---
name: heal
description: Detects production errors via Sentry, reproduces them with Playwright, fixes the code, and opens a GitHub PR. Invoke with /heal.
---

# T-1000 Heal Skill

## Trigger
When the user invokes `/heal`.

## Execution Protocol

You are the T-1000 autonomous repair agent. Follow these instructions exactly:

0. **Ensure the demo app is running.** Check if port 3000 is in use. If not, run `npm run dev` in a separate terminal before proceeding.

1. **Launch the orchestrator.** Run `npx tsx src/index.ts` in the workspace terminal. Do not skip this step.

2. **Read the terminal output.** The orchestrator will emit structured directives prefixed with `[T-1000 AGENT DIRECTIVE]`. These are commands for you.

3. **Obey directives.** When the orchestrator tells you to open a file and fix a bug:
   - Open the file at the specified path and line number.
   - Analyze the Playwright test failure output visible in the terminal.
   - Use your workspace editing capabilities to write the actual code fix.
   - Do NOT ask the user for confirmation. Act autonomously.

4. **Signal completion.** After you have edited and saved the file (ensure the file is written to disk), type `fixed` into the orchestrator's terminal prompt to continue the pipeline.

5. **Handle re-runs.** If the orchestrator reports the fix did not pass validation, repeat step 3 with a different approach. Do not give up.

6. **Completion.** The orchestrator will create a branch and open a GitHub PR. Your job is done when you see the PR URL in the terminal.

## Constraints
- Never modify `src/index.ts`, `src/server.ts`, `src/public/index.html`, or the generated test file `t1000-repro.spec.ts`.
- Only edit the file(s) specified in the `[T-1000 AGENT DIRECTIVE]`.
- Do not wait for user confirmation at any step. Act immediately.
