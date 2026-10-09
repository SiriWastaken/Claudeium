# Architecture

Claudeium has one small core and a thin adapter per agent environment. Only the Claude Code adapter exists today.

```
┌─────────────────────────── Claude Code adapter (Claude-specific) ───────────────────────────┐
│ .claude-plugin/plugin.json   skills/run, skills/verify   commands/status, commands/doctor    │
│ agents/worker.md, agents/verifier.md      hooks/hooks.json → scripts/stop-hook.js            │
│ scripts/doctor.js (capability report)                                                        │
└───────────────┬──────────────────────────────────────────────────────────────────────────────┘
                │ shell calls: node core/ledger.js <command>
┌───────────────▼────────────── Core (platform-independent, Node stdlib only) ─────────────────┐
│ core/ledger.js  (validation · batching · state machine · checks · redaction ·                │
│                 fingerprints · lock · recovery · CLI)                                        │
│ core/handoff.js build / validate / render handoff v1                                         │
└───────────────┬──────────────────────────────────────────────────────────────────────────────┘
                │ file
        <project>/.claudeium/ledger.json
```

## Components and boundaries

| Component | Layer | Responsibility |
|---|---|---|
| `core/ledger.js` | portable | Everything deterministic. Never runs plan commands, never uses the network, knows no agent product. |
| `core/handoff.js` | portable | Pure functions over a ledger object. |
| `AGENTS.md`, `core/AGENTS.md` | portable | Instructions any agent can follow without Claudeium installed. |
| `skills/`, `commands/`, `agents/`, `hooks/`, `.claude-plugin/` | Claude Code | Prompts and wiring. The only place Claude tool names and variables appear. |
| `scripts/stop-hook.js` | Claude Code | Translates `core stop-status` into Claude's Stop-hook protocol; fails open. |
| `scripts/doctor.js` | Claude Code | Reports node, git, Ponytail, ledger presence. |
| Ponytail | external, optional | See [integrations.md](integrations.md). |

## Data flow for `/claudeium:run`

1. The orchestrating model investigates and writes `.claudeium/plan.json`; the user approves it.
2. `ledger.js init` validates (unique ids, known deps, no cycles, relative in-project paths, required `verify`) and writes the ledger.
3. `next` returns ready tasks (all deps `verified`), pairwise file-disjoint and not overlapping running tasks, max 3. `start` re-checks this under a lock.
4. A `worker` agent runs each started task. Its report is recorded with `done` / `block` / `fail`.
5. A separate `verifier` agent re-runs the verify command. `verify` records the check and decides the state ([verification.md](verification.md)).
6. `status`, `stale`, `handoff` read the ledger; `close` ends the run.

The model is the scheduler; the core is the rulebook. The core refuses illegal transitions but cannot make the model call it.

## Extension points

- **New agent environment:** write an adapter that (a) shells out to `core/ledger.js`, (b) supplies worker/verifier roles with equivalents of the prompts in `agents/`, (c) optionally wires an end-of-turn guard using `ledger.js stop-status`. Contract: [integrations.md](integrations.md).
- **New ledger command:** add to the `cmds` table in `core/ledger.js`, with a failure-path test and a doc line.
- **New check kinds:** checks are `{cmd, status, exit, at, note}`; status is one of `passed|failed|blocked|not_run`. Add statuses only with a schema decision.
