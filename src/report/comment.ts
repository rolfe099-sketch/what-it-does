/**
 * The pull request comment.
 *
 * This is the entire product surface of the CI half. Nobody will open a report
 * from a bot; they will read four lines in a PR and decide whether this tool is
 * worth having. So the constraints are unusually tight:
 *
 *   - **Lead with the decision.** A new unguarded deletion goes first, above
 *     everything, because it is the only part with an action attached.
 *   - **Say nothing when nothing happened.** A bot that comments on every PR to
 *     report no change is a bot people turn off. The caller checks
 *     `worthCommenting` and stays quiet.
 *   - **Never repeat git.** "utils/auth.ts changed" is not a finding. "This
 *     endpoint stopped sending an email" is.
 *   - **Bound the length.** A comment that needs scrolling gets collapsed by
 *     GitHub and read by nobody, so long lists are truncated with an honest
 *     count rather than dumped.
 */

import { isConsequentialKey, type Change, type DriftResult } from './drift.js';
import { plural } from '../model.js';

/** Past this, a comment stops being read and starts being scrolled past. */
const MAX_LISTED = 10;
const MAX_EFFECTS_PER_CHANGE = 5;

/**
 * Is there anything here worth interrupting someone for?
 *
 * The caller uses this to decide whether to post at all. Silence on a PR that
 * changed no behaviour is the feature — it is what earns the right to be noisy
 * on the PR that did.
 */
export function worthCommenting(drift: DriftResult): boolean {
  return drift.changes.length > 0;
}

/**
 * Name a behaviour the way it should be read.
 *
 * A route title is a URL and belongs in code font. A server action title is a
 * sentence — "A form calls sendWelcomeEmail()" — and looks wrong in it. The id
 * prefix already records which is which, so no guessing is needed.
 *
 * Prose still gets escaped. Titles contain names from someone else's codebase,
 * and a path segment like `[id]` followed by a bracket is markdown syntax; a
 * comment that renders as a broken link because of a route parameter is an
 * avoidable embarrassment.
 */
function nameOf(change: Change): string {
  if (change.id.startsWith('route:')) return '`' + change.title.replace(/`/g, '') + '`';
  return change.title.replace(/([\\`*_[\]<>])/g, '\\$1');
}

/** Effects worth naming in a summary line, consequential ones first. */
function rankEffects(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const aBig = isConsequentialKey(a) ? 1 : 0;
    const bBig = isConsequentialKey(b) ? 1 : 0;
    return bBig - aBig;
  });
}

function listEffects(prefix: string, effects: string[]): string[] {
  if (effects.length === 0) return [];
  const shown = effects.slice(0, MAX_EFFECTS_PER_CHANGE);
  const lines = shown.map((e) => `  ${prefix} ${e}`);
  const hidden = effects.length - shown.length;
  if (hidden > 0) lines.push(`  ${prefix} …and ${hidden} more`);
  return lines;
}

function renderChange(change: Change): string {
  const lines: string[] = [];
  const label =
    change.kind === 'added' ? ' — new' : change.kind === 'removed' ? ' — removed' : '';
  lines.push(`- **${nameOf(change)}**${label}`);

  // Gains before losses for an addition (it is all gain), losses first
  // otherwise — a thing that stopped happening is the news.
  if (change.kind === 'removed') {
    lines.push(...listEffects('−', rankEffects(change.lost)));
  } else {
    lines.push(...listEffects('−', rankEffects(change.lost)));
    lines.push(...listEffects('+', rankEffects(change.gained)));
  }

  return lines.join('\n');
}

/**
 * Render a drift result as a GitHub-flavoured markdown comment.
 *
 * `title` names what was compared — "main…this branch" reads better on a PR
 * than a pair of ISO timestamps, and the caller knows the branch names.
 */
export function renderComment(drift: DriftResult, options: { comparedTo?: string } = {}): string {
  const { changes, unchanged } = drift;
  const out: string[] = ['### what it does'];

  if (changes.length === 0) {
    out.push('');
    out.push(
      `No change to what this application can do. ${unchanged} ${plural(unchanged, 'behaviour', 'behaviours')} checked.`,
    );
    return out.join('\n');
  }

  const comparedTo = options.comparedTo ?? `the previous scan`;
  out.push('');
  out.push(
    `This changes what your application can do in ${changes.length} ${plural(changes.length, 'way', 'ways')}, compared with ${comparedTo}.`,
  );

  // ---- The part with a decision attached ---------------------------------
  const withNewGaps = changes.filter((c) => c.newGaps.length > 0);
  const gapCount = withNewGaps.reduce((n, c) => n + c.newGaps.length, 0);

  if (gapCount > 0) {
    out.push('');
    out.push(
      `> [!WARNING]`,
    );
    out.push(
      `> **${gapCount} new ${plural(gapCount, 'thing', 'things')} worth checking.**`,
    );
    for (const change of withNewGaps.slice(0, MAX_LISTED)) {
      for (const gap of change.newGaps) {
        out.push('>');
        out.push(`> **${nameOf(change)}**`);
        out.push(`> ${gap.summary}`);
        out.push(`> \`${gap.source}\``);
      }
    }
  }

  // ---- Everything else, grouped by what happened -------------------------
  /**
   * Anything already in the warning block is not repeated below it. The warning
   * named the behaviour, said what is wrong and gave the file; listing its
   * effects again underneath is padding, and padding is what makes a bot
   * comment something people collapse without reading.
   */
  const alreadyShown = new Set(withNewGaps.map((c) => c.id));
  const rest = changes.filter((c) => !alreadyShown.has(c.id));

  const sections: [string, Change[]][] = [
    ['Added', rest.filter((c) => c.kind === 'added')],
    ['Changed', rest.filter((c) => c.kind === 'changed')],
    ['Removed', rest.filter((c) => c.kind === 'removed')],
  ];

  for (const [heading, group] of sections) {
    if (group.length === 0) continue;
    out.push('');
    out.push(`**${heading}**`);
    out.push('');
    for (const change of group.slice(0, MAX_LISTED)) {
      out.push(renderChange(change));
    }
    const hidden = group.length - Math.min(group.length, MAX_LISTED);
    if (hidden > 0) out.push(`- …and ${hidden} more`);
  }

  if (unchanged > 0) {
    out.push('');
    out.push(
      `<sub>${unchanged} other ${plural(unchanged, 'behaviour', 'behaviours')} unchanged. Read locally with \`npx what-it-does\`.</sub>`,
    );
  }

  return out.join('\n');
}
