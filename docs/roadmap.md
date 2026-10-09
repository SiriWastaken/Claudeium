# Roadmap

## Implemented (v0.2.0)

- Ledger with validated plans, file-disjoint batching (≤3), state machine, structured checks (`passed|failed|blocked|not_run`), content fingerprints and stale detection, secret redaction, locking, atomic writes, crash `recover`.
- Handoff v1 build / markdown render / validate / resume into a fresh ledger (verification re-required).
- Claude Code plugin: `run`, `verify`, `status`, `doctor`; `worker` and `verifier` agents; Stop guard.
- Universal `AGENTS.md` (+ `core/AGENTS.md`), documentation set, automated tests (see docs/testing.md).

## Planned (not built)

- Enforce file ownership at edit time (needs a way to attribute edits to a worker; host-dependent).
- Plan-quality eval suite via `claude plugin eval`.
- Optional git integration to derive "files changed" instead of trusting reports.

## Open questions

- Can verifier output be tied to a real execution without the core running commands (e.g., a host-provided transcript)?
- Is a second adapter worth building before someone needs one? Which environment first?
- Should stale verification block completion, given legitimate overlapping edits by later tasks?
- How should multi-session runs share one ledger safely (locking is local to a filesystem)?
