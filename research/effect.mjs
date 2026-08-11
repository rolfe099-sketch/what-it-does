/**
 * What the public-by-design rule does to the corpus already collected.
 *
 * Replays the same suppression the scanner now applies, over the 131 findings
 * recorded from 284 repositories, so the change can be measured rather than
 * asserted. Same segment logic as src/extract/gaps.ts — if the two ever drift,
 * this number stops meaning anything.
 */
import * as fs from 'node:fs';

const results = JSON.parse(fs.readFileSync('results.json', 'utf8'));
const scanned = results.filter((x) => x.outcome === 'scanned');

const PUBLIC = new Set([
  'auth', 'login', 'signin', 'sign-in', 'logout', 'signout', 'sign-out',
  'register', 'registration', 'signup', 'sign-up', 'join',
  'verify', 'verification', 'otp', 'confirm',
  'forgot', 'forgot-password', 'reset', 'reset-password',
  'callback', 'magic-link', 'session', 'csrf',
]);

function isPublic(src) {
  return String(src || '')
    .toLowerCase()
    .split(/[/\\]/)
    .map((s) => s.replace(/\.[a-z]+$/, ''))
    .map((s) => s.replace(/^\[\.{0,3}|\]$/g, ''))
    .filter(Boolean)
    .some((s) => PUBLIC.has(s));
}

let total = 0;
let suppressed = 0;
const before = new Set();
const after = new Set();
const examples = [];

for (const row of scanned) {
  const kinds = row.gapKinds || [];
  const srcs = row.sources || [];
  for (let i = 0; i < Math.min(kinds.length, srcs.length); i++) {
    if (kinds[i] !== 'unprotected-destructive') continue;
    total++;
    before.add(row.full_name);
    if (isPublic(srcs[i])) {
      suppressed++;
      if (examples.length < 8) examples.push(srcs[i]);
    } else {
      after.add(row.full_name);
    }
  }
}

function wilson(k, n) {
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const m = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, (c - m) * 100), Math.min(100, (c + m) * 100)];
}

const canFail = scanned.filter((x) => x.consequential > 0).length;

console.log('=== effect on the 284-repository corpus ===');
console.log('  findings before          :', total);
console.log('  suppressed as public      :', suppressed, `(${((suppressed * 100) / total).toFixed(1)}%)`);
console.log('  findings remaining        :', total - suppressed);
console.log();
console.log('  repositories flagged before:', before.size);
console.log('  repositories flagged after :', after.size);
console.log();
const [lo, hi] = wilson(after.size, canFail);
console.log(`  headline recomputed: ${after.size}/${canFail} = ${((after.size * 100) / canFail).toFixed(1)}%  (95% CI ${lo.toFixed(1)}–${hi.toFixed(1)})`);
console.log('  previously          : 39/135 = 28.9%');
console.log();
console.log('  a sample of what got suppressed:');
for (const e of examples) console.log('   ', e);
