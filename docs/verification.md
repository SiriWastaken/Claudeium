# Verification

Authoritative description of evidence records and completion rules. Implementation: `core/ledger.js`.

## Task states

`pending → running → done → verified`, with `failed` and `blocked` as terminal states.

| State | Meaning | How reached |
|---|---|---|
| `pending` | not started | `init`, or `recover` |
| `running` | a worker owns it | `start` (requires deps `verified`, file-disjoint, ≤3 running) |
| `done` | worker reports finished; **unverified** | `done --summary [--changed] [--risks]` |
| `verified` | all checks' latest results passed | `verify` (see below) |
| `failed` | a check failed, or the worker gave no valid report | `verify`, `fail --reason` |
| `blocked` | cannot proceed (e.g. needs a credential) | `block --reason` |

Illegal transitions are rejected (e.g. verifying a `pending` or `running` task).

## Checks

Each check is `{cmd, status, exit?, at, by, note?}`; `note` holds the evidence excerpt; `by` is `verifier`, `orchestrator`, `worker` or `unspecified`.

| Status | Meaning | Rule |
|---|---|---|
| `passed` | ran, exit 0 | requires `--exit 0` |
| `failed` | ran, nonzero | rejects `--exit 0` |
| `blocked` | could not run (missing tool, no permission) | task stays `done` |
| `not_run` | deliberately skipped | task stays `done` |

`verify <id> --exit N --evidence …` records a check for the task's own `verify` command (or `--status blocked|not_run`). Extra checks use `check <id> --cmd … --status …`. The latest result per command counts. A task becomes `verified` only if there is at least one check and every command's latest status is `passed`; any `failed` makes it `failed`; otherwise it stays `done`. Absence of a failure is never enough.

## Records

`.claudeium/ledger.json` (schema 1) stores per task: status, summary, changed files, risks, attempts, checks, and—on verification—a SHA-256 fingerprint of the owned paths and `verifiedAt`.

- **Stale results:** `stale` / `status` compare the fingerprint to the current files. A mismatch prints `STALE`: re-verify. Stale is advisory and does not block stopping, because later tasks can legitimately edit overlapping paths. The fingerprint hashes up to 5000 files per task, skipping `.git`, `node_modules`, `.claudeium`.
- **Crash/interruption:** writes are atomic (temp file + rename) under a directory lock; locks older than 10 s are broken. `recover` returns `running` tasks to `pending` and the attempt count is kept. A corrupt ledger raises an error; `init` will not overwrite it.
- **Secrets:** persisted text is passed through `clean()`: pattern-based redaction (private keys, `Bearer …`, common token prefixes, `password=`/`token:` style pairs) and a 2000-character cap. Best effort: see [security.md](security.md).

## Independence

`status` and handoffs mark a `verified` task `not independent` unless every deciding check was recorded with `--by verifier`. This matters in practice: in a headless Claude Code run the verifier agents were denied Bash, recorded `blocked`, and the orchestrator ran the commands itself (`--by orchestrator`). The result is still `verified`, but visibly not independently. Fix by granting the verifier's Bash use in your permission settings.

## Trust limits

The ledger records what it is told. The verifier agent's exit code and excerpt are model-reported; the core cannot confirm the command ran. What it does guarantee: no `verified` without a recorded passed check, no silent promotion of blocked/not-run, and no unnoticed edits after verification (fingerprint). Treat `verified` as "a distinct agent reported a passing run on this exact content", not as proof of correctness.

## Completion criteria

A run is complete when every task is `verified` (not stale), or is `failed`/`blocked` with a stated reason that the final report surfaces. The Claude Code Stop hook enforces only the weaker part: it blocks once while an open ledger has `pending`/`running`/`done` tasks.
