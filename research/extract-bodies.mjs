/**
 * Pull the flagged function bodies out of the repositories, for reading.
 *
 * The hand-check is the only thing that makes the study's number worth
 * anything, and last time it happened in a transcript and was lost. This
 * writes the sample to disk — data/verify-sample.json — so the judgement can
 * be recorded, re-read, and disagreed with.
 *
 * Deterministic seed, so re-running yields the same thirty and the sample
 * cannot be quietly re-rolled until it flatters us. Clones are shallow and
 * deleted. The output pairs repository names with findings and stays in
 * data/, which is gitignored.
 *
 *   node extract-bodies.mjs 30 ./data/work-verify
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const N = Number(process.argv[2] || 30);
const WORK = process.argv[3] || './data/work-verify';
const results = JSON.parse(fs.readFileSync('data/results.json', 'utf8'));
const sample = JSON.parse(fs.readFileSync('data/sample.json', 'utf8'));
const cloneOf = new Map(sample.map((s) => [s.full_name, s.clone_url]));

const findings = [];
for (const row of results) {
  if (row.outcome !== 'scanned') continue;
  const kinds = row.gapKinds || [], srcs = row.sources || [], conf = row.gapConfidence || [];
  for (let i = 0; i < Math.min(kinds.length, srcs.length); i++) {
    if (kinds[i] === 'unprotected-destructive') {
      findings.push({ repo: row.full_name, src: srcs[i], conf: conf[i] ?? null });
    }
  }
}

let seed = 20260922;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const picked = findings.map((f) => ({ f, k: rand() })).sort((a, b) => a.k - b.k)
  .map((x) => x.f).slice(0, N);

fs.mkdirSync(WORK, { recursive: true });

/* Repositories scanned through a workspace report paths relative to the app
   directory, not the repo root, so the file is found by its path suffix. */
const findBySuffix = (root, suffix) => {
  const want = suffix.split('/').filter(Boolean).join('/');
  const stack = [root];
  while (stack.length) {
    const here = stack.pop();
    let entries;
    try { entries = fs.readdirSync(here, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(here, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        stack.push(p);
      } else if (p.split(path.sep).join('/').endsWith('/' + want)) return p;
    }
  }
  return null;
};

/* The flagged function, by brace balance from the flagged line, plus the
   eight lines above it so a wrapper like withError(...) is visible. */
function bodyAt(lines, line) {
  const from = Math.max(0, line - 9);
  const pre = lines.slice(from, line - 1);
  let depth = 0, started = false;
  const out = [];
  for (let i = line - 1; i < Math.min(lines.length, line + 140); i++) {
    const l = lines[i];
    out.push(l);
    for (const ch of l) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') depth--;
    }
    if (started && depth <= 0) break;
  }
  return { context: pre.join('\n'), body: out.join('\n') };
}

const out = [];
let i = 0;
for (const { repo, src, conf } of picked) {
  i++;
  const dir = path.join(WORK, 'v' + i);
  const [file, lineStr] = src.split(':');
  const line = Number(lineStr) || 1;
  const rec = { i, repo, src, conf, resolved: false };
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    execSync(`git clone --depth 1 --quiet "${cloneOf.get(repo)}" "${dir}"`, {
      stdio: 'ignore', timeout: 120000,
    });
    const direct = path.join(dir, file);
    const full = fs.existsSync(direct) ? direct : findBySuffix(dir, file);
    if (full) {
      const lines = fs.readFileSync(full, 'utf8').split('\n');
      const head = lines.slice(0, 12);
      rec.resolved = true;
      rec.hasUseServer = head.some((l) => /^\s*['"]use server['"]/.test(l));
      rec.isRoute = /\/route\.[tj]sx?$/.test(file);
      Object.assign(rec, bodyAt(lines, line));
    }
  } catch (e) {
    rec.error = String(e.message || e).slice(0, 120);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  out.push(rec);
  console.log(`${String(i).padStart(2)}/${picked.length}  ${rec.resolved ? 'ok      ' : 'MISSING '}  ${src}`);
}

fs.writeFileSync('data/verify-sample.json', JSON.stringify(out, null, 1));
console.log(`\n${findings.length} findings in corpus; ${out.filter((r) => r.resolved).length}/${out.length} bodies extracted -> data/verify-sample.json`);
