/**
 * Build the sample frame.
 *
 * ── Two decisions worth stating, because they decide what the number means ──
 *
 * STRATIFIED, NOT TOP-STARS. Sorting by stars would fill the sample with
 * mature, heavily reviewed projects and understate the answer. Sampling in
 * star bands lets the result be reported per band, which is the more honest
 * and more interesting shape: it shows whether this concentrates in small,
 * quickly-assembled projects rather than blending everything into one figure.
 *
 * NO CLAIM ABOUT AI. There is no reliable way to tell from a repository
 * whether a model wrote it, so the population is "public Next.js repositories",
 * full stop. Anything more would be an invented statistic.
 *
 * Repository search cannot see file contents without auth, so `topic:nextjs`
 * is only a candidate filter. Whether a repo is really a Next.js App Router
 * project is decided later by the scanner itself.
 */
import * as fs from 'node:fs';

const BANDS = [
  { name: '0-5', q: 'stars:0..5' },
  { name: '6-50', q: 'stars:6..50' },
  { name: '51-500', q: 'stars:51..500' },
  { name: '500+', q: 'stars:>500' },
];

const PER_BAND = Number(process.argv[2] || 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = [];
for (const band of BANDS) {
  // pushed: keeps abandoned experiments out; this is about code in use.
  const q = `topic:nextjs language:TypeScript pushed:>2026-02-01 ${band.q}`;
  const url =
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}` +
    `&sort=updated&order=desc&per_page=${PER_BAND}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'what-it-does-research' },
  });
  if (!res.ok) {
    console.error(`band ${band.name}: HTTP ${res.status}`);
    await sleep(7000);
    continue;
  }
  const body = await res.json();
  const items = (body.items || []).map((r) => ({
    band: band.name,
    full_name: r.full_name,
    clone_url: r.clone_url,
    stars: r.stargazers_count,
    size_kb: r.size,
    pushed_at: r.pushed_at,
    license: r.license?.spdx_id ?? null,
  }));
  out.push(...items);
  console.log(`band ${band.name.padEnd(7)} matched ${body.total_count} repos, took ${items.length}`);
  await sleep(7000); // search allows 10/min unauthenticated
}

fs.writeFileSync('sample.json', JSON.stringify(out, null, 1));
console.log(`\nsample written: ${out.length} repositories`);
