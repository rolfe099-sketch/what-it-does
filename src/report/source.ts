/**
 * Reading the actual source lines behind a step.
 *
 * A walkthrough that only names what happens is a list. Showing the code beside
 * each step is what makes it a walkthrough — and for someone who cannot read
 * code, seeing three lines in context next to a plain-language sentence is how
 * they start to.
 *
 * NOTE ON SHARING: this embeds fragments of the scanned source into the report.
 * That is harmless on your own machine and is the point of the feature, but a
 * report is a shareable file, so the footer says so plainly and `--no-code`
 * turns it off.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Snippet {
  /** 1-indexed line number of the first line returned. */
  startLine: number;
  lines: string[];
  /** Which line in `lines` is the one the effect points at (0-indexed). */
  hitIndex: number;
}

const CONTEXT = 2;
/** Longer than this and it is a minified bundle, not something to read. */
const MAX_LINE = 200;

export class SourceReader {
  private cache = new Map<string, string[] | null>();

  constructor(private root: string) {}

  private lines(repoPath: string): string[] | null {
    const hit = this.cache.get(repoPath);
    if (hit !== undefined) return hit;
    try {
      const full = path.join(this.root, ...repoPath.split('/'));
      const text = fs.readFileSync(full, 'utf8');
      const split = text.split(/\r?\n/);
      this.cache.set(repoPath, split);
      return split;
    } catch {
      this.cache.set(repoPath, null);
      return null;
    }
  }

  /** A few lines around `line`, or null when the file cannot be read. */
  read(repoPath: string, line: number): Snippet | null {
    const all = this.lines(repoPath);
    if (!all) return null;

    const target = Math.max(1, Math.min(line, all.length));
    const start = Math.max(1, target - CONTEXT);
    const end = Math.min(all.length, target + CONTEXT);

    const lines = all.slice(start - 1, end).map((l) => {
      const trimmed = l.replace(/\t/g, '  ');
      return trimmed.length > MAX_LINE ? `${trimmed.slice(0, MAX_LINE)}…` : trimmed;
    });

    // A snippet of nothing but blank lines helps no one.
    if (lines.every((l) => l.trim() === '')) return null;

    return { startLine: start, lines, hitIndex: target - start };
  }
}

/**
 * Strip the common leading indentation so a deeply-nested snippet does not
 * render as a thin ribbon on the right-hand side of the box.
 */
export function dedent(lines: string[]): string[] {
  const indents = lines
    .filter((l) => l.trim() !== '')
    .map((l) => l.match(/^ */)?.[0].length ?? 0);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return common > 0 ? lines.map((l) => l.slice(common)) : lines;
}
