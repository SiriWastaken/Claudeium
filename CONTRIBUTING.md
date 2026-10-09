# Contributing

Requirements: Node ≥ 18; the `claude` CLI for plugin validation and manual loading. No dependencies to install.

```
npm test
npm run lint
claude --plugin-dir .      # try the plugin
```

Workflow: read [AGENTS.md](AGENTS.md) (applies to humans too: smallest correct change, tests with the change, docs in the same change). Layout and boundaries: [docs/architecture.md](docs/architecture.md); extending: [docs/plugin-development.md](docs/plugin-development.md).

Conventions:
- Node stdlib only; CommonJS; no build step.
- `core/` stays platform-independent ([core/AGENTS.md](core/AGENTS.md)).
- Every ledger rule gets a test for the rejection path.
- Docs must match behaviour; `tests/docs.test.js` checks links and command names.
- Add a [CHANGELOG.md](CHANGELOG.md) entry for user-visible changes.
- Do not commit `.claudeium/` or any real output containing secrets.
