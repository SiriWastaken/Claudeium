# core/ rules

Overrides the root file for this directory.

- `core/` is platform-independent: Node standard library only; no references to any agent product, its tool names, hooks, or environment variables. Platform glue belongs in `scripts/` or the plugin directories.
- Core never executes plan or verify commands and never touches the network.
- Anything persisted goes through `clean()` (redaction, truncation). Changing the ledger or handoff shape requires a schema/version decision: see `docs/handoffs.md` and `docs/verification.md`.
- New ledger behavior needs a test in `tests/ledger.test.js` covering the failure path, not only the happy path.
