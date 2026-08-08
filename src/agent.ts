/**
 * The agent surface.
 *
 * WHY THIS EXISTS. The people this tool is for are not reading forums; they
 * are sitting inside Claude Code or Cursor while an assistant writes their
 * application. The thing that decides which tools get used there is not a
 * launch post — it is what the agent reads on every turn.
 *
 * That is not a hunch. Aion, the operator's previous project, benchmarked it
 * over 27 sessions: offered as a skill the agent must choose to invoke, it was
 * reached for 22% of the time; named in CLAUDE.md, which is read on every
 * turn, 100%. A 4.5x difference from placement alone, with the engine
 * unchanged.
 *
 * So the instruction is written for the file that is always read, and the CLI
 * writes it for you — because the same benchmark found that authoring friction
 * costs more adoption than features do.
 *
 * WHY IT IS ALSO BETTER PRODUCT. Drift is worth most at the instant code
 * changes. An agent that snapshots before it edits and diffs after gets that
 * for free, and the human is told what moved without asking. Nobody has to
 * remember to run anything.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Where each assistant reads its standing instructions from. */
export const AGENT_FILES = [
  { file: 'CLAUDE.md', name: 'Claude Code' },
  { file: 'AGENTS.md', name: 'Codex and others' },
  { file: '.cursorrules', name: 'Cursor' },
] as const;

/** Markers so the block can be found and replaced rather than duplicated. */
export const BEGIN = '<!-- what-it-does:begin -->';
export const END = '<!-- what-it-does:end -->';

/**
 * The instruction itself.
 *
 * Written the way the aion snippet is written: what to do, when it applies,
 * and — load-bearing — when NOT to. An instruction with no stated boundary
 * gets ignored or over-applied, and both look the same from here.
 */
export const SNIPPET = `${BEGIN}
## Checking what you changed

This project is scanned by \`what-it-does\`, which reads the application and
reports every way into it — pages, endpoints, form actions — and what each one
really does: which tables it reads, writes or deletes from, where it takes
payment, what it sends email through.

**Before editing server-side code**, record the current behaviour:

\`\`\`
npx what-it-does --json > .what-it-does/before.json
\`\`\`

**After the edits are complete**, compare against it and report what moved:

\`\`\`
npx what-it-does --json > .what-it-does/after.json
npx what-it-does diff .what-it-does/before.json .what-it-does/after.json
\`\`\`

The diff is in behaviour, not in lines. It is how you notice that an endpoint
stopped checking who was asking, or that the only writer to a table is gone —
things a code diff shows you but does not tell you. **Surface anything it flags
to the user before you finish.** Treat a finding as something to raise, not
something to silently fix: it may be a false alarm, and the report says what
would make it one.

Skip this for changes that cannot alter behaviour — styling, copy, comments,
tests, docs, config that nothing branches on. It applies to routes, server
actions, middleware, and the code they reach.
${END}`;

export interface InstallResult {
  file: string;
  action: 'created' | 'updated' | 'unchanged';
}

/**
 * Write the block into an agent file, replacing any previous copy.
 *
 * Replace rather than append, so running this twice cannot leave two
 * conflicting copies of the instruction in a file the agent reads every turn.
 */
export function installInto(root: string, file: string): InstallResult {
  const full = path.join(root, file);
  let existing = '';
  try {
    existing = fs.readFileSync(full, 'utf8');
  } catch {
    fs.writeFileSync(full, SNIPPET + '\n', 'utf8');
    return { file, action: 'created' };
  }

  const start = existing.indexOf(BEGIN);
  const finish = existing.indexOf(END);

  if (start !== -1 && finish !== -1 && finish > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(finish + END.length);
    const next = before + SNIPPET + after;
    if (next === existing) return { file, action: 'unchanged' };
    fs.writeFileSync(full, next, 'utf8');
    return { file, action: 'updated' };
  }

  // Appended with a blank line, so it never runs into whatever came before.
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(full, existing + separator + SNIPPET + '\n', 'utf8');
  return { file, action: 'updated' };
}

/**
 * Install into every agent file already present, and into CLAUDE.md if none
 * are. Creating four files in someone's repository uninvited is rude; adding
 * to the ones they already keep is not.
 */
export function install(root: string): InstallResult[] {
  const present = AGENT_FILES.filter((a) => fs.existsSync(path.join(root, a.file)));
  const targets = present.length > 0 ? present : [AGENT_FILES[0]];
  return targets.map((a) => installInto(root, a.file));
}
