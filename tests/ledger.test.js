const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validatePlan, overlap, clean, fingerprint } = require('../core/ledger.js');

const LEDGER = path.join(__dirname, '../core/ledger.js');
const STOP = path.join(__dirname, '../scripts/stop-hook.js');
const t = (id, files, deps = [], extra = {}) => ({ id, title: id, files, deps, verify: 'true', ...extra });

function project(tasks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudeium-'));
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ goal: 'g', tasks }));
  const run = (...args) => spawnSync('node', [LEDGER, ...args], { cwd: dir, env: { ...process.env, CLAUDEIUM_PROJECT_DIR: dir }, encoding: 'utf8' });
  const stop = (stdin = '{}') => spawnSync('node', [STOP], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, input: stdin, encoding: 'utf8' });
  return { dir, run, stop, next: () => JSON.parse(run('next').stdout) };
}

test('plan validation rejects bad plans', () => {
  assert.throws(() => validatePlan({ goal: 'g', tasks: [] }), /non-empty/);
  assert.throws(() => validatePlan({ goal: 'g', tasks: [t('a', ['x']), t('a', ['y'])] }), /duplicate/);
  assert.throws(() => validatePlan({ goal: 'g', tasks: [t('a', ['x'], ['zz'])] }), /unknown dep/);
  assert.throws(() => validatePlan({ goal: 'g', tasks: [t('a', ['x'], ['b']), t('b', ['y'], ['a'])] }), /cycle/);
  assert.throws(() => validatePlan({ goal: 'g', tasks: [t('a', ['../etc/passwd'])] }), /relative path/);
  assert.throws(() => validatePlan({ goal: 'g', tasks: [t('a', ['/abs'])] }), /relative path/);
  assert.throws(() => validatePlan({ goal: 'g', tasks: [t('a', ['x'], [], { verify: '' })] }), /verify/);
  assert.throws(() => validatePlan({ goal: 'g', tasks: [t('a', [])] }), /files/);
});

test('overlap treats directories as owning their contents', () => {
  assert.ok(overlap(['src'], ['src/a.js']));
  assert.ok(overlap(['./src/a.js'], ['src/a.js']));
  assert.ok(!overlap(['src'], ['srcx/a.js']));
});

test('batch is file-disjoint, dependency-ordered and capped at 3', () => {
  const p = project([t('a', ['src']), t('b', ['src/x.js']), t('c', ['lib']), t('d', ['doc']), t('e', ['t']), t('f', ['z'], ['a'])]);
  assert.equal(p.run('init', 'plan.json').status, 0);
  assert.deepEqual(p.next().batch.map((x) => x.id), ['a', 'c', 'd']); // b conflicts with a, e capped, f waits
});

test('start refuses conflicting or unready tasks', () => {
  const p = project([t('a', ['src']), t('b', ['src/x.js']), t('c', ['lib'], ['a'])]);
  p.run('init', 'plan.json');
  assert.notEqual(p.run('start', 'a', 'b').status, 0);
  assert.notEqual(p.run('start', 'c').status, 0);
  assert.equal(p.run('start', 'a').status, 0);
  assert.notEqual(p.run('start', 'b').status, 0, 'b overlaps running a');
});

test('lifecycle: only done tasks verify; exit!=0 fails and blocks dependents', () => {
  const p = project([t('a', ['x']), t('b', ['y'], ['a'])]);
  p.run('init', 'plan.json');
  assert.notEqual(p.run('verify', 'a', '--exit', '0', '--evidence', 'e').status, 0, 'cannot verify pending');
  p.run('start', 'a');
  assert.notEqual(p.run('verify', 'a', '--exit', '0', '--evidence', 'e').status, 0, 'cannot verify running');
  p.run('done', 'a', '--summary', 's');
  assert.notEqual(p.run('verify', 'a', '--exit', '0').status, 0, 'evidence required');
  assert.notEqual(p.run('verify', 'a', '--exit', 'ok', '--evidence', 'e').status, 0, 'exit must be integer');
  p.run('verify', 'a', '--exit', '1', '--evidence', '1 test failed');
  const n = p.next();
  assert.deepEqual(n.batch, []);
  assert.deepEqual(n.blocked, ['b']);
  assert.match(p.run('status').stdout, /\[failed\] a.*check failed.*exit 1/);
});

test('happy path unlocks dependents', () => {
  const p = project([t('a', ['x']), t('b', ['y'], ['a'])]);
  p.run('init', 'plan.json');
  p.run('start', 'a');
  p.run('done', 'a', '--summary', 's');
  p.run('verify', 'a', '--exit', '0', '--evidence', 'ok');
  assert.deepEqual(p.next().batch.map((x) => x.id), ['b']);
});

test('init refuses to clobber an open ledger', () => {
  const p = project([t('a', ['x'])]);
  assert.equal(p.run('init', 'plan.json').status, 0);
  assert.notEqual(p.run('init', 'plan.json').status, 0);
  p.run('close');
  assert.equal(p.run('init', 'plan.json').status, 0);
});

test('malformed plan file fails cleanly', () => {
  const p = project([t('a', ['x'])]);
  fs.writeFileSync(path.join(p.dir, 'plan.json'), '{not json');
  const r = p.run('init', 'plan.json');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /claudeium:/);
});

test('stop hook: blocks on unfinished work once; allows idle/closed/terminal/corrupt', () => {
  const p = project([t('a', ['x'])]);
  assert.equal(p.stop().stdout, '', 'no ledger -> allow');
  p.run('init', 'plan.json');
  assert.equal(JSON.parse(p.stop().stdout).decision, 'block');
  assert.equal(p.stop('{"stop_hook_active":true}').stdout, '', 'no loop');
  assert.equal(p.stop('garbage').status, 0);
  p.run('start', 'a');
  p.run('block', 'a', '--reason', 'needs creds');
  assert.equal(p.stop().stdout, '', 'blocked-with-reason counts as reported');
  const q = project([t('a', ['x'])]);
  q.run('init', 'plan.json');
  q.run('close');
  assert.equal(q.stop().stdout, '', 'closed -> allow');
});

test('corrupt ledger: hook fails open, CLI refuses to overwrite it', () => {
  const p = project([t('a', ['x'])]);
  fs.mkdirSync(path.join(p.dir, '.claudeium'));
  fs.writeFileSync(path.join(p.dir, '.claudeium/ledger.json'), '{corrupt');
  const r = p.stop();
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  const i = p.run('init', 'plan.json');
  assert.notEqual(i.status, 0, 'init must not silently replace a corrupt ledger');
  assert.match(i.stderr, /corrupt/);
  assert.equal(fs.readFileSync(path.join(p.dir, '.claudeium/ledger.json'), 'utf8'), '{corrupt');
});

test('unsupported ledger schema is rejected', () => {
  const p = project([t('a', ['x'])]);
  fs.mkdirSync(path.join(p.dir, '.claudeium'));
  fs.writeFileSync(path.join(p.dir, '.claudeium/ledger.json'), JSON.stringify({ schema: 99, tasks: [] }));
  assert.match(p.run('status').stderr, /unsupported schema/);
});

function doneTask(p, id = 'a') {
  p.run('start', id);
  assert.equal(p.run('done', id, '--summary', 's', '--changed', 'x.txt, y.txt', '--risks', 'none known').status, 0);
}

test('check statuses: blocked/not_run leave task done; all-latest-passed verifies', () => {
  const p = project([t('a', ['x.txt'])]);
  p.run('init', 'plan.json');
  doneTask(p);
  assert.notEqual(p.run('check', 'a', '--cmd', 'c', '--status', 'passed').status, 0, 'passed needs exit 0');
  assert.notEqual(p.run('check', 'a', '--cmd', 'c', '--status', 'failed', '--exit', '0').status, 0);
  assert.notEqual(p.run('check', 'a', '--cmd', 'c', '--status', 'weird').status, 0);
  assert.match(p.run('verify', 'a', '--status', 'blocked', '--evidence', 'no runner').stdout, /still done/);
  assert.match(p.run('status').stdout, /\[done\] a/);
  assert.match(p.run('verify', 'a', '--status', 'not_run', '--evidence', 'skipped').stdout, /still done/);
  p.run('check', 'a', '--cmd', 'lint', '--status', 'passed', '--exit', '0');
  assert.match(p.run('verify', 'a', '--exit', '0', '--evidence', 'ok').stdout, /verified/, 'latest check per command all passed');
});

test('absence of failure is not proof: verify with only blocked check never verifies', () => {
  const p = project([t('a', ['x.txt'])]);
  p.run('init', 'plan.json');
  doneTask(p);
  p.run('verify', 'a', '--status', 'blocked', '--evidence', 'e');
  assert.doesNotMatch(p.run('status').stdout, /verified/);
});

test('a later failing extra check fails a task whose own verify passed', () => {
  const p = project([t('a', ['x.txt'])]);
  p.run('init', 'plan.json');
  doneTask(p);
  p.run('check', 'a', '--cmd', 'lint', '--status', 'failed', '--exit', '1');
  assert.match(p.run('verify', 'a', '--exit', '0', '--evidence', 'ok').stdout, /failed/);
});

test('staleness: editing owned files after verification is flagged', () => {
  const p = project([t('a', ['x.txt'])]);
  fs.writeFileSync(path.join(p.dir, 'x.txt'), 'v1');
  p.run('init', 'plan.json');
  doneTask(p);
  assert.match(p.run('verify', 'a', '--exit', '0', '--evidence', 'ok').stdout, /verified/);
  assert.match(p.run('stale').stdout, /no stale/);
  fs.writeFileSync(path.join(p.dir, 'x.txt'), 'v2');
  assert.match(p.run('stale').stdout, /stale.*a/);
  assert.match(p.run('status').stdout, /verified.*STALE/);
  assert.equal(JSON.parse(p.run('handoff').stdout).tasks[0].stale, true);
});

test('fingerprint covers directories, ignores .git/node_modules', () => {
  process.env.CLAUDEIUM_PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'claudeium-fp-'));
  const d = process.env.CLAUDEIUM_PROJECT_DIR;
  fs.mkdirSync(path.join(d, 'src/node_modules'), { recursive: true });
  fs.writeFileSync(path.join(d, 'src/a.js'), '1');
  const f1 = fingerprint(['src']);
  fs.writeFileSync(path.join(d, 'src/node_modules/junk'), 'x');
  assert.equal(fingerprint(['src']), f1);
  fs.writeFileSync(path.join(d, 'src/a.js'), '2');
  assert.notEqual(fingerprint(['src']), f1);
  assert.notEqual(fingerprint(['missing']), fingerprint(['src']));
  delete process.env.CLAUDEIUM_PROJECT_DIR;
});

test('secrets are redacted and long text truncated before persisting', () => {
  assert.doesNotMatch(clean('key=sk-abcdefghijklmnopqrstuvwxyz1234'), /abcdefgh/);
  assert.doesNotMatch(clean('Authorization: Bearer abcdefghijklmnop1234'), /abcdefghijklmnop/);
  assert.doesNotMatch(clean('password=hunter2hunter2'), /hunter2/);
  assert.doesNotMatch(clean('-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----'), /MIIE/);
  assert.ok(clean('a'.repeat(5000)).length < 2100);
  const p = project([t('a', ['x'])]);
  p.run('init', 'plan.json');
  p.run('start', 'a');
  p.run('done', 'a', '--summary', 'used ghp_abcdefghijklmnopqrstuvwxyz0123');
  assert.doesNotMatch(fs.readFileSync(path.join(p.dir, '.claudeium/ledger.json'), 'utf8'), /ghp_abcdef/);
});

test('recover resets interrupted tasks to pending and counts attempts', () => {
  const p = project([t('a', ['x'])]);
  p.run('init', 'plan.json');
  p.run('start', 'a');
  assert.match(p.run('recover').stdout, /a/);
  assert.equal(p.run('recover').stdout.trim(), 'nothing to recover');
  p.run('start', 'a');
  const l = JSON.parse(p.run('status', '--json').stdout);
  assert.equal(l.tasks[0].attempts, 2);
});

test('concurrent writers do not lose updates', async () => {
  const tasks = Array.from({ length: 8 }, (_, i) => t('t' + i, ['f' + i]));
  const p = project(tasks);
  p.run('init', 'plan.json');
  const { spawn } = require('node:child_process');
  await Promise.all(Array.from({ length: 12 }, (_, i) => new Promise((res) => {
    const c = spawn('node', [LEDGER, 'note', 'n' + i], { env: { ...process.env, CLAUDEIUM_PROJECT_DIR: p.dir } });
    c.on('close', res);
  })));
  assert.equal(JSON.parse(p.run('status', '--json').stdout).discoveries.length, 12);
});

test('handoff: build, markdown render, validate, tamper detection', () => {
  const p = project([t('a', ['x']), t('b', ['y'], ['a'])]);
  p.run('init', 'plan.json');
  p.run('start', 'a');
  p.run('done', 'a', '--summary', 'did a', '--risks', 'assumed utf8');
  p.run('verify', 'a', '--exit', '1', '--evidence', '1 failing');
  const out = path.join(p.dir, 'h.json');
  fs.writeFileSync(out, p.run('handoff').stdout);
  assert.match(p.run('handoff-check', out).stdout, /valid/);
  const h = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(h.handoffVersion, 1);
  assert.deepEqual(h.remaining, ['a', 'b']);
  assert.match(h.failureModes[0], /a: check failed/);
  assert.deepEqual(h.inspectFirst, ['x', 'y']);
  assert.match(p.run('handoff', '--md').stdout, /\[failed\] a: a\n  - did: did a/);
  // tamper: claim verified with no passed check; wrong version; unknown remaining; garbage file
  const bad = (mut) => { const c = structuredClone(h); mut(c); fs.writeFileSync(out, JSON.stringify(c)); return p.run('handoff-check', out); };
  assert.match(bad((c) => { c.tasks[0].status = 'verified'; }).stderr, /verified without a passed check/);
  assert.match(bad((c) => { c.handoffVersion = 2; }).stderr, /unsupported handoffVersion/);
  assert.match(bad((c) => { c.remaining.push('zzz'); }).stderr, /unknown task/);
  fs.writeFileSync(out, 'nope');
  assert.notEqual(p.run('handoff-check', out).status, 0);
});

test('handoff excludes raw check notes (evidence stays in the ledger only)', () => {
  const p = project([t('a', ['x'])]);
  p.run('init', 'plan.json');
  doneTask(p);
  p.run('verify', 'a', '--exit', '0', '--evidence', 'SECRET-OUTPUT-BODY');
  assert.doesNotMatch(p.run('handoff').stdout, /SECRET-OUTPUT-BODY/);
});

test('independence: verified by orchestrator is flagged; by verifier is not', () => {
  const p = project([t('a', ['x']), t('b', ['y'])]);
  p.run('init', 'plan.json');
  p.run('start', 'a', 'b');
  for (const id of ['a', 'b']) p.run('done', id, '--summary', 's');
  p.run('verify', 'a', '--by', 'verifier', '--exit', '0', '--evidence', 'ok');
  p.run('verify', 'b', '--by', 'orchestrator', '--exit', '0', '--evidence', 'ok');
  const out = p.run('status').stdout;
  assert.match(out, /\[verified\] a/);
  assert.match(out, /\[verified, not independent\] b/);
  const h = JSON.parse(p.run('handoff').stdout);
  assert.deepEqual(h.tasks.map((x) => x.independent), [true, false]);
  assert.match(p.run('handoff', '--md').stdout, /verified, not independent\] b/);
});

test('omitting --by never counts as independent', () => {
  const p = project([t('a', ['x'])]);
  p.run('init', 'plan.json');
  doneTask(p);
  p.run('verify', 'a', '--exit', '0', '--evidence', 'ok');
  assert.match(p.run('status').stdout, /not independent/);
});
