#!/usr/bin/env node
/**
 * what it does — CLI.
 *
 * Everything runs locally. No network calls, no telemetry, no account. The code
 * being scanned never leaves the machine — that is the product's whole position,
 * so it is enforced here rather than promised in marketing copy.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { detectFramework, type Survey } from './extract/detect.js';
import { buildBehaviours } from './extract/behaviours.js';
import { DEFAULT_DEPTH } from './extract/trace.js';
import { renderReport } from './report/render.js';
import {
  snapshot,
  diff,
  diffSnapshots,
  appendToHistory,
  buildTimeline,
  SNAPSHOT_VERSION,
  type History,
  type Snapshot,
} from './report/drift.js';
import { renderComment } from './report/comment.js';
import {
  CONSEQUENTIAL_EFFECTS,
  EFFECT_LABELS,
  UNKNOWN_GUIDANCE,
  consequenceScore,
  type Behaviour,
  plural,
  type EffectKind,
} from './model.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const ACCENT = '\x1b[38;5;173m';
const WARN = '\x1b[38;5;179m';
const ALERT = '\x1b[38;5;167m';

const heading = (text: string) => console.log(`\n${BOLD}${text}${RESET}`);

/**
 * How many behaviours to show in detail. The map orients; it does not enumerate.
 * The limit exists for large codebases — hiding two items behind a "12 of 14"
 * looks broken rather than considered, so small projects show everything.
 */
const DETAIL_LIMIT = 12;
const SHOW_ALL_BELOW = 16;

function summariseEffects(behaviours: Behaviour[]) {
  const counts = new Map<EffectKind, number>();
  for (const behaviour of behaviours) {
    for (const kind of new Set(behaviour.effects.map((e) => e.kind))) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  // Consequential kinds first — money, deletion and access before everything else.
  return [...counts.entries()].sort((a, b) => {
    const aBig = CONSEQUENTIAL_EFFECTS.has(a[0]) ? 1 : 0;
    const bBig = CONSEQUENTIAL_EFFECTS.has(b[0]) ? 1 : 0;
    if (aBig !== bBig) return bBig - aBig;
    return b[1] - a[1];
  });
}

function printBehaviour(behaviour: Behaviour, index: number) {
  console.log(`\n  ${BOLD}${index}. ${behaviour.title}${RESET}`);
  console.log(`     ${DIM}${behaviour.trigger.source.file}:${behaviour.trigger.source.line}${RESET}`);

  const ordered = [...behaviour.effects].sort((a, b) => {
    const aBig = CONSEQUENTIAL_EFFECTS.has(a.kind) ? 1 : 0;
    const bBig = CONSEQUENTIAL_EFFECTS.has(b.kind) ? 1 : 0;
    return bBig - aBig;
  });

  for (const effect of ordered) {
    const mark = CONSEQUENTIAL_EFFECTS.has(effect.kind) ? `${ACCENT}●${RESET}` : `${DIM}○${RESET}`;
    const hedge = effect.confidence === 'likely' ? ` ${DIM}(probably)${RESET}` : '';
    console.log(`     ${mark} ${effect.description}${hedge}`);
  }

  for (const unknown of behaviour.unknowns) {
    if (UNKNOWN_GUIDANCE[unknown.reason].severity !== 'warning') continue;
    console.log(`     ${WARN}⚠${RESET} ${unknown.detail}`);
  }
}

interface ScanOptions {
  /** Write the HTML report. On by default — it is the actual product. */
  report: boolean;
  /** Open the report in the default browser once written. */
  open: boolean;
  /** Embed source excerpts in walkthroughs. */
  includeCode: boolean;
  /**
   * Emit the snapshot as JSON on stdout and nothing else.
   *
   * The machine-readable half. Two of these — one per branch — are everything
   * the `diff` command needs, which is how a CI job compares two branches
   * without either scan ever seeing the other's source.
   */
  json: boolean;
}

/**
 * Where the previous scan is kept, so the next one can say what moved.
 * Inside the scanned project, because the comparison belongs to that project.
 */
const SNAPSHOT_DIR = '.what-it-does';
const HISTORY_FILE = 'history.json';

function readHistory(root: string): History | null {
  try {
    const raw = fs.readFileSync(path.join(root, SNAPSHOT_DIR, HISTORY_FILE), 'utf8');
    const parsed = JSON.parse(raw);
    // A version we do not recognise is discarded rather than migrated. The
    // cost is one scan with no comparison; the alternative is guessing at the
    // meaning of an older shape and reporting drift that never happened.
    return parsed?.version === 2 && Array.isArray(parsed.scans) ? (parsed as History) : null;
  } catch {
    return null;
  }
}

function writeHistory(root: string, history: History) {
  try {
    const dir = path.join(root, SNAPSHOT_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, HISTORY_FILE), JSON.stringify(history), 'utf8');
  } catch {
    /* A read-only project still gets a report; it just cannot remember. */
  }
}

/** Hand the report to the OS. Best-effort: a failure here is not a scan failure. */
function openInBrowser(file: string) {
  const command =
    process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* The path is printed regardless, so the visitor can open it themselves. */
  }
}

/**
 * The most common first experience with this tool, so it gets written properly.
 *
 * "Not supported" is a fact about us, not about their code. Every line here
 * exists to stop the person concluding the tool is broken: name what we
 * recognised, say plainly what is missing, and point at the one thing that
 * would change the answer.
 */
function reportUnsupported(survey: Survey) {
  // A readable application one level down outranks everything else we could
  // say, because it is the only line that comes with something to do. This is
  // the whole experience of pointing the tool at a monorepo root.
  if (survey.scannableChildren.length > 0) {
    const found = survey.scannableChildren;
    console.error(`
${BOLD}Nothing to read at this level, but there is one level down.${RESET}`);
    console.error(
      `${DIM}This looks like a workspace. The applications are in subdirectories, and`,
    );
    console.error(`${plural(found.length, 'this one is', 'these are')} readable:${RESET}
`);
    for (const child of found) {
      console.error(`  ${ACCENT}${child.dir}${RESET}${DIM}  ${child.framework}${RESET}`);
    }
    console.error(`
${DIM}Scan one directly:${RESET} what-it-does ${found[0].dir}`);
    return;
  }

  if (survey.recognised) {
    // "This looks like X" rather than "This is a/an X project" — the names in
    // the table are a mix of vowels, consonants and plurals, and no article
    // fits all of them.
    console.error(`\n${BOLD}This looks like ${survey.recognised.name}.${RESET}`);
    console.error(`${DIM}We recognise it but cannot read it yet - nobody has written that`);
    console.error(`extractor. It would key on ${survey.recognised.entryHint}.${RESET}`);
  } else if (survey.otherLanguages.length > 0 && survey.codeFiles === 0) {
    /**
     * Named, not guessed at.
     *
     * This branch exists because a 41-file Python application was told it was
     * a static site whose HTML said everything — the tool being confidently
     * wrong about somebody's entire codebase, on the output most strangers
     * see first. "We cannot read Python" is a limit. "You have no server-side
     * code" is a false claim about their work.
     */
    const [main, ...rest] = survey.otherLanguages;
    console.error(`\n${BOLD}This is a ${main.name} project.${RESET}`);
    console.error(
      `${DIM}${main.files} ${main.name} ${plural(main.files, 'file', 'files')}${
        rest.length > 0 ? `, plus ${rest.map((l) => l.name).join(' and ')}` : ''
      }, and no JavaScript or TypeScript at all.`,
    );
    console.error(`We only read JavaScript and TypeScript today, so we cannot tell you`);
    console.error(`anything about this — which is our limit, not a fact about your code.${RESET}`);
  } else if (survey.staticOnly) {
    console.error(`\n${BOLD}There is no code here we recognise.${RESET}`);
    console.error(
      `${DIM}No JavaScript or TypeScript, and none of the other languages we can at least`,
    );
    console.error(
      `name. If this is a static site, it does what its HTML says and nothing more.${RESET}`,
    );
    return;
  } else {
    console.error(`\n${BOLD}We could not identify a framework here.${RESET}`);
    if (survey.nextReason) console.error(`${DIM}${survey.nextReason}${RESET}`);
    // The count stops at a budget, so past it we know a floor and not a total.
    // Printing the cap as if it were the answer would be a quietly invented
    // statistic, which is the one thing this tool must never do.
    const count = survey.codeFilesCapped
      ? 'Thousands of source files are'
      : `${survey.codeFiles} source ${plural(survey.codeFiles, 'file is', 'files are')}`;
    console.error(
      `${DIM}${count} present, but nothing declares its entry points in a`,
    );
    console.error(`way we know how to read.${RESET}`);
  }

  heading('What we can read today');
  console.log(`  Next.js${DIM} - app router: pages, API routes, server actions${RESET}`);
  console.log(`  Cloudflare Pages${DIM} - functions/: onRequest handlers${RESET}`);
  console.log(
    `\n${DIM}An extractor is one file. It finds entry points and describes each as a`,
  );
  console.log(`trigger, a path and a set of effects. Everything after that is shared.${RESET}`);
}

/**
 * A name for the project, from its path.
 *
 * `path.basename` alone titles every monorepo report "web", because the app
 * lives at `apps/web` and that is what the folder is called. The package.json
 * `name` is no better — dub's says "web" too, and plenty say "my-project" or
 * nothing at all.
 *
 * So: if the folder has a generic workspace name, qualify it with the nearest
 * ancestor that does not. `dub/apps/web` becomes "dub/web", which is both
 * recognisable and still precise when a repo holds several applications.
 */
const GENERIC_DIRS = new Set([
  'web', 'app', 'apps', 'api', 'src', 'server', 'client', 'site', 'www',
  'frontend', 'backend', 'packages', 'main', 'root',
]);

function projectNameFor(root: string): string {
  const base = path.basename(root);
  if (!GENERIC_DIRS.has(base.toLowerCase())) return base;

  let current = root;
  for (let hops = 0; hops < 4; hops++) {
    const parent = path.dirname(current);
    if (parent === current) break; // reached the filesystem root
    const name = path.basename(parent);
    if (!GENERIC_DIRS.has(name.toLowerCase())) return `${name}/${base}`;
    current = parent;
  }
  return base;
}

function scan(target: string, options: ScanOptions) {
  const root = path.resolve(target);
  // Progress belongs on stderr in machine mode, where stdout is the payload.
  if (options.json) console.error(`${DIM}Scanning ${root}${RESET}`);
  else console.log(`${DIM}Scanning ${root}${RESET}`);

  const started = Date.now();
  const detected = detectFramework(root);
  if (!detected.supported) {
    reportUnsupported(detected.survey);
    process.exit(1);
  }

  const { framework, where, triggers, skipped, middleware } = detected.scan;

  const { behaviours } = buildBehaviours(root, triggers, middleware);
  const elapsed = Date.now() - started;

  /**
   * Machine mode stops here.
   *
   * Nothing but JSON reaches stdout, so the output can be redirected straight
   * into a file. History is deliberately NOT written: a CI checkout is
   * disposable, and leaving a new untracked directory behind would dirty a
   * working tree that later steps may check.
   */
  if (options.json) {
    process.stdout.write(JSON.stringify(snapshot(behaviours), null, 2) + '\n');
    return;
  }

  // Compare against the last scan, then remember this one.
  const history = readHistory(root);
  const previous = history?.scans[history.scans.length - 1] ?? null;
  const drift = previous ? diff(previous, behaviours) : undefined;

  const updated = appendToHistory(history, snapshot(behaviours));
  writeHistory(root, updated);
  // Two points is the minimum that can show movement.
  const timeline = updated.scans.length >= 2 ? buildTimeline(updated) : undefined;


  console.log(`${DIM}${framework} · ${where} · ${elapsed}ms${RESET}`);

  // ---- What the application can do, at a glance -------------------------
  heading(
    `${behaviours.length} ${plural(behaviours.length, 'way', 'ways')} into this application`,
  );

  const summary = summariseEffects(behaviours);
  if (summary.length > 0) {
    heading('What it can do');
    // Column width from the labels actually present, not a guessed constant —
    // otherwise a long label silently collides with the count beside it.
    const width = Math.max(...summary.map(([kind]) => EFFECT_LABELS[kind].length)) + 2;
    for (const [kind, count] of summary) {
      const mark = CONSEQUENTIAL_EFFECTS.has(kind) ? `${ACCENT}●${RESET}` : `${DIM}○${RESET}`;
      const label = EFFECT_LABELS[kind].padEnd(width);
      console.log(`  ${mark} ${label}${DIM}${count} ${plural(count, 'way in', 'ways in')}${RESET}`);
    }
  }

  // ---- What looks wrong --------------------------------------------------
  // Above everything else, because if the tool thinks something is broken that
  // is the first thing a person should read.
  const withGaps = behaviours.filter((b) => b.gaps.length > 0);
  if (withGaps.length > 0) {
    const total = withGaps.reduce((n, b) => n + b.gaps.length, 0);
    heading(`${total} ${plural(total, 'thing', 'things')} worth checking`);
    for (const behaviour of withGaps) {
      for (const gap of behaviour.gaps) {
        const mark = gap.confidence === 'likely' ? `${ALERT}▲${RESET}` : `${WARN}▲${RESET}`;
        console.log(`\n  ${mark} ${BOLD}${behaviour.title}${RESET}`);
        console.log(`    ${gap.summary}`);
        console.log(`    ${DIM}${gap.detail}${RESET}`);
        console.log(`    ${DIM}${gap.source.file}:${gap.source.line}${RESET}`);
      }
    }
  }

  // ---- The ones that matter ---------------------------------------------
  const ranked = [...behaviours]
    .map((b) => ({ b, score: consequenceScore(b) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length > 0) {
    const showAll = ranked.length <= SHOW_ALL_BELOW;
    const shown = showAll ? ranked : ranked.slice(0, DETAIL_LIMIT);
    const caption = showAll
      ? 'ranked by consequence'
      : `${shown.length} of ${ranked.length}, ranked by consequence`;
    heading(`Worth looking at first ${DIM}(${caption})${RESET}`);
    shown.forEach((x, i) => printBehaviour(x.b, i + 1));
  }

  // ---- Behaviours we found nothing in -----------------------------------
  const empty = behaviours.length - ranked.length;
  if (empty > 0) {
    heading(`${empty} ways in where we found no effects`);
    console.log(`  ${DIM}Some of these genuinely do nothing — a static page is just a page.${RESET}`);
    console.log(
      `  ${DIM}The rest reach their work further than ${DEFAULT_DEPTH} hops of imports, or through${RESET}`,
    );
    console.log(`  ${DIM}code we cannot follow. Absence of effects here is not proof of none.${RESET}`);
  }

  // ---- Unknowns are reported, never swallowed ---------------------------
  const configDependent = behaviours.flatMap((b) =>
    b.unknowns.filter((u) => u.reason === 'config-dependent'),
  );
  if (configDependent.length > 0) {
    heading(
      `${configDependent.length} ${plural(configDependent.length, 'place', 'places')} that ${plural(configDependent.length, 'depends', 'depend')} on configuration`,
    );
    console.log(
      `  ${DIM}${plural(configDependent.length, 'This', 'These')} may behave differently in production than ${plural(configDependent.length, 'it does', 'they do')} locally.${RESET}`,
    );
  }

  if (skipped.length > 0) {
    heading(`${skipped.length} things we could not read`);
    const byReason = new Map<string, number>();
    for (const unknown of skipped) {
      byReason.set(unknown.reason, (byReason.get(unknown.reason) ?? 0) + 1);
    }
    for (const [reason, count] of byReason) {
      console.log(
        `  ${DIM}${count} × ${reason} — ${UNKNOWN_GUIDANCE[reason as keyof typeof UNKNOWN_GUIDANCE].action}${RESET}`,
      );
    }
  }

  if (options.report) {
    const html = renderReport({
      projectName: projectNameFor(root),
      root,
      framework,
      behaviours,
      skipped,
      middleware,
      elapsedMs: elapsed,
      scannedAt: new Date(),
      traceDepth: DEFAULT_DEPTH,
      drift,
      timeline,
      includeCode: options.includeCode,
    });
    const out = path.join(process.cwd(), 'what-it-does-report.html');
    fs.writeFileSync(out, html, 'utf8');
    console.log(`
${BOLD}Report${RESET} ${ACCENT}${out}${RESET}`);
    if (options.open) openInBrowser(out);
  }

  console.log('');
}

/**
 * Compare two snapshots written by `--json`.
 *
 * The two sides never meet except as data. That is what makes the CI story
 * work: a job scans the base branch, scans the head branch, and compares the
 * results, with no step that needs both working trees at once and nothing
 * leaving the runner.
 */
function readSnapshot(file: string): Snapshot {
  let raw: string;
  try {
    raw = fs.readFileSync(path.resolve(file), 'utf8');
  } catch {
    console.error(`${BOLD}Cannot read${RESET} ${file}`);
    console.error(`${DIM}Write one with: npx what-it-does --json > ${path.basename(file)}${RESET}`);
    process.exit(2);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`${BOLD}${file} is not valid JSON.${RESET}`);
    process.exit(2);
  }

  const candidate = parsed as Partial<Snapshot>;
  if (candidate?.version !== SNAPSHOT_VERSION || !Array.isArray(candidate.behaviours)) {
    console.error(`${BOLD}${file} is not a snapshot this version can read.${RESET}`);
    console.error(
      `${DIM}Expected version ${SNAPSHOT_VERSION}, found ${String(candidate?.version)}. Both sides must come from the same version.${RESET}`,
    );
    process.exit(2);
  }
  return candidate as Snapshot;
}

interface DiffOptions {
  markdown: boolean;
  json: boolean;
  /** Exit non-zero when the comparison turns up a new finding. */
  failOnNew: boolean;
  comparedTo?: string;
}

function runDiff(beforeFile: string, afterFile: string, options: DiffOptions) {
  const result = diffSnapshots(readSnapshot(beforeFile), readSnapshot(afterFile));
  const newGaps = result.changes.reduce((n, c) => n + c.newGaps.length, 0);

  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (options.markdown) {
    process.stdout.write(renderComment(result, { comparedTo: options.comparedTo }) + '\n');
  } else {
    if (result.changes.length === 0) {
      console.log(`\n${BOLD}Nothing changed.${RESET}`);
      console.log(
        `${DIM}${result.unchanged} ${plural(result.unchanged, 'behaviour', 'behaviours')} checked, none moved.${RESET}\n`,
      );
    } else {
      heading(
        `${result.changes.length} ${plural(result.changes.length, 'thing', 'things')} changed`,
      );
      for (const change of result.changes) {
        const mark =
          change.newGaps.length > 0
            ? `${ALERT}▲${RESET}`
            : change.kind === 'removed'
              ? `${WARN}−${RESET}`
              : `${ACCENT}●${RESET}`;
        console.log(`\n  ${mark} ${BOLD}${change.title}${RESET}${DIM}  ${change.kind}${RESET}`);
        for (const gap of change.newGaps) {
          console.log(`    ${ALERT}${gap.summary}${RESET}`);
          console.log(`    ${DIM}${gap.source}${RESET}`);
        }
        for (const lost of change.lost) console.log(`    ${WARN}−${RESET} ${lost}`);
        for (const gained of change.gained) console.log(`    ${ACCENT}+${RESET} ${gained}`);
      }
      console.log(
        `
${DIM}${result.unchanged} other ${plural(result.unchanged, 'behaviour', 'behaviours')} unchanged.${RESET}\n`,
      );
    }
  }

  // The exit code is the whole point in CI: it is what turns a comment into a
  // gate. Opt-in, because failing a build by default on a tool someone just
  // installed is how the tool gets removed.
  if (options.failOnNew && newGaps > 0) process.exit(1);
}

/**
 * Scanning is the only thing this does, so it is what happens by default.
 *
 * `npx what-it-does` with nothing after it reads the current directory. The
 * name is long enough to type once; making someone add `scan` to it as well
 * buys nothing, and a tool with one verb should not make you say the verb.
 * `scan` still works, because it is what the README said for a while and
 * breaking a documented command to save four characters is not a trade.
 */
const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('-'));
const wantsHelp = argv.some((a) => a === '--help' || a === '-h' || a === 'help');

const flagValue = (name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at !== -1 ? argv[at + 1] : undefined;
};

if (wantsHelp) {
  console.log(`
${BOLD}what it does${RESET} — shows you what software you didn't write actually does

  ${BOLD}npx what-it-does${RESET}                    Read the current directory
  ${BOLD}npx what-it-does${RESET} [path]             Read somewhere else

    --no-open     Write the report but do not open it
    --no-report   Terminal output only
    --no-code     Omit source excerpts, for a report you intend to share
    --json        Print the snapshot as JSON, and nothing else

  ${BOLD}npx what-it-does diff${RESET} [a] [b]       Compare two snapshots

    --markdown    Render as a pull request comment
    --json        Print the comparison as JSON
    --fail-on-new Exit 1 if the comparison finds something new
    --compared-to What to call the left side, e.g. "main"

Writes a single self-contained HTML file. No server, no network, no account —
your code never leaves this machine, and neither does the report.
`);
} else if (positional[0] === 'diff') {
  const [before, after] = positional.slice(1);
  if (!before || !after) {
    console.error(`\n${BOLD}diff needs two snapshots.${RESET}`);
    console.error(`${DIM}npx what-it-does --json > before.json${RESET}`);
    console.error(`${DIM}npx what-it-does --json > after.json${RESET}`);
    console.error(`${DIM}npx what-it-does diff before.json after.json${RESET}\n`);
    process.exit(2);
  }
  runDiff(before, after, {
    markdown: argv.includes('--markdown'),
    json: argv.includes('--json'),
    failOnNew: argv.includes('--fail-on-new'),
    comparedTo: flagValue('--compared-to'),
  });
} else {
  const target = positional[0] === 'scan' ? positional[1] : positional[0];
  scan(target ?? process.cwd(), {
    report: !argv.includes('--no-report'),
    open: !argv.includes('--no-open'),
    includeCode: !argv.includes('--no-code'),
    json: argv.includes('--json'),
  });
}
