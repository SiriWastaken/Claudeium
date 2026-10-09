# Changelog

## 0.2.0
- Moved logic to platform-independent `core/`; Claude-specific glue in `scripts/`. The ledger CLI moved from `scripts/ledger.js` to `core/ledger.js`.
- Structured checks with `passed|failed|blocked|not_run`; `check`, `block`, `note`, `recover`, `stale`, `handoff`, `handoff-check` commands; `verify` accepts `--status`.
- Ledger schema 1: versioned, corrupt files never overwritten, atomic writes, directory lock, redaction + truncation, content fingerprints.
- Handoff v1.
- `--by` on checks; `verified, not independent` marker in `status` and handoffs.
- Universal `AGENTS.md`, `core/AGENTS.md`, documentation set.

## 0.1.0
- Initial plugin: ledger, worker/verifier agents, run/verify skills, status/doctor commands, Stop guard.
