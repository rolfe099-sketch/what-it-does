/**
 * Scan the sample.
 *
 * Clone shallow, scan, record, delete. Nothing is kept and nothing is written
 * back to anyone's repository.
 *
 * ── The rule that outranks the result ──────────────────────────────────────
 *
 * NO REPOSITORY IS EVER NAMED IN ANYTHING PUBLISHED. Names live in the local
 * working file because you cannot verify a finding you cannot go back and
 * look at, and a number nobody can check is worth nothing. But the artefact
 * that leaves this machine is aggregate only. Publishing "these repos have
 * unprotected delete endpoints" would be handing out a target list, and the
 * whole point of the tool is that a finding is something to check rather than
 * a proven hole.
 *
 * The scanner is the PUBLISHED build, not the working tree, so the numbers
 * describe what a reader would get if they ran it themselves today.
 */
import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CLI = process.argv[2];
const WORK = process.argv[3];
const sample = JSON.parse(fs.readFileSync('sample.json', 'utf8'));

const CONSEQUENTIAL = new Set(['deletes-data', 'takes-payment', 'changes-access']);
const results = [];

const strip = (s) => String(s || '').replace(/\x1b\[[0-9;]*m/g, '');

/**
 * One scan attempt. Returns either a parsed scan or the reason it declined.
 *
 * The CLI uses exit 1 for "I cannot read this, and here is why", which is not
 * a failure — treating it as one is what made the first pilot report 17
 * errors that were all the tool working correctly.
 */
function scanOnce(dir) {
  try {
    const json = execFileSync(process.execPath, [CLI, dir, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, scan: JSON.parse(json) };
  } catch (error) {
    const raw = strip(error.stderr) + '\n' + strip(error.message);
    return { ok: false, raw, signal: error.signal ?? null, status: error.status ?? null };
  }
}

/**
 * A workspace root reads as unscannable, but the CLI names the applications
 * inside it. Thirteen of the first forty-eight repositories were monorepos —
 * 27% of the sample, silently discarded, and almost certainly the more
 * substantial projects. Following the hint is the difference between a biased
 * number and a usable one.
 *
 * The repository stays the unit of analysis: several apps in one workspace
 * are summed into a single row, so the question stays "did this project have
 * one" rather than being weighted by how many apps a monorepo happens to hold.
 */
function childDirs(raw) {
  const lines = raw.split('\n').map(strip);
  const start = lines.findIndex((l) => /readable:\s*$/.test(l));
  if (start === -1) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*Scan one directly/.test(line)) break;
    const m = line.match(/^\s{2}(\S+)\s{2,}\S/);
    if (m) out.push(m[1]);
  }
  return out;
}

function summarise(scans) {
  const behaviours = scans.flatMap((s) => s.behaviours || []);
  const gaps = behaviours.flatMap((b) => b.gaps || []);
  return {
    behaviours: behaviours.length,
    gapCount: gaps.length,
    gapKinds: gaps.map((g) => g.kind),
    // How firmly each finding is meant — the qualifier that decides whether
    // 'no visible check' is a claim or a prompt to confirm.
    gapConfidence: gaps.map((g) => g.confidence ?? null),
    unprotected: gaps.filter((g) => g.kind === 'unprotected-destructive').length,
    consequential: behaviours.filter((b) =>
      (b.effects || []).some((e) => CONSEQUENTIAL.has(String(e).split('::')[0])),
    ).length,
    sources: gaps.map((g) => g.source), // verification only, never published
  };
}

fs.mkdirSync(WORK, { recursive: true });

for (const [i, repo] of sample.entries()) {
  const dir = path.join(WORK, 'r' + i);
  const row = { band: repo.band, stars: repo.stars, full_name: repo.full_name, outcome: null };

  try {
    fs.rmSync(dir, { recursive: true, force: true });
    execSync(`git clone --depth 1 --quiet --filter=blob:none "${repo.clone_url}" "${dir}"`, {
      stdio: 'ignore',
      timeout: 120000,
    });
  } catch {
    row.outcome = 'clone-failed';
    results.push(row);
    console.log(`${String(i + 1).padStart(3)}/${sample.length}  clone-failed`);
    continue;
  }

  const first = scanOnce(dir);

  if (first.ok) {
    row.outcome = 'scanned';
    Object.assign(row, summarise([first.scan]));
  } else if (first.signal === 'SIGTERM') {
    row.outcome = 'timeout';
  } else {
    const kids = childDirs(first.raw);
    if (kids.length > 0) {
      // A workspace. Scan each application inside it and sum into this row.
      const scans = [];
      for (const kid of kids) {
        const r = scanOnce(path.join(dir, kid));
        if (r.ok) scans.push(r.scan);
      }
      if (scans.length > 0) {
        row.outcome = 'scanned';
        row.viaWorkspace = scans.length;
        Object.assign(row, summarise(scans));
      } else {
        row.outcome = 'workspace-unreadable';
        row.note = `${kids.length} candidate ${kids.length === 1 ? 'app' : 'apps'}, none scannable`;
      }
    } else {
      const lines = first.raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !/^Scanning /.test(l));
      row.note = lines.slice(0, 3).join(' | ').slice(0, 200);
      row.outcome = /runs in the browser|single-page/i.test(first.raw)
        ? 'client-only'
        : /nobody has written that extractor/i.test(first.raw)
          ? 'framework-not-supported'
          : 'not-supported';
    }
  }

  fs.rmSync(dir, { recursive: true, force: true });
  results.push(row);
  console.log(
    `${String(i + 1).padStart(3)}/${sample.length}  ${row.outcome.padEnd(13)}` +
      (row.outcome === 'scanned'
        ? `ways in ${String(row.behaviours).padStart(4)}   consequential ${String(row.consequential).padStart(3)}   findings ${row.gapCount}`
        : ''),
  );
  fs.writeFileSync('results.json', JSON.stringify(results, null, 1));
}

console.log('\ndone');
