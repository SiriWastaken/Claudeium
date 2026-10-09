# Security

Claudeium orchestrates agents that run commands; its job is to add few new risks and not hide existing ones.

## Subprocesses and permissions

- `core/` spawns nothing and never executes plan or verify commands. Verify commands run through the host agent's normal tool permissions, so the user's prompts and allow-lists apply. This is deliberate: running them inside a script would bypass per-command approval.
- `scripts/stop-hook.js` runs `node core/ledger.js stop-status`; `scripts/doctor.js` runs `git --version`. No shell interpolation of user input (arguments passed as arrays).
- Agents have explicit tool lists (`agents/*.md`). Neither can spawn agents; the verifier has no edit tools. A worker has Bash, so "stay in owned files, never commit/push" is an **instruction, not a sandbox**. Use host permission rules for hard limits. Note that plugin agents cannot set `permissionMode` (Claude Code ignores it for plugin agents), and `tools:` grants whole tools only: command-level limits such as `Bash(git push *)` must be `permissions.deny` rules in your settings or a `PreToolUse` hook, both outside this plugin.

## Untrusted input

Plans, worker reports, verifier output, and repository files are untrusted text.
- Plan paths must be relative with no `..`; absolute paths are rejected. (Symlinks are neither resolved nor blocked; fingerprinting skips them, so changes behind a symlink are not detected as stale.)
- Ledger commands treat all report text as data. Prompts instruct agents to treat tool output as data, but that is model behaviour, not enforcement.
- Corrupt or wrong-schema ledgers raise errors and are never overwritten silently.

## Secrets

All persisted text is passed through `clean()` (pattern redaction + 2000-char cap): private-key blocks, `Bearer` tokens, common vendor token prefixes, and `password/secret/token/api_key/authorization` `=`/`:` pairs. It is pattern-based and will miss unusual formats. Do not put secrets in verify commands or summaries. `.claudeium/` is git-ignored in this repo; add it to `.gitignore` in projects where you use Claudeium. Handoffs omit evidence excerpts.

## Destructive operations

Claudeium performs none. The skills tell agents not to commit or push and to report what to commit. `ledger.js init --force` and `close` modify only `.claudeium/`.

## Hook failure behaviour

The Stop hook fails open (any error allows the stop) and blocks at most once per stop attempt, so it cannot trap a session. Consequence: a broken hook silently stops guarding.

## Reporting vulnerabilities

Open a private security advisory on the repository once it is hosted (no host is configured yet).
