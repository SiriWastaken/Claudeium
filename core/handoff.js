// Platform-independent handoff: pure functions over a ledger object.
// A handoff is a compact, versioned snapshot another agent can resume from
// without sharing this session's context, tools, or model.
const VERSION = 1;
const STATES = ['pending', 'running', 'done', 'verified', 'failed', 'blocked'];

function build(l, stale = [], independent = []) {
  const open = l.tasks.filter((t) => t.status !== 'verified');
  return {
    handoffVersion: VERSION,
    createdAt: new Date().toISOString(),
    objective: l.goal,
    acceptance: l.acceptance || [],
    constraints: l.constraints || [],
    discoveries: l.discoveries || [],
    tasks: l.tasks.map((t) => ({
      id: t.id, title: t.title, status: t.status, files: t.files, deps: t.deps,
      verify: t.verify, attempts: t.attempts || 0,
      stale: stale.includes(t.id),
      independent: independent.includes(t.id),
      ...(t.summary && { summary: t.summary }),
      ...(t.changed && { changed: t.changed }),
      ...(t.risks && { risks: t.risks }),
      ...(t.reason && { reason: t.reason }),
      checks: (t.checks || []).map(({ cmd, status, exit, at, by }) => ({ cmd, status, exit, at, by })),
    })),
    remaining: open.map((t) => t.id),
    failureModes: open.filter((t) => t.reason).map((t) => `${t.id}: ${t.reason}`),
    inspectFirst: [...new Set(open.flatMap((t) => t.files))],
  };
}

function validate(h) {
  const errs = [];
  const bad = (m) => errs.push(m);
  if (!h || typeof h !== 'object') return ['handoff must be an object'];
  if (h.handoffVersion !== VERSION) bad(`unsupported handoffVersion ${h.handoffVersion} (expected ${VERSION})`);
  if (typeof h.objective !== 'string' || !h.objective) bad('objective required');
  for (const k of ['acceptance', 'constraints', 'discoveries', 'remaining', 'failureModes', 'inspectFirst'])
    if (!Array.isArray(h[k]) || h[k].some((x) => typeof x !== 'string')) bad(`${k} must be an array of strings`);
  if (!Array.isArray(h.tasks)) bad('tasks must be an array');
  else {
    const ids = new Set();
    for (const t of h.tasks) {
      if (!t || typeof t.id !== 'string') { bad('task without id'); continue; }
      ids.add(t.id);
      if (!STATES.includes(t.status)) bad(`task ${t.id}: invalid status ${t.status}`);
      if (t.status === 'verified' && !(t.checks || []).some((c) => c.status === 'passed')) bad(`task ${t.id}: verified without a passed check`);
    }
    for (const r of h.remaining || []) if (!ids.has(r)) bad(`remaining references unknown task ${r}`);
  }
  return errs;
}

function render(h) {
  const L = [`# Handoff: ${h.objective}`, ''];
  const list = (title, xs) => xs.length && L.push(`## ${title}`, ...xs.map((x) => `- ${x}`), '');
  list('Acceptance', h.acceptance);
  list('Constraints', h.constraints);
  list('Discoveries', h.discoveries);
  L.push('## Tasks');
  for (const t of h.tasks) {
    L.push(`- [${t.status}${t.status === 'verified' && !t.independent ? ', not independent' : ''}${t.stale ? ', STALE' : ''}] ${t.id}: ${t.title}`);
    if (t.summary) L.push(`  - did: ${t.summary}`);
    if (t.reason) L.push(`  - problem: ${t.reason}`);
    if (t.risks) L.push(`  - risks: ${t.risks}`);
    for (const c of t.checks) L.push(`  - check ${c.status}${c.exit == null ? '' : ` (exit ${c.exit})`}: ${c.cmd}`);
  }
  L.push('');
  list('Remaining', h.remaining);
  list('Known failure modes', h.failureModes);
  list('Inspect first', h.inspectFirst);
  return L.join('\n');
}

module.exports = { VERSION, build, validate, render };
