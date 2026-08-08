/**
 * The pull request check.
 *
 * Scans the base branch, scans this one, and reports the difference in
 * behaviour rather than in lines. Everything runs inside the customer's own
 * runner: their code is read by a CLI on a machine they control, and the only
 * request that ever leaves is an optional licence check carrying a key and
 * nothing else.
 *
 * ── Two rules that outrank everything ──────────────────────────────────────
 *
 * FAIL OPEN. If the licence check cannot be reached, if a scan errors, if
 * anything at all goes sideways, this must not break somebody's build. A tool
 * that turns a green pipeline red because OUR service hiccupped is a tool
 * removed from every workflow in the company that afternoon. The only red this
 * ever produces is a finding the customer explicitly asked to be failed on.
 *
 * SAY LESS THAN YOU KNOW. The comment is edited in place, never appended, and
 * silent when nothing changed. The right to interrupt is earned by not doing
 * it when there is nothing to say.
 */

import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT = process.env.GITHUB_OUTPUT;
const KEY = (process.env.WID_LICENCE_KEY || '').trim();
const SUBPATH = process.env.WID_PATH || '.';
const FAIL_ON_NEW = (process.env.WID_FAIL_ON_NEW || 'false') === 'true';
const IS_PRIVATE = (process.env.WID_REPO_PRIVATE || 'false') === 'true';

/** Tier boundaries, by active committers. Mirrors the published prices. */
const TIERS = [
  { name: 'Team', max: 10, price: '$49/mo' },
  { name: 'Business', max: 50, price: '$149/mo' },
  { name: 'Scale', max: Infinity, price: '$399/mo' },
];

function setOutput(name, value) {
  if (!OUT) return;
  // The delimiter form, because the markdown is multi-line and the plain
  // `name=value` form silently truncates at the first newline.
  const id = `wid_${Math.random().toString(36).slice(2)}`;
  fs.appendFileSync(OUT, `${name}<<${id}\n${value}\n${id}\n`);
}

/**
 * The CLI is installed once by a prior step and invoked as plain JavaScript,
 * never through npx.
 *
 * Two reasons, one of them a real bug. On Windows runners `npx` is `npx.cmd`,
 * and since Node 20 a .cmd file cannot be spawned by execFile without a shell
 * (a CVE mitigation) — so `npx` throws ENOENT and `npx.cmd` throws EINVAL.
 * Reaching for shell:true would then have to survive the backticks in the
 * --compared-to argument. Running `node cli.js` sidesteps the shell entirely.
 * It is also faster: npx re-resolves the package on every one of the four
 * invocations below.
 */
const CLI = path.join(
  process.env.RUNNER_TEMP || process.env.TMPDIR || '/tmp',
  'what-it-does',
  'node_modules',
  'what-it-does',
  'dist',
  'cli.js',
);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

/**
 * Active committers, from the customer's own git history.
 *
 * This is the meter, and it is deliberately one they can run themselves:
 * `git shortlog -sn --since=90.days`. Someone who has not committed in three
 * months is not producing drift for this to catch, so they are not counted.
 * Nothing about it is reported anywhere — the number is computed here, used
 * here, and discarded.
 */
function activeCommitters(repoDir) {
  try {
    const out = execSync('git log --since=90.days --format=%ae', {
      cwd: repoDir,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const emails = new Set(
      out
        .split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean)
        // Bots are not people and must not push anyone into a higher tier.
        .filter((email) => !/(\[bot\]|noreply@github\.com|actions@github\.com)/.test(email)),
    );
    return emails.size;
  } catch {
    return 0; // unknown; never used to charge anyone more
  }
}

function tierFor(committers) {
  return TIERS.find((t) => committers <= t.max) ?? TIERS[TIERS.length - 1];
}

/**
 * Ask Polar whether the key is real. Public endpoint, key only.
 *
 * Returns true on any failure that is not an explicit rejection, because
 * fail-open is the rule. A network blip must never look like piracy.
 */
async function licenceIsValid(key) {
  if (!key) return false;
  try {
    const response = await fetch('https://api.polar.sh/v1/customer-portal/license-keys/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404 || response.status === 403) return false;
    if (!response.ok) return true; // our problem, not theirs
    const body = await response.json();
    return body?.status ? body.status === 'granted' : true;
  } catch {
    return true; // unreachable: assume good faith
  }
}

/** One quiet line, in the comment they are already reading. */
function licenceNote(committers, tier, valid) {
  if (!IS_PRIVATE) return ''; // public repositories are free, always

  if (!KEY) {
    return `\n\n<sub>This is a private repository with **${committers} active ${
      committers === 1 ? 'committer' : 'committers'
    }** in the last 90 days — the ${tier.name} tier, ${tier.price}. Running unlicensed. → https://eriksenlabs.com/#what-it-does</sub>`;
  }
  if (!valid) {
    return `\n\n<sub>The licence key on this repository was not recognised. → https://eriksenlabs.com/#what-it-does</sub>`;
  }
  return '';
}

async function main() {
  const base = path.resolve('.wid-base', SUBPATH);
  const head = path.resolve('.wid-head', SUBPATH);
  const cli = [CLI];

  // ---- scan both sides ---------------------------------------------------
  let beforeJson;
  let afterJson;
  try {
    beforeJson = run(process.execPath, [...cli, base, '--json']);
    afterJson = run(process.execPath, [...cli, head, '--json']);
  } catch (error) {
    // An unreadable project is not a build failure. It is usually a framework
    // we do not support yet, and the CLI already says so on stderr.
    console.log('what-it-does could not read this project; nothing to compare.');
    console.log(String(error.stderr || error.message || error).slice(0, 800));
    setOutput('changed', '0');
    setOutput('new-findings', '0');
    setOutput('markdown', '');
    return;
  }

  fs.writeFileSync('.wid-before.json', beforeJson);
  fs.writeFileSync('.wid-after.json', afterJson);

  // ---- compare -----------------------------------------------------------
  let markdown = '';
  try {
    markdown = run(process.execPath, [
      ...cli,
      'diff',
      '.wid-before.json',
      '.wid-after.json',
      '--markdown',
      '--compared-to',
      '`' + (process.env.GITHUB_BASE_REF || 'the base branch') + '`',
    ]);
  } catch (error) {
    console.log('The comparison failed. Not failing the build over it.');
    console.log(String(error.stderr || error.message || error).slice(0, 800));
    setOutput('changed', '0');
    setOutput('new-findings', '0');
    setOutput('markdown', '');
    return;
  }

  const result = JSON.parse(
    run(process.execPath, [...cli, 'diff', '.wid-before.json', '.wid-after.json', '--json']),
  );
  const changed = result.changes.length;
  const newFindings = result.changes.reduce((n, c) => n + c.newGaps.length, 0);

  setOutput('changed', String(changed));
  setOutput('new-findings', String(newFindings));

  // ---- say nothing when nothing happened ---------------------------------
  if (changed === 0) {
    console.log('No change to what this application can do.');
    setOutput('markdown', '');
    return;
  }

  const committers = activeCommitters(head);
  const tier = tierFor(committers);
  const valid = await licenceIsValid(KEY);

  const body = `<!-- what-it-does -->\n${markdown.trim()}${licenceNote(committers, tier, valid)}`;
  setOutput('markdown', body);

  console.log(`${changed} behaviour(s) changed, ${newFindings} new finding(s).`);

  if (FAIL_ON_NEW && newFindings > 0) {
    console.error(`Failing because ${newFindings} new finding(s) appeared and fail-on-new is set.`);
    process.exit(1);
  }
}

main().catch((error) => {
  // The last line of defence for the fail-open rule.
  console.log('what-it-does hit an unexpected error and is stepping aside.');
  console.log(String(error?.stack || error).slice(0, 1000));
});
