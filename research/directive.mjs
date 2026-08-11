/**
 * Does the flagged file actually carry 'use server'?
 *
 * This decides whether a whole class of finding is right or wrong. Functions
 * like `deleteGoogleDrive(config, input)` and `cleanupExpiredReports()` look
 * like internal helpers, and I called them false positives on that basis. But
 * the extractor only treats a file's exports as server actions when the file
 * has a 'use server' directive — and an exported function in such a file IS
 * reachable over HTTP, whatever its name suggests.
 *
 * So: clone, open the flagged file, print its first lines. If the directive is
 * there, the finding is correct and my reading was wrong.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const results = JSON.parse(fs.readFileSync('results.json', 'utf8'));
const sample = JSON.parse(fs.readFileSync('sample.json', 'utf8'));
const cloneOf = new Map(sample.map((s) => [s.full_name, s.clone_url]));

const PUBLIC = new Set([
  'auth', 'login', 'signin', 'sign-in', 'logout', 'signout', 'sign-out',
  'register', 'registration', 'signup', 'sign-up', 'join',
  'verify', 'verification', 'otp', 'confirm',
  'forgot', 'forgot-password', 'reset', 'reset-password',
  'callback', 'magic-link', 'session', 'csrf',
]);
const suppressedNow = (src) =>
  String(src || '').toLowerCase().split(/[/\\]/)
    .map((s) => s.replace(/\.[a-z]+$/, '')).map((s) => s.replace(/^\[\.{0,3}|\]$/g, ''))
    .filter(Boolean).some((s) => PUBLIC.has(s));

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

let seed = 20260811;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const picked = findings.map((f) => ({ f, k: rand() })).sort((a, b) => a.k - b.k)
  .map((x) => x.f).slice(0, Number(process.argv[2] || 12));

const WORK = process.argv[3];
fs.mkdirSync(WORK, { recursive: true });

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

let withDirective = 0, without = 0, unresolved = 0;
let i = 0;
for (const { repo, src } of picked) {
  i++;
  const dir = path.join(WORK, 'd' + i);
  const [file] = src.split(':');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    execSync(`git clone --depth 1 --quiet "${cloneOf.get(repo)}" "${dir}"`, {
      stdio: 'ignore', timeout: 120000,
    });
  } catch { console.log(`${i}. clone failed`); unresolved++; continue; }

  const direct = path.join(dir, file);
  const full = fs.existsSync(direct) ? direct : findBySuffix(dir, file);
  if (!full) { console.log(`${i}. unresolved  ${file}`); unresolved++; }
  else {
    const head = fs.readFileSync(full, 'utf8').split('\n').slice(0, 12);
    const has = head.some((l) => /^\s*['"]use server['"]/.test(l));
    if (has) withDirective++; else without++;
    const isRoute = /\/route\.[tj]sx?$/.test(file);
    console.log(
      `${String(i).padStart(2)}. ${has ? "HAS 'use server'" : isRoute ? 'api route      ' : "NO directive   "}  ${file}`,
    );
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\nwith directive: ${withDirective}   without: ${without}   unresolved: ${unresolved}`);
