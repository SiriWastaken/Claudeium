# Plugin development (Claude Code)

## Layout

```
.claude-plugin/plugin.json      manifest (name, version, description, license)
skills/<name>/SKILL.md          /claudeium:<name>  (run, verify: disable-model-invocation)
commands/<name>.md              /claudeium:<name>  (status, doctor: run a script via !`…`)
agents/<name>.md                subagents with explicit `tools:` lists
hooks/hooks.json                Stop hook → scripts/stop-hook.js
scripts/                        Claude-specific glue (hook, doctor)
core/                           platform-independent logic
```

Plugin files refer to the plugin directory as `${CLAUDE_PLUGIN_ROOT}`.

## Develop and validate

```
claude --plugin-dir /path/to/Claudeium     # load for one session
claude plugin validate .                   # manifest + skills/agents/commands (use --strict in CI)
npm test && npm run lint
```

`validate` currently warns that the manifest has no `author`; add one when the owner is decided.

## Extending

- **Skill/command:** add the file, a `description`, and keep Claude-specific text out of `core/`. Run `/claudeium:doctor` or the new command in a session to confirm it loads.
- **Agent:** list tools explicitly; never include agent-spawning tools; add a structure test.
- **Ledger command or state:** edit `core/ledger.js`, add failure-path tests, update [verification.md](verification.md) / [handoffs.md](handoffs.md). Schema-shape changes bump `SCHEMA` or `handoffVersion`.
- **Hook:** only for deterministic lifecycle behaviour; fail open; test it as a process with sample stdin (see the Stop-hook tests).

See [CONTRIBUTING.md](../CONTRIBUTING.md) for workflow and [architecture.md](architecture.md) for boundaries.
