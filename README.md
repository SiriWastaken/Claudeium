# Claudeium (Claude²)

An execution, orchestration and verification layer for AI-assisted development. Principle: **any compatible agent can contribute; every meaningful result is traceable; completion needs evidence.**

Today it ships as a Claude Code plugin on top of a small platform-independent core, plus a portable [`AGENTS.md`](AGENTS.md) that any coding agent can follow.

## What it adds

| Capability | What exists |
|---|---|
| Evidence-based completion | A ledger where a task is `verified` only after a recorded passed check; `blocked`/`not_run` never count; evidence is bound to a file fingerprint so later edits show `STALE`. |
| Reliable handoffs | `handoff` emits a versioned, validated snapshot another agent can resume from (`resume` imports it; verification must be redone). |
| Safe parallelism | Tasks declare owned files; parallel batches (≤3) must be file-disjoint. |
| Capability awareness | `/claudeium:doctor` reports node, git, Ponytail; docs define fallbacks. |
| Portability | Core is Node-stdlib-only and agent-agnostic; Claude Code is the first adapter. |

Delegation and planning themselves are Claude Code's. What is and isn't novel: [docs/design-principles.md](docs/design-principles.md).

## Install

Requires Claude Code and Node ≥ 18 on PATH.

```
/plugin marketplace add SiriWastaken/Claudeium
/plugin install claudeium@claudeium
```

(Send the two lines as separate prompts. This works once the repo is pushed to GitHub; until then, or to try local changes:)

```
claude --plugin-dir /path/to/Claudeium     # load for one session
```

## Quick start

```
/claudeium:doctor
/claudeium:run add input validation to the signup endpoint and cover it with tests
/claudeium:status
/claudeium:verify t2
```

`run` investigates, proposes a plan (tasks, owned files, deps, verify command), waits for your approval, then loops: worker agent per task → independent verifier agent → recorded evidence. Final report lists verified, failed, blocked and never-run tasks. It never commits or pushes.

Without Claude Code, any agent that can run shell commands can use the core by hand:

```
node core/ledger.js init plan.json
node core/ledger.js next
node core/ledger.js handoff --md
```

Full command reference: [docs/verification.md](docs/verification.md) and `node core/ledger.js` (prints usage).

## Supported environments

| Environment | Status |
|---|---|
| Claude Code (plugin) | Implemented. Exercised once end to end in a headless session on a two-file toy task (plan → 2 workers → 2 verifiers → ledger); verifiers lacked Bash permission there, see Troubleshooting. |
| Other agents via `AGENTS.md` + ledger CLI | Intended; untested with other products. |
| Windows | Untested. |

## Ponytail

Optional. Ponytail has no API; its own hook injects its rules into subagents, so Claudeium's workers inherit them when Ponytail is active. Details and limits: [docs/integrations.md](docs/integrations.md).

## Documentation

[Architecture](docs/architecture.md) · [Design principles](docs/design-principles.md) · [Verification](docs/verification.md) · [Handoffs](docs/handoffs.md) · [Integrations](docs/integrations.md) · [Security](docs/security.md) · [Testing](docs/testing.md) · [Plugin development](docs/plugin-development.md) · [Roadmap](docs/roadmap.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Tests

`npm test`, `npm run lint` — see [docs/testing.md](docs/testing.md) for coverage and what is not tested.

## Troubleshooting

- *Hook shows `node: command not found`*: Node must be on the non-interactive shell PATH.
- *Blocked from finishing with "unfinished tasks"*: verify them, `fail`/`block` them with a reason, or `node core/ledger.js close`.
- *`an open ledger exists`*: `close` it, or `init --force`.
- *`ledger is corrupt`*: inspect or delete `.claudeium/ledger.json`; Claudeium will not overwrite it.
- *Verifier agents report `blocked` (Bash permission denied)*: seen in a headless run. Plugin agents can't set their own permission mode; approve the prompt in an interactive session, or add the verify commands to `permissions.allow` in your settings. Otherwise tasks end up `verified, not independent`. Details: [docs/verification.md](docs/verification.md#independence).
- *A task shows `STALE`*: its owned files changed after verification; re-verify.

## Limitations

Evidence is model-reported by the verifier agent, not executed by the core; file ownership is instructed, not enforced; redaction is best-effort; one ledger per project. See [docs/roadmap.md](docs/roadmap.md).

## License

MIT (assumed; no prior license existed — change if you intend otherwise).
