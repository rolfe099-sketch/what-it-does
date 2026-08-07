/**
 * Drift — what moved between two scans.
 *
 * This is the part a chat window structurally cannot do. Asking a model what
 * your code does is a point-in-time answer; knowing that your password reset
 * stopped sending an email at some point in the last three weeks requires
 * having watched. The archive is the product.
 *
 * The diff is expressed in BEHAVIOUR language, never file language. "Your
 * password reset no longer sends an email" is the finding. "utils/auth.ts
 * changed" is what git already told you and is not worth a tool.
 */

import type { Behaviour } from '../model.js';

/** Snapshot kept between runs. Deliberately small — this file is committed by
 *  nobody and read by us, so it stores only what a diff needs. */
export interface Snapshot {
  version: 1;
  scannedAt: string;
  behaviours: {
    id: string;
    title: string;
    /** Stable identity for an effect: kind + description. */
    effects: string[];
    gaps: number;
  }[];
}

export function snapshot(behaviours: Behaviour[]): Snapshot {
  return {
    version: 1,
    scannedAt: new Date().toISOString(),
    behaviours: behaviours.map((b) => ({
      id: b.id,
      title: b.title,
      effects: b.effects.map((e) => `${e.kind}::${e.description}`),
      gaps: b.gaps.length,
    })),
  };
}

export interface Change {
  kind: 'added' | 'removed' | 'changed';
  title: string;
  /** Effects present now that were not before. */
  gained: string[];
  /** Effects present before that are gone now. */
  lost: string[];
  gapDelta: number;
}

export interface DriftResult {
  since: string;
  changes: Change[];
  /** Behaviours that did not move. Counted, not listed. */
  unchanged: number;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * How many scans to keep.
 *
 * Enough to show a shape — a fortnight of daily scans, or a couple of months of
 * weekly ones — without the file growing without limit. Snapshots of a large
 * project are not small, and a history file that quietly reaches a hundred
 * megabytes is a bug nobody notices until it is a problem.
 */
export const HISTORY_LIMIT = 20;

export interface History {
  version: 1;
  scans: Snapshot[];
}

export function appendToHistory(history: History | null, current: Snapshot): History {
  const scans = [...(history?.scans ?? []), current];
  // Oldest first, so pruning takes from the front and the timeline reads
  // left-to-right in time order without any further sorting.
  return { version: 1, scans: scans.slice(-HISTORY_LIMIT) };
}

/** One position on the timeline: the state then, and what moved to get there. */
export interface TimelinePoint {
  scannedAt: string;
  behaviours: number;
  effects: number;
  gaps: number;
  /** Empty for the first scan — there was nothing to compare it against. */
  changes: Change[];
  unchanged: number;
}

export interface Timeline {
  points: TimelinePoint[];
}

/**
 * Build the timeline from a history.
 *
 * Diffs are computed HERE, at build time, and only the results travel into the
 * report. Embedding twenty raw snapshots of a large project would add megabytes
 * to a file whose whole appeal is that you can email it.
 */
export function buildTimeline(history: History): Timeline {
  const points: TimelinePoint[] = history.scans.map((scan, index) => {
    const previous = index > 0 ? history.scans[index - 1] : null;

    // diff() expects live Behaviours for the "current" side; a snapshot carries
    // everything it actually reads, so a light adapter avoids re-scanning.
    const asBehaviours = scan.behaviours.map((b) => ({
      id: b.id,
      title: b.title,
      effects: b.effects.map((key) => {
        const at = key.indexOf('::');
        return {
          kind: (at === -1 ? 'reads-data' : key.slice(0, at)) as never,
          description: at === -1 ? key : key.slice(at + 2),
          source: { file: '', line: 0 },
          confidence: 'certain' as const,
        };
      }),
      gaps: Array.from({ length: b.gaps }),
    }));

    const result = previous
      ? diff(previous, asBehaviours as never)
      : { since: scan.scannedAt, changes: [], unchanged: scan.behaviours.length };

    return {
      scannedAt: scan.scannedAt,
      behaviours: scan.behaviours.length,
      effects: scan.behaviours.reduce((n, b) => n + b.effects.length, 0),
      gaps: scan.behaviours.reduce((n, b) => n + b.gaps, 0),
      changes: result.changes,
      unchanged: result.unchanged,
    };
  });

  return { points };
}

/** Turn "deletes-data::Deletes rows from `x`" back into something readable. */
export function describeEffectKey(key: string): string {
  const index = key.indexOf('::');
  return index === -1 ? key : key.slice(index + 2);
}

export function diff(previous: Snapshot, current: Behaviour[]): DriftResult {
  const before = new Map(previous.behaviours.map((b) => [b.id, b]));
  const after = new Map(current.map((b) => [b.id, b]));
  const changes: Change[] = [];
  let unchanged = 0;

  for (const [id, now] of after) {
    const then = before.get(id);

    if (!then) {
      changes.push({
        kind: 'added',
        title: now.title,
        gained: now.effects.map((e) => e.description),
        lost: [],
        gapDelta: now.gaps.length,
      });
      continue;
    }

    const nowKeys = new Set(now.effects.map((e) => `${e.kind}::${e.description}`));
    const thenKeys = new Set(then.effects);

    const gained = [...nowKeys].filter((k) => !thenKeys.has(k)).map(describeEffectKey);
    const lost = [...thenKeys].filter((k) => !nowKeys.has(k)).map(describeEffectKey);
    const gapDelta = now.gaps.length - then.gaps;

    if (gained.length === 0 && lost.length === 0 && gapDelta === 0) {
      unchanged++;
      continue;
    }

    changes.push({ kind: 'changed', title: now.title, gained, lost, gapDelta });
  }

  for (const [id, then] of before) {
    if (after.has(id)) continue;
    changes.push({
      kind: 'removed',
      title: then.title,
      gained: [],
      lost: then.effects.map(describeEffectKey),
      gapDelta: -then.gaps,
    });
  }

  /**
   * Losing an effect ranks above gaining one. A behaviour that STOPPED doing
   * something is how silent breakage shows up — the email that no longer sends
   * is worse news than the read that got added, and it is the case people
   * cannot otherwise detect.
   */
  const weight = (c: Change) =>
    (c.gapDelta > 0 ? 100 : 0) + c.lost.length * 10 + (c.kind === 'removed' ? 50 : 0) + c.gained.length;
  changes.sort((a, b) => weight(b) - weight(a));

  return { since: previous.scannedAt, changes, unchanged };
}
