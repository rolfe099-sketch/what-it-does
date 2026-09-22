/**
 * The pull request check.
 *
 * Scans the base branch, scans this one, and reports the difference in
 * behaviour rather than in lines. Everything runs inside the customer's own
 * runner: their code is read by a CLI on a machine they control, and nothing
 * ever leaves it. The scanner makes no network requests, and neither does
 * this.
 *
 * ── Two rules that outrank everything ──────────────────────────────────────
 *
 * FAIL OPEN. If a scan errors, if
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
const SUBPATH = process.env.WID_PATH || '.';
const FAIL_ON_NEW = (process.env.WID_FAIL_ON_NEW || 'false') === 'true';

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

  const body = `<!-- what-it-does -->\n${markdown.trim()}`;
  setOutput('markdown', body);

  summary([
    '## what it does',
    '',
    `Read **${baseWays}** ways in on the base branch and **${headWays}** on this one.`,
    `**${changed}** changed, **${newFindings}** new ${newFindings === 1 ? 'finding' : 'findings'}.`,
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
