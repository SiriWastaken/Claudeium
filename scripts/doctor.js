#!/usr/bin/env node
// Claude Code adapter: capability report. Reads files / runs `git --version` only.
// Each line is "name: state" so agents can adapt (see docs/integrations.md).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const out = [`node: ${process.version}`];
const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
out.push(git.status === 0 ? `git: ${git.stdout.trim()}` : 'git: unavailable (the ledger works; "files changed" must be reported by hand)');
try {
  const reg = JSON.parse(fs.readFileSync(path.join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf8'));
  const p = Object.entries(reg.plugins || {}).find(([k]) => k.startsWith('ponytail@'));
  out.push(p ? `ponytail: installed (${p[0]}, v${p[1][0]?.version})` : 'ponytail: not installed (optional; Claudeium works without it)');
} catch {
  out.push('ponytail: could not read plugin registry (optional; Claudeium works without it)');
}
// Ponytail's mode lives in its own per-project state; its hooks inject it into subagents. Not read here.
const ledger = path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.claudeium', 'ledger.json');
out.push(`ledger: ${fs.existsSync(ledger) ? 'present' : 'none'}`);
out.push('verifier permissions: plugin agents cannot set permissionMode; verify commands need Bash approval from your session (interactive prompt, or permissions.allow). Otherwise results are recorded "not independent".');
console.log(out.join('\n'));
