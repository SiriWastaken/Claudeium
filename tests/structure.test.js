const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const frontmatter = (p) => Object.fromEntries(read(p).match(/^---\n([\s\S]*?)\n---/)[1].split('\n').map((l) => l.split(/:\s*(.*)/s).slice(0, 2)));

test('manifest', () => {
  const m = JSON.parse(read('.claude-plugin/plugin.json'));
  assert.equal(m.name, 'claudeium');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test('marketplace lists this plugin and matches the manifest', () => {
  const m = JSON.parse(read('.claude-plugin/plugin.json'));
  const mk = JSON.parse(read('.claude-plugin/marketplace.json'));
  assert.equal(mk.plugins.length, 1);
  assert.equal(mk.plugins[0].name, m.name);
  assert.equal(mk.plugins[0].source, './');
  assert.ok(m.author && m.author.name);
  assert.equal(JSON.parse(read('package.json')).version, m.version, 'package.json and manifest versions must match');
});

test('agents have scoped tools and none can spawn agents', () => {
  for (const a of ['worker', 'verifier']) {
    const f = frontmatter(`agents/${a}.md`);
    assert.equal(f.name, a);
    assert.ok(f.description && f.tools);
    assert.ok(!/\b(Agent|Task)\b/.test(f.tools), `${a} must not be able to spawn agents`);
  }
  assert.ok(!/\b(Edit|Write)\b/.test(frontmatter('agents/verifier.md').tools), 'verifier is read-only on source');
});

test('skills and commands have descriptions; skills are user-invoked', () => {
  for (const s of ['run', 'verify']) {
    const f = frontmatter(`skills/${s}/SKILL.md`);
    assert.equal(f.name, s);
    assert.ok(f.description);
    assert.equal(f['disable-model-invocation'], 'true');
  }
  for (const c of ['status', 'doctor']) assert.ok(frontmatter(`commands/${c}.md`).description);
});

test('hooks reference an existing script', () => {
  const h = JSON.parse(read('hooks/hooks.json'));
  const cmd = h.hooks.Stop[0].hooks[0].command;
  assert.ok(fs.existsSync(path.join(root, cmd.match(/scripts\/[\w-]+\.js/)[0])));
});

test('doctor reports Ponytail absence cleanly (empty config dir)', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'claudeium-cfg-'));
  const r = spawnSync('node', [path.join(root, 'scripts/doctor.js')], { env: { ...process.env, CLAUDE_CONFIG_DIR: dir }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /ponytail: could not read plugin registry/);
});

test('doctor detects an installed Ponytail', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'claudeium-cfg-'));
  fs.mkdirSync(path.join(dir, 'plugins'));
  fs.writeFileSync(path.join(dir, 'plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'ponytail@ponytail': [{ version: '9.9.9' }] } }));
  const r = spawnSync('node', [path.join(root, 'scripts/doctor.js')], { env: { ...process.env, CLAUDE_CONFIG_DIR: dir }, encoding: 'utf8' });
  assert.match(r.stdout, /ponytail: installed \(ponytail@ponytail, v9\.9\.9\)/);
});

test('claude plugin validate passes (skipped if claude CLI missing)', (t) => {
  const r = spawnSync('claude', ['plugin', 'validate', root, '--json'], { encoding: 'utf8' });
  if (r.error) return t.skip('claude CLI not found');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
