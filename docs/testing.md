# Testing

```
npm test        # node:test, no dependencies
npm run lint    # node --check on all scripts + `claude plugin validate .`
```

`npm run lint` needs the `claude` CLI; `npm test` skips only the validate test when it is missing.

## Suites

| File | Covers |
|---|---|
| `tests/ledger.test.js` | plan validation; overlap/batching/cap; dependency blocking; every transition rule; check statuses (blocked/not-run never verify); stale detection; fingerprint rules; redaction; recovery; concurrent writers (12 parallel processes); corrupt and wrong-schema ledgers; Stop-hook behaviour (block once, fail open); handoff build/render/validate/tamper |
| `tests/structure.test.js` | manifest; agents have tool lists with no agent-spawning, verifier has no edit tools; skills/commands frontmatter; hook script exists; `doctor` with and without Ponytail; `claude plugin validate` |
| `tests/docs.test.js` | markdown links resolve; every `ledger.js <command>` mentioned in docs exists; AGENTS.md has no product-specific tool names |

Tests create temporary project directories and spawn the real CLI; no network.

## Not covered (environmental or inherent)

- **Model behaviour.** Whether a model follows the skills, writes good plans, or spawns agents correctly is not automatically tested. `claude plugin eval` exists in the installed CLI but no eval suite has been written ([roadmap](roadmap.md)).
- **Other agent products.** `AGENTS.md` is checked for portability by lint-style rules, not by running other agents.
- **Windows.** Not run. The core uses `path.posix` normalisation and `os.tmpdir`, but untested.
- Real concurrent *agent* runs; the lock is tested with concurrent processes only.

## Manual end-to-end check (2026-10-09, Claude Code 2.1.295)

Headless `claude -p` session in a scratch repo: `/claudeium:run` wrote a plan for two independent files and stopped for approval; after approval it started both tasks in one batch, spawned two workers and two verifiers, the Stop hook flagged unverified tasks mid-run, both verifiers were denied Bash (recorded `blocked`), the orchestrator ran the verify commands and recorded `--by orchestrator`, and the ledger closed with both tasks verified. One toy run, not a reliability measurement.
