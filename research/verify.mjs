/**
 * Hand-verification of a random sample of findings.
 *
 * The headline number is only worth as much as the findings under it. The
 * tool claims no false alarms on dub's monorepo; that is one project. Before
 * publishing "29% of apps that can delete data have an endpoint with no
 * visible check", somebody has to open a random selection of those endpoints
 * and look.
 *
 * This pulls the flagged file:line back out of the repository so the code can
 * be read directly. Deterministic seed so the sample is reproducible and I
 * cannot quietly re-roll until the answer flatters us.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const N = Number(process.argv[2] || 10);
const WORK = process.argv[3];
const results = JSON.parse(fs.readFileSync('results.json', 'utf8'));
const sample = JSON.parse(fs.readFileSync('sample.json', 'utf8'));
const cloneOf = new Map(sample.map((s) => [s.full_name, s.clone_url]));

/*
 * gapKinds and sources are parallel arrays over the SAME findings, so they
 * have to be zipped. Filtering rows by `unprotected` and then taking every
 * source mixes unfulfilled-promise findings into the sample, and a
 * false-positive rate measured on the wrong population is worse than none.
 */
// Mirrors PUBLIC_BY_DESIGN in src/extract/gaps.ts. Those 7 are already fixed
// in 0.4.3, so sampling them would measure a rate that no longer ships.
const PUBLIC = new Set([
  'auth', 'login', 'signin', 'sign-in', 'logout', 'signout', 'sign-out',
  'register', 'registration', 'signup', 'sign-up', 'join',
  'verify', 'verification', 'otp', 'confirm',
  'forgot', 'forgot-password', 'reset', 'reset-password',
  'callback', 'magic-link', 'session', 'csrf',
]);
const suppressedNow = (src) =>
  String(src || '')
    .toLowerCase()
    .split(/[/\\]/)
    .map((s) => s.replace(/\.[a-z]+$/, ''))
    .map((s) => s.replace(/^\[\.{0,3}|\]$/g, ''))
    .filter(Boolean)
    .some((s) => PUBLIC.has(s));

const findings = [];
for (const row of results) {
  if (row.outcome !== 'scanned') continue;
  const kinds = row.gapKinds || [];
  const srcs = row.sources || [];
  for (let i = 0; i < Math.min(kinds.length, srcs.length); i++) {
    if (kinds[i] === 'unprotected-destructive' && !suppressedNow(srcs[i])) {
      findings.push({ repo: row.full_name, src: srcs[i] });
    }
  }
}

// Deterministic shuffle (mulberry32) — reproducible, not cherry-picked.
let seed = 20260811;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffled = findings
  .map((f) => ({ f, k: rand() }))
  .sort((a, b) => a.k - b.k)
  .map((x) => x.f);

fs.mkdirSync(WORK, { recursive: true });
const picked = shuffled.slice(0, N);
console.log(`${findings.length} findings total; hand-checking ${picked.length}\n`);

let i = 0;
for (const { repo, src } of picked) {
  i++;
  const url = cloneOf.get(repo);
  const dir = path.join(WORK, 'v' + i);
  const [file, lineStr] = src.split(':');
  const line = Number(lineStr) || 1;

  try {
    fs.rmSync(dir, { recursive: true, force: true });
    execSync(`git clone --depth 1 --quiet "${url}" "${dir}"`, { stdio: 'ignore', timeout: 120000 });
  } catch {
    console.log(`--- ${i}. clone failed\n`);
    continue;
  }

  /*
   * A repository scanned through workspace traversal reports paths relative
   * to the application directory, not the repository root — so `app/api/x`
   * actually lives at `apps/web/app/api/x`. Three of the first six samples
   * were unreadable for this reason, wasting half the sample.
   *
   * Rather than re-scan 284 repositories to record which child each came
   * from, find the file by matching the tail of its path. Unambiguous in
   * practice: two apps in one workspace rarely share a full route path, and
   * where they do, either is a fair sample of the same finding.
   */
  const findBySuffix = (root, suffix) => {
    const want = suffix.split('/').filter(Boolean).join('/');
    const stack = [root];
    while (stack.length) {
      const here = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(here, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const p = path.join(here, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '.git') continue;
          stack.push(p);
        } else if (p.split(path.sep).join('/').endsWith('/' + want)) {
          return p;
        }
      }
    }
    return null;
  };

  const direct = path.join(dir, file);
  const full = fs.existsSync(direct) ? direct : findBySuffix(dir, file);
  console.log(`--- ${i}.  ${file}:${line}`);
  if (full && fs.existsSync(full)) {
    const src2 = fs.readFileSync(full, 'utf8').split('\n');
    // The whole handler, not just the flagged line: a check three lines above
    // would make this a false positive and must be visible.
    const from = Math.max(0, line - 4);
    const to = Math.min(src2.length, line + 16);
    for (let n = from; n < to; n++) {
      console.log(String(n + 1).padStart(4) + (n + 1 === line ? ' >' : '  ') + ' ' + src2[n]);
    }
  } else {
    console.log('    (file not present at that path)');
  }
  console.log();
  fs.rmSync(dir, { recursive: true, force: true });
}
