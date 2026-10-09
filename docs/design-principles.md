# Design principles

Principle: **any compatible agent can contribute; every meaningful result is traceable; completion needs evidence.**

## What is novel here, and what is not

| Capability | Status | Honest assessment |
|---|---|---|
| Subagent delegation, plan-then-execute | Established | Claude Code and others do this natively. Claudeium uses it; it does not improve on it. |
| Portable `AGENTS.md` | Established convention | We contribute a tight rule set, not the idea. |
| Task/handoff notes | Established | Many tools keep progress files. Ours is schema-validated and versioned. |
| Disjoint-file parallel batching, enforced at start | Modest | A deterministic check that parallel tasks do not share owned paths. Ownership is not enforced at edit time ([roadmap](roadmap.md)). |
| Evidence-gated task state | Modest, implemented | `verified` is reachable only through a recorded passed check; blocked/not-run never count as passed; evidence is bound to a content fingerprint of the owned files, so later edits flag it `STALE`. |
| Capability-aware execution | Minimal, implemented | `doctor` reports node/git/Ponytail; skills tell the agent to fall back. No automatic adaptation. |
| Pluggable orchestration | Aspirational | Core/adapter split exists; only one adapter. Other environments are untested. |

Nothing here is a research breakthrough. The value is combining small enforced rules so that "done" means something.

## Trade-offs

- **Core is a CLI over a JSON file, not a service.** No daemon, DB, or MCP server: nothing to install or secure. Cost: no live push; the model must call it.
- **The core never executes plan commands.** Verify commands are model-written, so running them inside a script would bypass the host's permission prompts. Cost: evidence comes from a verifier agent's report, not a run the ledger controls ([verification.md](verification.md#trust-limits)).
- **Verification by a different agent.** Not proof, but removes the "grading my own homework" failure.
- **Fail-open guard.** The Stop hook allows a stop on any error. A broken guard must not trap a session. Cost: it can silently not guard.
- **Best-effort redaction** instead of promising secret safety.

## Non-goals

Wrapping model APIs or proxying prompts; replacing the agent's planner; sandboxing file access; a UI; provider adapters without a concrete user; guaranteeing model compliance with the skills.
