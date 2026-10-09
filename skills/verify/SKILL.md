---
name: verify
description: Independently verify a claim that work is done - spawn the verifier agent against a task's verify command. Use for /claudeium:verify [task id | command to check].
argument-hint: [task id | verify command]
disable-model-invocation: true
---

Target: $ARGUMENTS

- If the target is a ledger task id: read it with `node "${CLAUDE_PLUGIN_ROOT}/core/ledger.js" status --json`, spawn `claudeium:verifier` with its id, files, verify command and summary, then record the result with `ledger.js verify <id> --by verifier --exit <N> --evidence "<text>"` (or `--status blocked` if the verifier could not run it). Only `done` tasks can be verified.
- Otherwise treat the target (or, if empty, the most recent claim you made in this conversation) as an ad-hoc check: spawn `claudeium:verifier` with the command, record nothing in the ledger.

Report the verifier's EXIT, EVIDENCE and DISCREPANCIES verbatim. Do not summarize a failure into a pass.
