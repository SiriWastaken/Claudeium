---
name: run
description: Orchestrate a multi-step development task - plan it into file-owned subtasks, delegate to scoped worker agents, and gate completion on independent verification. Use for /claudeium:run <task>, or when a task has several separable parts.
argument-hint: <task description>
disable-model-invocation: true
---

Task: $ARGUMENTS

Use Claudeium's ledger (`node "${CLAUDE_PLUGIN_ROOT}/core/ledger.js"`, below `L`; run it from the project root). Follow these steps in order. Skip orchestration entirely if the task is one small change: just do it and say so.

1. **Investigate** with Read/Grep first. Decide the subtasks from what the code actually looks like.
2. **Write the plan** to `.claudeium/plan.json`:
   `{"goal": "...", "acceptance": ["..."], "constraints": ["..."], "tasks": [{"id": "t1", "title": "...", "files": ["src/a.ts"], "deps": [], "verify": "npm test -- a"}]}`
   (`acceptance` and `constraints` are optional; they travel in handoffs.)
   - `files`: every path the task may modify (relative; a directory owns everything under it). Two tasks that share a file must not run in parallel, so give them a dep.
   - `verify`: a concrete non-destructive command whose exit code proves the task. No verify command, no task.
3. **Show the user the plan** (ids, titles, owned files, deps, verify commands) and wait for approval before any edits.
4. `L init .claudeium/plan.json`. A rejected plan means fix the plan; do not bypass the validator.
5. **Loop** until `L next` returns an empty batch:
   - `L next` gives startable tasks (deps verified, disjoint files, at most 3). `L start <ids>`.
   - Spawn one `claudeium:worker` per started task (in parallel in a single message when more than one), passing id, title, owned files, verify command, and prior tasks' NOTES. Workers never spawn agents; neither may you recurse.
   - Per worker report: `STATUS: done` -> `L done <id> --summary "<one line>" --changed "<files>" --risks "<unverified assumptions>"`; `STATUS: blocked` -> `L block <id> --reason "..."`; malformed or missing report -> `L fail <id> --reason "no valid report"`. Record discoveries other tasks need with `L note "<text>"`.
   - For each done task spawn a `claudeium:verifier` (give it the worker report). Record its result: `L verify <id> --by verifier --exit <EXIT> --evidence "<EVIDENCE>"`, or `--status blocked --by verifier --evidence "..."` if its STATUS is blocked (task stays `done`, unverified). If the verifier was blocked (e.g. no Bash permission) you may run the verify command yourself and record it with `--by orchestrator`; the ledger then marks the task "not independent", and your final report must say so. Extra checks the verifier ran: `L check <id> --by verifier --cmd "..." --status passed|failed|blocked|not_run [--exit N]`. A failed check fails the task; retry at most once, by re-planning the task with the failure output.
6. A failed or blocked task blocks its dependents (`L next` lists them as `blocked`). Report them; don't paper over them.
7. If Ponytail is installed (`node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.js"`), its hooks already inject its rules into workers. Optionally suggest `/ponytail-review` on the final diff.
8. `L status` (shows STALE if owned files changed after verification; re-verify those), then `L handoff --md` if work is incomplete, then `L close`. Final message: per task, state, and the evidence line. State plainly which tasks failed or were never run. Never say "tests pass" for anything without a recorded `verified` entry.

Never run git commit or push; tell the user what to commit and suggest a message.
