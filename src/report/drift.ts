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
 *
 * The primitive here is snapshot-against-snapshot. That matters beyond tidiness:
 * a snapshot is JSON, so two of them can come from anywhere — two runs on one
 * machine, or two branches scanned separately in CI and compared without either
 * side ever holding the other's source.
 */

import { CONSEQUENTIAL_EFFECTS, type Behaviour, type EffectKind } from '../model.js';

/**
 * A finding, flattened for storage.
 *
 * Kept as prose rather than a count because of what the diff is FOR. "One more
 * finding than last time" is a statistic; "this endpoint now deletes rows and
 * nothing checks who is asking" is the sentence someone acts on, and a number
 * cannot be turned back into it.
 */
export interface SnapshotGap {
  kind: string;
  summary: string;
  /** "app/api/x/route.ts:12" — flattened, since a snapshot is transport. */
  source: string;
}

export interface SnapshotBehaviour {
  id: string;
  title: string;
  /** Stable identity for an effect: "kind::description". */
  effects: string[];
  gaps: SnapshotGap[];
}

/** Snapshot kept between runs, and passed between CI jobs. */
export interface Snapshot {
  version: 2;
  scannedAt: string;
  behaviours: SnapshotBehaviour[];
}

export const SNAPSHOT_VERSION = 2;

export function snapshot(behaviours: Behaviour[]): Snapshot {
  return {
    version: 2,
    scannedAt: new Date().toISOString(),
    behaviours: behaviours.map((b) => ({
      id: b.id,
      title: b.title,
      effects: b.effects.map((e) => `${e.kind}::${e.description}`),
      gaps: b.gaps.map((g) => ({
        kind: g.kind,
        summary: g.summary,
        source: `${g.source.file}:${g.source.line}`,
      })),
    })),
  };
}

export interface Change {
  kind: 'added' | 'removed' | 'changed';
  /**
   * The behaviour's stable id. Carried so a renderer can tell a URL path from
   * a sentence — `route:DELETE /api/x` wants code font, `action:...` is prose
   * and looks wrong in it.
   */
  id: string;
  title: string;
  /** Effects present now that were not before. */
  gained: string[];
  /** Effects present before that are gone now. */
  lost: string[];
  gapDelta: number;
  /**
   * Findings that were not here last time. The actionable half of a change —
   * everything else is description, this is the part with a decision attached.
   */
  newGaps: SnapshotGap[];
}

export interface DriftResult {
  since: string;
  changes: Change[];
  /** Behaviours that did not move. Counted, not listed. */
  unchanged: number;
}

// ---------------------------------------------------------------------------
// Reading effect keys back
// ---------------------------------------------------------------------------

/** Turn "deletes-data::Deletes rows from `x`" back into something readable. */
export function describeEffectKey(key: string): string {
  const index = key.indexOf('::');
  return index === -1 ? key : key.slice(index + 2);
}

/** The kind half of an effect key, for callers that need to rank by consequence. */
export function effectKindOf(key: string): EffectKind | null {
  const index = key.indexOf('::');
  if (index === -1) return null;
  return key.slice(0, index) as EffectKind;
}

/** Deleting data, moving money, changing who has access. */
export function isConsequentialKey(key: string): boolean {
  const kind = effectKindOf(key);
  return kind !== null && CONSEQUENTIAL_EFFECTS.has(kind);
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
  version: 2;
  scans: Snapshot[];
}

export function appendToHistory(history: History | null, current: Snapshot): History {
  const scans = [...(history?.scans ?? []), current];
  // Oldest first, so pruning takes from the front and the timeline reads
  // left-to-right in time order without any further sorting.
  return { version: 2, scans: scans.slice(-HISTORY_LIMIT) };
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

    const result = previous
      ? diffSnapshots(previous, scan)
      : { since: scan.scannedAt, changes: [], unchanged: scan.behaviours.length };

    return {
      scannedAt: scan.scannedAt,
      behaviours: scan.behaviours.length,
      effects: scan.behaviours.reduce((n, b) => n + b.effects.length, 0),
      gaps: scan.behaviours.reduce((n, b) => n + b.gaps.length, 0),
      changes: result.changes,
      unchanged: result.unchanged,
    };
  });

  return { points };
}

// ---------------------------------------------------------------------------
// The diff
// ---------------------------------------------------------------------------

/**
 * A finding's identity, for deciding whether it is NEW.
 *
 * Deliberately excludes the line number. Code moves down a file constantly, and
 * a finding that reappears two lines lower is the same finding — reporting it
 * as new on every unrelated edit above it is how a bot gets muted.
 */
const gapKey = (gap: SnapshotGap) => `${gap.kind}::${gap.summary}`;

/** The primitive. Both sides are plain data, so neither needs the other's source. */
export function diffSnapshots(previous: Snapshot, current: Snapshot): DriftResult {
  const before = new Map(previous.behaviours.map((b) => [b.id, b]));
  const after = new Map(current.behaviours.map((b) => [b.id, b]));
  const changes: Change[] = [];
  let unchanged = 0;

  for (const [id, now] of after) {
    const then = before.get(id);

    if (!then) {
      changes.push({
        kind: 'added',
        id,
        title: now.title,
        gained: now.effects.map(describeEffectKey),
        lost: [],
        gapDelta: now.gaps.length,
        // Everything a new behaviour reports is new by definition.
        newGaps: now.gaps,
      });
      continue;
    }

    const nowKeys = new Set(now.effects);
    const thenKeys = new Set(then.effects);

    const gained = [...nowKeys].filter((k) => !thenKeys.has(k)).map(describeEffectKey);
    const lost = [...thenKeys].filter((k) => !nowKeys.has(k)).map(describeEffectKey);
    const gapDelta = now.gaps.length - then.gaps.length;

    const knownGaps = new Set(then.gaps.map(gapKey));
    const newGaps = now.gaps.filter((g) => !knownGaps.has(gapKey(g)));

    if (gained.length === 0 && lost.length === 0 && gapDelta === 0 && newGaps.length === 0) {
      unchanged++;
      continue;
    }

    changes.push({ kind: 'changed', id, title: now.title, gained, lost, gapDelta, newGaps });
  }

  for (const [id, then] of before) {
    if (after.has(id)) continue;
    changes.push({
      kind: 'removed',
      id,
      title: then.title,
      gained: [],
      lost: then.effects.map(describeEffectKey),
      gapDelta: -then.gaps.length,
      // A behaviour that is gone cannot have a new problem.
      newGaps: [],
    });
  }

  /**
   * Losing an effect ranks above gaining one. A behaviour that STOPPED doing
   * something is how silent breakage shows up — the email that no longer sends
   * is worse news than the read that got added, and it is the case people
   * cannot otherwise detect.
   */
  const weight = (c: Change) =>
    (c.newGaps.length > 0 ? 200 : 0) +
    (c.gapDelta > 0 ? 100 : 0) +
    c.lost.length * 10 +
    (c.kind === 'removed' ? 50 : 0) +
    c.gained.length;
  changes.sort((a, b) => weight(b) - weight(a));

  return { since: previous.scannedAt, changes, unchanged };
}

/** Convenience for the local path, where the current side is still in memory. */
export function diff(previous: Snapshot, current: Behaviour[]): DriftResult {
  return diffSnapshots(previous, snapshot(current));
}
