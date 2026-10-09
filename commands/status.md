---
description: Show the Claudeium ledger (tasks, states, failure reasons)
allowed-tools: Bash(node:*)
---
!`node "${CLAUDE_PLUGIN_ROOT}/core/ledger.js" status`

Summarize the ledger above in two lines: what is verified, what is open or failed.
