/**
 * The result, as it would be published.
 *
 * Run against the 0.4.4 build, so the auth-endpoint suppression is already
 * applied and these are the findings a reader would get running it today.
 */
import * as fs from 'node:fs';

const r = JSON.parse(fs.readFileSync('results.json', 'utf8'));
const s = r.filter((x) => x.outcome === 'scanned');

function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const m = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, (c - m) * 100), Math.min(100, (c + m) * 100)];
}
const pct = (k, n) => {
  const [a, b] = wilson(k, n);
  return `${((k * 100) / n).toFixed(1)}%  (95% CI ${a.toFixed(1)}–${b.toFixed(1)})`;
};

console.log('=== disposition (n=' + r.length + ') ===');
const by = {};
for (const x of r) by[x.outcome] = (by[x.outcome] || 0) + 1;
Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`  ${String(v).padStart(4)}  ${k}`));
console.log(`  of the scanned, reached via workspace traversal: ${s.filter((x) => x.viaWorkspace).length}`);

console.log('\n=== corpus ===');
console.log('  repositories scanned:', s.length);
console.log('  ways in read        :', s.reduce((a, b) => a + b.behaviours, 0).toLocaleString());

// Zip kinds+confidence, the only way to attribute a confidence to a kind.
let likely = 0, possible = 0, other = 0;
const reposLikely = new Set(), reposAny = new Set();
for (const row of s) {
  const kinds = row.gapKinds || [], conf = row.gapConfidence || [];
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] !== 'unprotected-destructive') continue;
    reposAny.add(row.full_name);
    if (conf[i] === 'likely') { likely++; reposLikely.add(row.full_name); }
    else if (conf[i] === 'possible') possible++;
    else other++;
  }
}

console.log('\n=== unprotected-destructive findings ===');
console.log('  total     :', likely + possible + other);
console.log('  likely    :', likely, ' (we could see, and nothing was checking)');
console.log('  possible  :', possible, ' (something blocked the view; the summary says what)');
if (other) console.log('  unlabelled:', other);

const canFail = s.filter((x) => x.consequential > 0).length;
console.log('\n=== repository-level ===');
console.log('  apps able to fail the test (delete / charge / change access):', canFail);
console.log('  with ANY unprotected finding   :', reposAny.size, '=', pct(reposAny.size, canFail));
console.log('  with a LIKELY one              :', reposLikely.size, '=', pct(reposLikely.size, canFail));

console.log('\n=== by star band (denominator: apps able to fail) ===');
for (const b of ['0-5', '6-50', '51-500', '500+']) {
  const g = s.filter((x) => x.band === b);
  const gc = g.filter((x) => x.consequential > 0).length;
  const gl = new Set();
  for (const row of g) {
    const kinds = row.gapKinds || [], conf = row.gapConfidence || [];
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === 'unprotected-destructive' && conf[i] === 'likely') gl.add(row.full_name);
    }
  }
  console.log(`  ${b.padEnd(7)} scanned ${String(g.length).padStart(3)}  can-fail ${String(gc).padStart(3)}  likely ${String(gl.size).padStart(3)}  ${gc ? pct(gl.size, gc) : '—'}`);
}
