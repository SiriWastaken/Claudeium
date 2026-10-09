# Handoffs

A handoff is a compact snapshot of a run that a different agent—different context, tools, or model—can resume from. Produced by `node core/ledger.js handoff [--md]`; checked by `handoff-check <file>`. Implementation: `core/handoff.js`.

## Schema (`handoffVersion: 1`)

| Field | Content |
|---|---|
| `handoffVersion` | integer; consumers must reject unknown versions |
| `createdAt` | ISO timestamp |
| `objective` | the goal |
| `acceptance`, `constraints` | optional lists from the plan |
| `discoveries` | facts recorded with `note` |
| `tasks[]` | `id, title, status, files, deps, verify, attempts, stale, independent, [summary, changed, risks, reason], checks[{cmd,status,exit,at,by}]` |
| `remaining` | ids not `verified` |
| `failureModes` | `id: reason` for open tasks with a reason |
| `inspectFirst` | union of files owned by open tasks |

Check `note` text (evidence excerpts) is deliberately **not** included; it stays in the ledger.

`handoff-check` rejects: wrong version, missing objective, non-string lists, invalid status, `verified` tasks without a passed check, `remaining` ids that do not exist.

## State transitions and ownership

A task is owned by whichever agent holds it in `running`. Ownership is exclusive: `start` refuses tasks whose files overlap a running task. A receiving agent resumes with `resume` (below) or by reading the handoff, then continues with the ledger CLI; `remaining` and `inspectFirst` say where to start.

## Recovery from interrupted work

1. `status` shows what was running when the session died.
2. `recover` returns `running` tasks to `pending` (attempts are kept; the task's reason records the interruption).
3. Inspect each such task's owned files for partial edits before restarting; the ledger cannot know what a dead worker changed.
4. Re-run `status` — verified tasks whose files changed show `STALE`.

## Resuming from a handoff

`node core/ledger.js resume <handoff.json>` validates the file and creates a ledger from it (refuses if an open ledger exists, unless `--force`). Verification does not transfer: the handoff carries no file fingerprint, so a `verified` task comes back as `done` and must be re-verified; `running` tasks come back as `pending`; imported checks are kept as `priorChecks` (history, not evidence). Dependents of an imported `done` task wait until it is re-verified.

## Not implemented

Signing handoffs; merging two ledgers; verifying that the receiving checkout matches the sender's. See [roadmap.md](roadmap.md).
