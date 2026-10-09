#!/usr/bin/env node
// Claude Code adapter: Stop hook. Translates core's stop-status into Claude's hook protocol.
// Fails open: any error allows the stop, so a broken ledger can never wedge a session.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

try {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* first stop */ }
  if (input.stop_hook_active) process.exit(0); // block at most once per stop attempt
  const r = spawnSync('node', [path.join(__dirname, '../core/ledger.js'), 'stop-status'], {
    encoding: 'utf8', env: { ...process.env, CLAUDEIUM_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR || process.cwd() },
  });
  if (r.status !== 0) process.exit(0);
  const { block, reason } = JSON.parse(r.stdout);
  if (block) console.log(JSON.stringify({ decision: 'block', reason }));
} catch { /* fail open */ }
