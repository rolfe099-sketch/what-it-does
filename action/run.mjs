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

// Its own module, and the one piece of this with a test that talks to the real
// API. See licence.mjs for what went wrong when it did not have one.
import { checkLicence } from './licence.mjs';

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

/**
 * The run page, not the log.
 *
 * Fail-open has a cost: a green run tells you nothing about whether the check
 * actually looked at anything. On its first real pull request this produced a
 * successful run, no comment, and no way to find out why without credentials
 * to download the logs. So every outcome now writes a summary panel — what it
 * read, what it found, and what it decided — which is visible on the run page
 * to anyone who can see the repository.
 */
function summary(lines) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  const text = lines.join('\n');
  console.log(text.replace(/[#*`]/g, ''));
  if (file) {
    try {
      fs.appendFileSync(file, text + '\n');
    } catch {
      /* the log above already carried it */
    }
  }
}

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

/** One quiet line, in the comment they are already reading. */
function licenceNote(committers, tier, licence) {
  if (!IS_PRIVATE) return ''; // public repositories are free, always

  if (licence.verdict === 'absent') {
    return `\n\n<sub>This is a private repository with **${committers} active ${
      committers === 1 ? 'committer' : 'committers'
    }** in the last 90 days — the ${tier.name} tier, ${tier.price}. Running unlicensed. → https://eriksenlabs.com/#what-it-does</sub>`;
  }
  if (licence.verdict === 'rejected') {
    return `\n\n<sub>The licence key on this repository was not recognised. → https://eriksenlabs.com/#what-it-does</sub>`;
  }
  // 'granted', and 'unreachable' — which is our problem to notice on the run
  // page, not theirs to read about on their pull request.
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
    // we do not support yet, and the CLI says which on stderr — printed in
    // full, because a truncated explanation is how a fixable problem stays
    // unfixed.
    summary([
      '## what it does — nothing to compare',
      '',
      'The scan could not read this project, so the check passed without',
      'comparing anything. This is not a build failure.',
      '',
      '```',
      String(error.stderr || error.message || error).trim(),
      '```',
      '',
      `Scanned: \`${base}\` and \`${head}\``,
    ]);
    setOutput('changed', '0');
    setOutput('new-findings', '0');
    setOutput('markdown', '');
    return;
  }

  const waysIn = (json) => {
    try {
      return JSON.parse(json).behaviours.length;
    } catch {
      return -1;
    }
  };
  const baseWays = waysIn(beforeJson);
  const headWays = waysIn(afterJson);

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
    summary([
      '## what it does — the comparison failed',
      '',
      'Not failing the build over it. This is our bug, not yours.',
      '',
      '```',
      String(error.stderr || error.message || error).trim(),
      '```',
    ]);
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
    summary([
      '## what it does — nothing moved',
      '',
      `Read **${baseWays}** ways in on the base branch and **${headWays}** on this one.`,
      'Nothing this pull request does changes what the application can do, so',
      'no comment was posted.',
    ]);
    setOutput('markdown', '');
    return;
  }

  const committers = activeCommitters(head);
  const tier = tierFor(committers);
  const licence = await checkLicence(KEY);

  const body = `<!-- what-it-does -->\n${markdown.trim()}${licenceNote(committers, tier, licence)}`;
  setOutput('markdown', body);

  // Named out loud, because the whole class of bug this replaced was one where
  // "checked and fine" and "never actually checked" printed the same thing.
  const LICENCE_LINE = {
    absent: 'Licence: none configured — private repositories need a key.',
    granted: 'Licence: valid.',
    rejected: 'Licence: rejected by Polar.',
    unreachable: 'Licence: could not be checked, so the check passed anyway.',
  };

  summary([
    '## what it does',
    '',
    `Read **${baseWays}** ways in on the base branch and **${headWays}** on this one.`,
    `**${changed}** changed, **${newFindings}** new ${newFindings === 1 ? 'finding' : 'findings'}.`,
    '',
    IS_PRIVATE
      ? `${LICENCE_LINE[licence.verdict]}${licence.detail ? ` (${licence.detail})` : ''}`
      : 'Public repository — free, no licence needed.',
    '',
    'The comparison was posted as a pull request comment.',
  ]);

  if (FAIL_ON_NEW && newFindings > 0) {
    console.error(`Failing because ${newFindings} new finding(s) appeared and fail-on-new is set.`);
    process.exit(1);
  }
}

main().catch((error) => {
  // The last line of defence for the fail-open rule.
  summary([
    '## what it does — stepped aside',
    '',
    'Something unexpected happened and the check passed rather than blocking',
    'you. This is our bug. The detail below is worth sending to',
    'support@eriksenlabs.com.',
    '',
    '```',
    String(error?.stack || error).trim(),
    '```',
  ]);
});
