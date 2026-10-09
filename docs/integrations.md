# Integrations

## Adapter contract

The core is driven through one interface: the CLI `node core/ledger.js <command>` (state in `<project>/.claudeium/ledger.json`, project dir from `CLAUDEIUM_PROJECT_DIR` or the current directory). An adapter for an agent environment must:

1. **Call the CLI** for every state change; never edit the ledger file by hand.
2. **Provide roles:** a worker (edits only its owned files, returns a structured report) and a verifier (runs the verify command, edits no source, returns STATUS/EXIT/EVIDENCE). Reference prompts: `agents/worker.md`, `agents/verifier.md`.
3. **Run commands through the host's own permission system.** The core never executes plan commands.
4. **Optionally guard completion:** `ledger.js stop-status` prints `{"block": bool, "reason": string}`; wire it to whatever end-of-turn hook exists, fail open, block at most once per attempt.
5. **Degrade visibly.** If the host cannot spawn helpers, run tasks sequentially in one agent—the ledger still enforces ownership, ordering, and evidence. If it cannot run commands, record checks as `blocked` with the reason; do not record `passed`.

No adapter exists beyond Claude Code. Any agent that can run shell commands can already use the CLI by hand following [AGENTS.md](../AGENTS.md); that path is untested with other products.

## Claude Code

| Capability | Mechanism |
|---|---|
| Commands | skills `run`, `verify` (user-invoked) and commands `status`, `doctor` |
| Roles | plugin agents `worker`, `verifier`, with explicit `tools:` lists that exclude agent spawning |
| Completion guard | `Stop` hook → `scripts/stop-hook.js` (maps `CLAUDE_PROJECT_DIR` to `CLAUDEIUM_PROJECT_DIR`) |
| Capability detection | `scripts/doctor.js` (`/claudeium:doctor`): node version, git, Ponytail install, ledger presence |

Claude-specific names (`${CLAUDE_PLUGIN_ROOT}`, `Task`, hook JSON) are confined to the plugin directories and `scripts/`.

## Ponytail

[Ponytail](https://github.com/DietrichGebert/ponytail) (inspected locally at v5.0.0) is a behaviour plugin: skills (`/ponytail-review`, `/ponytail-audit`, …) and lifecycle hooks. It exposes **no API or CLI** for other plugins.

What Claudeium actually relies on:

- Ponytail's `SubagentStart` hook injects its ruleset into subagents when its mode is active (optionally limited by its `PONYTAIL_SUBAGENT_MATCHER` env var). Claudeium workers and verifiers are subagents, so they inherit it with no Claudeium code. This is Ponytail's behaviour; Claudeium neither enables nor controls it.
- `doctor` reads Claude's plugin registry (`<claude dir>/plugins/installed_plugins.json`) to report whether a `ponytail@…` plugin is installed. It does not read Ponytail's mode state, whose format is Ponytail's to change.
- The run skill suggests running `/ponytail-review` on the final diff when present.

If Ponytail is absent, nothing breaks; `doctor` says so. Verified: the registry-read path with and without Ponytail (`tests/structure.test.js`), and the plugin loading alongside Ponytail in a real session. Not verified: that injected rules measurably change worker output.
