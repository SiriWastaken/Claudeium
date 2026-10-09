const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const mdFiles = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'core/AGENTS.md',
  ...fs.readdirSync(path.join(root, 'docs')).map((f) => `docs/${f}`)];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('every doc file is non-empty', () => {
  for (const f of mdFiles) assert.ok(read(f).trim().length > 100, f);
});

test('relative markdown links resolve', () => {
  for (const f of mdFiles) {
    for (const [, target] of read(f).matchAll(/\]\((?!https?:|#|mailto:)([^)#]+)(#[^)]*)?\)/g)) {
      assert.ok(fs.existsSync(path.join(root, path.dirname(f), target)), `${f} links to missing ${target}`);
    }
  }
});

test('ledger.js commands named in docs exist', () => {
  const usage = spawnSync('node', [path.join(root, 'core/ledger.js'), 'nope'], { encoding: 'utf8' }).stderr;
  const real = new Set(usage.match(/<(.*)>/)[1].split('|'));
  for (const f of [...mdFiles, 'skills/run/SKILL.md', 'skills/verify/SKILL.md', 'commands/status.md']) {
    for (const [, c] of read(f).matchAll(/ledger\.js[" ]+([a-z][a-z-]+)/g)) assert.ok(real.has(c), `${f}: unknown ledger command "${c}"`);
    for (const [, c] of read(f).matchAll(/`L ([a-z][a-z-]+)/g)) assert.ok(real.has(c), `${f}: unknown L command "${c}"`);
  }
});

test('documented npm scripts exist', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const f of mdFiles) for (const [, s] of read(f).matchAll(/npm (?:run )?(test|lint|[a-z]+)\b/g)) {
    if (['install', 'i'].includes(s)) continue;
    assert.ok(scripts[s], `${f}: npm script "${s}" missing`);
  }
});

test('root AGENTS.md is agent-agnostic', () => {
  const s = read('AGENTS.md').split('## 8.')[0]; // §8 is repo-specific by design
  for (const banned of [/claude/i, /anthropic/i, /openai|codex|gpt/i, /\bTask tool\b/, /CLAUDE_/, /hooks?\.json/, /\/[a-z-]+:[a-z-]+/, /subagent/i])
    assert.doesNotMatch(s, banned, `AGENTS.md (before §8) matches ${banned}`);
  assert.ok(s.length < 7000, 'root AGENTS.md should stay compact');
});

test('core/ has no agent-product references', () => {
  for (const f of fs.readdirSync(path.join(root, 'core')).filter((n) => n.endsWith('.js')))
    assert.doesNotMatch(read(`core/${f}`), /CLAUDE_|claude\b|anthropic/i, `core/${f}`);
});
