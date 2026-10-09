#!/usr/bin/env node
// Claudeium core: platform-independent task ledger with evidence-gated states.
// No network, never executes plan commands. State: <project>/.claudeium/ledger.json
// Project dir: CLAUDEIUM_PROJECT_DIR, else the current directory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const handoff = require('./handoff');

const SCHEMA = 1;
const MAX_PARALLEL = 3;
const MAX_TEXT = 2000;
const CHECK_STATUSES = ['passed', 'failed', 'blocked', 'not_run'];
const TERMINAL = ['verified', 'failed', 'blocked'];

const root = () => process.env.CLAUDEIUM_PROJECT_DIR || process.cwd();
const file = () => path.join(root(), '.claudeium', 'ledger.json');
const die = (msg) => { throw new Error(msg); };

// Best-effort secret scrubbing for anything we persist. Not a guarantee; see docs/security.md.
const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED]'],
  [/\bBearer\s+[A-Za-z0-9._~+\/=-]{12,}/gi, 'Bearer [REDACTED]'],
  [/\b(sk|pk|ghp|gho|ghs|github_pat|xox[abprs]|AKIA|AIza)[-_A-Za-z0-9]{16,}/g, '[REDACTED]'],
  [/\b(password|passwd|secret|token|api[_-]?key|authorization)(\s*[=:]\s*)\S+/gi, '$1$2[REDACTED]'],
];
function clean(s) {
  let out = String(s ?? '');
  for (const [re, to] of SECRET_PATTERNS) out = out.replace(re, to);
  return out.length > MAX_TEXT ? out.slice(0, MAX_TEXT) + '…[truncated]' : out;
}

function load() {
  let raw;
  try { raw = fs.readFileSync(file(), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  let l;
  try { l = JSON.parse(raw); } catch { die(`ledger is corrupt (invalid JSON): ${file()}`); }
  if (l.schema !== SCHEMA || !Array.isArray(l.tasks)) die(`ledger has unsupported schema ${l.schema} (expected ${SCHEMA})`);
  return l;
}
function save(l) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(l, null, 2));
  fs.renameSync(tmp, file());
}

// Cross-process lock (mkdir is atomic). Stale locks (>10s) are broken so a crash can't wedge the ledger.
function locked(fn) {
  const lock = file() + '.lock';
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) fs.rmdirSync(lock); } catch { /* raced */ }
      if (i > 100) die('ledger is locked by another process');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch { /* already gone */ } }
}
// Read-modify-write under the lock; fn mutates the ledger and returns a message.
const mutate = (fn) => locked(() => { const l = load() || die('no ledger'); const msg = fn(l); l.updatedAt = new Date().toISOString(); save(l); return msg; });

const open = (l) => l && !l.closed;
const task = (l, id) => l.tasks.find((t) => t.id === id) || die(`unknown task: ${id}`);
const now = () => new Date().toISOString();

function strings(v, name) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) die(`plan.${name} must be an array of strings`);
  return v.map(clean);
}

function validatePlan(plan) {
  if (!plan || typeof plan.goal !== 'string' || !plan.goal) die('plan.goal must be a non-empty string');
  if (!Array.isArray(plan.tasks) || !plan.tasks.length) die('plan.tasks must be a non-empty array');
  const ids = new Set();
  for (const t of plan.tasks) {
    if (!t || typeof t.id !== 'string' || !t.id) die('every task needs a string id');
    if (ids.has(t.id)) die(`duplicate task id: ${t.id}`);
    ids.add(t.id);
    if (typeof t.title !== 'string' || !t.title) die(`task ${t.id}: title required`);
    if (typeof t.verify !== 'string' || !t.verify) die(`task ${t.id}: verify (how to prove it works) required`);
    if (!Array.isArray(t.files) || !t.files.length) die(`task ${t.id}: files (owned paths) required`);
    for (const f of t.files) {
      if (typeof f !== 'string' || !f || path.isAbsolute(f) || f.split(/[\\/]/).includes('..'))
        die(`task ${t.id}: file must be a relative path inside the project: ${f}`);
    }
    t.deps = t.deps || [];
  }
  for (const t of plan.tasks) for (const d of t.deps) if (!ids.has(d)) die(`task ${t.id}: unknown dep ${d}`);
  const state = {};
  const visit = (id) => {
    if (state[id] === 1) die(`dependency cycle at ${id}`);
    if (state[id] === 2) return;
    state[id] = 1;
    plan.tasks.find((t) => t.id === id).deps.forEach(visit);
    state[id] = 2;
  };
  plan.tasks.forEach((t) => visit(t.id));
  for (const k of ['acceptance', 'constraints']) strings(plan[k], k);
}

const norm = (f) => path.posix.normalize(f.replaceAll('\\', '/')).replace(/\/$/, '');
const overlap = (a, b) => a.some((x) => b.some((y) => norm(x) === norm(y) || norm(x).startsWith(norm(y) + '/') || norm(y).startsWith(norm(x) + '/')));

// Ready = pending with all deps verified. Batch = ready tasks with pairwise-disjoint
// files, none overlapping a running task, capped at MAX_PARALLEL.
function next(l) {
  const running = l.tasks.filter((t) => t.status === 'running');
  const ready = l.tasks.filter((t) => t.status === 'pending' && t.deps.every((d) => task(l, d).status === 'verified'));
  const batch = [];
  for (const t of ready) {
    if (batch.length >= MAX_PARALLEL) break;
    if ([...running, ...batch].some((o) => overlap(o.files, t.files))) continue;
    batch.push(t);
  }
  const blocked = l.tasks.filter((t) => t.status === 'pending' && t.deps.some((d) => ['failed', 'blocked'].includes(task(l, d).status))).map((t) => t.id);
  return { batch, blocked };
}

// Content hash of a task's owned paths, so evidence can be marked stale if they change afterwards.
const SKIP = new Set(['.git', 'node_modules', '.claudeium']);
function fingerprint(files) {
  const h = crypto.createHash('sha256');
  let budget = 5000; // files hashed per task; beyond this the fingerprint covers a prefix only
  const walk = (rel) => {
    if (budget <= 0) return;
    const abs = path.join(root(), rel);
    let st;
    try { st = fs.lstatSync(abs); } catch { h.update(`${rel}\0missing\0`); return; }
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(abs).sort()) if (!SKIP.has(e)) walk(path.join(rel, e));
    } else if (st.isFile()) {
      budget--;
      h.update(`${rel}\0`).update(fs.readFileSync(abs)).update('\0');
    }
  };
  [...files].sort().forEach(walk);
  return h.digest('hex');
}
const staleIds = (l) => l.tasks.filter((t) => t.status === 'verified' && t.fingerprint && t.fingerprint !== fingerprint(t.files)).map((t) => t.id);

// Independent = every deciding (latest) check was reported by a verifier agent, not the orchestrator/worker.
const independent = (t) => {
  const latest = new Map((t.checks || []).map((c) => [c.cmd, c]));
  return latest.size > 0 && [...latest.values()].every((c) => c.by === 'verifier');
};
const unfinished = (l) => l.tasks.filter((t) => !TERMINAL.includes(t.status));

function addCheck(t, { cmd, status, exit, note, by }) {
  if (!CHECK_STATUSES.includes(status)) die(`--status must be one of ${CHECK_STATUSES.join('|')}`);
  if (status === 'passed' && exit !== 0) die('a passed check needs --exit 0');
  if (status === 'failed' && exit === 0) die('a failed check cannot have exit 0');
  (t.checks = t.checks || []).push({ cmd: clean(cmd), status, ...(exit !== undefined && { exit }), at: now(), by: ['verifier', 'orchestrator', 'worker'].includes(by) ? by : 'unspecified', ...(note && { note: clean(note) }) });
}
function parseExit(v) {
  if (v === undefined) return undefined;
  if (!/^-?\d+$/.test(v)) die('--exit must be an integer');
  return Number(v);
}
function opt(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const need = (v, name) => v || die(`${name} required`);
function mustBe(t, ...states) { if (!states.includes(t.status)) die(`task ${t.id} is ${t.status}; expected ${states.join(' or ')}`); }

const cmds = {
  init(args) {
    const plan = JSON.parse(fs.readFileSync(need(args[0], 'usage: init <plan.json>'), 'utf8'));
    validatePlan(plan);
    return locked(() => {
      if (open(load()) && !args.includes('--force')) die('an open ledger exists; run `close` first or pass --force');
      save({
        schema: SCHEMA, goal: clean(plan.goal), closed: false, createdAt: now(), updatedAt: now(),
        acceptance: strings(plan.acceptance, 'acceptance'), constraints: strings(plan.constraints, 'constraints'), discoveries: [],
        tasks: plan.tasks.map((t) => ({ ...t, title: clean(t.title), status: 'pending', attempts: 0 })),
      });
      return `ledger created: ${plan.tasks.length} task(s)`;
    });
  },
  next() { return JSON.stringify(next(load() || die('no ledger')), null, 2); },
  start(args) {
    need(args[0], 'usage: start <id>...');
    return mutate((l) => {
      const { batch } = next(l);
      for (const id of args) if (!batch.some((t) => t.id === id)) die(`task ${id} is not startable now (deps unverified, file conflict, parallel cap, or not pending)`);
      for (const [i, a] of args.entries()) for (const b of args.slice(i + 1))
        if (overlap(task(l, a).files, task(l, b).files)) die(`tasks ${a} and ${b} own overlapping files`);
      args.forEach((id) => { const t = task(l, id); t.status = 'running'; t.startedAt = now(); t.attempts++; });
      return `started: ${args.join(', ')}`;
    });
  },
  done(args) {
    const summary = need(opt(args, '--summary'), '--summary');
    return mutate((l) => {
      const t = task(l, args[0]); mustBe(t, 'running');
      const changed = opt(args, '--changed');
      Object.assign(t, { status: 'done', summary: clean(summary), ...(changed && { changed: changed.split(',').map((s) => clean(s.trim())).filter(Boolean) }), ...(opt(args, '--risks') && { risks: clean(opt(args, '--risks')) }) });
      return `${t.id}: done (unverified)`;
    });
  },
  fail(args) {
    const reason = need(opt(args, '--reason'), '--reason');
    return mutate((l) => { const t = task(l, args[0]); mustBe(t, 'running', 'done'); Object.assign(t, { status: 'failed', reason: clean(reason) }); return `${t.id}: failed`; });
  },
  block(args) {
    const reason = need(opt(args, '--reason'), '--reason');
    return mutate((l) => { const t = task(l, args[0]); mustBe(t, 'running', 'done'); Object.assign(t, { status: 'blocked', reason: clean(reason) }); return `${t.id}: blocked`; });
  },
  // Record one executed (or unexecutable) check against a done task.
  check(args) {
    const cmd = need(opt(args, '--cmd'), '--cmd');
    return mutate((l) => {
      const t = task(l, args[0]); mustBe(t, 'done');
      addCheck(t, { cmd, status: opt(args, '--status'), exit: parseExit(opt(args, '--exit')), note: opt(args, '--note'), by: opt(args, '--by') });
      return `${t.id}: recorded ${t.checks.at(-1).status} check`;
    });
  },
  // Record the task's own verify command result and decide. Status comes from the exit code,
  // or --status blocked|not_run when the check could not be executed (task stays `done`).
  verify(args) {
    const evidence = need(opt(args, '--evidence'), '--evidence (command run + output excerpt)');
    const exit = parseExit(opt(args, '--exit'));
    const status = opt(args, '--status') || (exit === undefined ? die('--exit or --status required') : exit === 0 ? 'passed' : 'failed');
    return mutate((l) => {
      const t = task(l, args[0]); mustBe(t, 'done');
      addCheck(t, { cmd: t.verify, status, exit, note: evidence, by: opt(args, '--by') });
      const latest = new Map(t.checks.map((c) => [c.cmd, c]));
      const all = [...latest.values()];
      if (all.some((c) => c.status === 'failed')) { t.status = 'failed'; const f = all.find((c) => c.status === 'failed'); t.reason = `check failed: ${f.cmd} (exit ${f.exit})`; }
      else if (all.every((c) => c.status === 'passed')) { t.status = 'verified'; t.fingerprint = fingerprint(t.files); t.verifiedAt = now(); }
      else return `${t.id}: still done; unresolved checks: ${all.filter((c) => c.status !== 'passed').map((c) => `${c.status}:${c.cmd}`).join(', ')}`;
      return `${t.id}: ${t.status}`;
    });
  },
  note(args) { return mutate((l) => { (l.discoveries ||= []).push(clean(need(args.join(' '), 'usage: note <text>'))); return 'noted'; }); },
  // After a crash/interruption: running tasks go back to pending (attempt count is kept).
  recover() {
    return mutate((l) => {
      const reset = l.tasks.filter((t) => t.status === 'running');
      reset.forEach((t) => { t.status = 'pending'; t.reason = 'interrupted; restarted'; });
      return reset.length ? `reset to pending: ${reset.map((t) => t.id).join(', ')}` : 'nothing to recover';
    });
  },
  stale() {
    const ids = staleIds(load() || die('no ledger'));
    return ids.length ? `stale (owned files changed since verification): ${ids.join(', ')}` : 'no stale verifications';
  },
  close() { return mutate((l) => { l.closed = true; return 'ledger closed'; }); },
  status(args) {
    const l = load();
    if (!l) return 'no ledger';
    const stale = staleIds(l);
    if (args.includes('--json')) return JSON.stringify({ ...l, stale, independent: l.tasks.filter(independent).map((t) => t.id) }, null, 2);
    const lines = [`goal: ${l.goal}${l.closed ? ' (closed)' : ''}`];
    for (const t of l.tasks) lines.push(`  [${t.status}${t.status === 'verified' && !independent(t) ? ', not independent' : ''}${stale.includes(t.id) ? ', STALE' : ''}] ${t.id}: ${t.title}${t.reason ? ` — ${t.reason}` : ''}`);
    return lines.join('\n');
  },
  handoff(args) {
    const l = load() || die('no ledger');
    const h = handoff.build(l, staleIds(l), l.tasks.filter(independent).map((t) => t.id));
    return args.includes('--md') ? handoff.render(h) : JSON.stringify(h, null, 2);
  },
  'handoff-check'(args) {
    let h;
    try { h = JSON.parse(fs.readFileSync(need(args[0], 'usage: handoff-check <file>'), 'utf8')); } catch (e) { die(`cannot read handoff: ${e.message}`); }
    const errs = handoff.validate(h);
    if (errs.length) die(`invalid handoff:\n- ${errs.join('\n- ')}`);
    return 'handoff valid';
  },
  // For adapters: JSON {block:boolean, reason}. Open ledger with unfinished tasks => block.
  'stop-status'() {
    const l = load();
    const todo = open(l) ? unfinished(l) : [];
    return JSON.stringify({ block: todo.length > 0, reason: todo.length ? `Claudeium ledger has unfinished tasks: ${todo.map((t) => `${t.id} (${t.status})`).join(', ')}. Verify them, mark them failed/blocked with a reason, or run \`close\` before reporting completion.` : '' });
  },
};

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (!cmds[cmd]) die(`usage: ledger.js <${Object.keys(cmds).join('|')}>`);
    const out = cmds[cmd](args);
    if (out) console.log(out);
  } catch (e) {
    console.error(`claudeium: ${e.message}`);
    process.exit(1);
  }
}
module.exports = { validatePlan, next, overlap, clean, fingerprint, MAX_PARALLEL };
