/**
 * Drift, and the pull request comment built on it.
 *
 * These lock down the machine-readable half — the part a CI job depends on and
 * therefore the part that must not shift under it. The comment assertions are
 * about editorial judgement as much as correctness: a bot comment is read in
 * about four seconds, and every rule here exists because breaking it is how a
 * bot gets muted.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from './helpers.js';
import {
  snapshot,
  diffSnapshots,
  buildTimeline,
  appendToHistory,
  isConsequentialKey,
  SNAPSHOT_VERSION,
  type Snapshot,
} from '../src/report/drift.js';
import { renderComment, worthCommenting } from '../src/report/comment.js';

/** A snapshot with one behaviour, for diffs that need an exact shape. */
const only = (behaviour: Snapshot['behaviours'][number]): Snapshot => ({
  version: 2,
  scannedAt: '2026-01-01T00:00:00.000Z',
  behaviours: [behaviour],
});

const route = (over: Partial<Snapshot['behaviours'][number]> = {}) => ({
  id: 'route:DELETE /api/things',
  title: 'DELETE /api/things',
  effects: ['deletes-data::Deletes rows from `things`'],
  gaps: [],
  ...over,
});

describe('a snapshot is transport, not just storage', () => {
  const { behaviours } = scan('gapdemo');
  const snap = snapshot(behaviours);

  test('it round-trips through JSON unchanged', () => {
    // The whole CI story is "write it in one job, read it in another". If a
    // snapshot cannot survive a file, none of it works.
    const copy = JSON.parse(JSON.stringify(snap)) as Snapshot;
    assert.deepEqual(copy, snap);
    assert.equal(copy.version, SNAPSHOT_VERSION);
  });

  test('findings are carried as prose, not as a count', () => {
    // A number cannot be turned back into a sentence, and the sentence is the
    // only part anyone acts on.
    const withGap = snap.behaviours.find((b) => b.gaps.length > 0);
    assert.ok(withGap, 'the fixture has findings');
    assert.ok(withGap.gaps[0].summary.length > 20);
    assert.match(withGap.gaps[0].source, /.+:\d+$/, 'and where to look');
  });

  test('comparing a snapshot with itself finds nothing', () => {
    const result = diffSnapshots(snap, snap);
    assert.equal(result.changes.length, 0);
    assert.equal(result.unchanged, behaviours.length);
  });
});

describe('the diff', () => {
  test('a new behaviour brings its findings with it', () => {
    const before: Snapshot = { version: 2, scannedAt: 'x', behaviours: [] };
    const after = only(
      route({ gaps: [{ kind: 'unprotected-destructive', summary: 'Deletes rows', source: 'a.ts:1' }] }),
    );
    const [change] = diffSnapshots(before, after).changes;
    assert.equal(change.kind, 'added');
    assert.equal(change.newGaps.length, 1);
  });

  test('a finding that merely moved down the file is NOT new', () => {
    // Code shifts constantly. Re-reporting an old finding because an unrelated
    // edit pushed it two lines down is precisely how a bot trains people to
    // ignore it, so the identity of a finding excludes its line number.
    const gap = { kind: 'unprotected-destructive', summary: 'Deletes rows', source: 'a.ts:12' };
    const before = only(route({ gaps: [gap] }));
    const after = only(route({ gaps: [{ ...gap, source: 'a.ts:48' }] }));

    const result = diffSnapshots(before, after);
    assert.equal(result.changes.length, 0, 'nothing changed that anyone should hear about');
    assert.equal(result.unchanged, 1);
  });

  test('a behaviour that stopped doing something is reported', () => {
    const before = only(route({ effects: ['sends-email::Sends an email through Resend'] }));
    const after = only(route({ effects: [] }));
    const [change] = diffSnapshots(before, after).changes;
    assert.deepEqual(change.lost, ['Sends an email through Resend']);
  });

  test('new findings outrank everything else in the ordering', () => {
    const before: Snapshot = {
      version: 2,
      scannedAt: 'x',
      behaviours: [
        { id: 'route:GET /a', title: 'GET /a', effects: [], gaps: [] },
        { id: 'route:GET /b', title: 'GET /b', effects: ['reads-data::Reads rows'], gaps: [] },
      ],
    };
    const after: Snapshot = {
      version: 2,
      scannedAt: 'y',
      behaviours: [
        {
          id: 'route:GET /a',
          title: 'GET /a',
          effects: [],
          gaps: [{ kind: 'unprotected-destructive', summary: 'Deletes rows', source: 'a.ts:1' }],
        },
        { id: 'route:GET /b', title: 'GET /b', effects: [], gaps: [] },
      ],
    };
    const result = diffSnapshots(before, after);
    assert.equal(result.changes[0].title, 'GET /a', 'the one with a finding comes first');
  });

  test('the timeline is built from the same primitive', () => {
    // buildTimeline used to rebuild fake Behaviours out of a snapshot to feed a
    // Behaviour-shaped diff. One primitive, two callers, no adapter.
    const a = only(route());
    const b = only(route({ effects: [] }));
    const history = appendToHistory(appendToHistory(null, a), b);
    const timeline = buildTimeline(history);

    assert.equal(timeline.points.length, 2);
    assert.equal(timeline.points[0].changes.length, 0, 'nothing precedes the first scan');
    assert.equal(timeline.points[1].changes[0].lost.length, 1);
  });
});

describe('consequence survives the round trip', () => {
  test('an effect key still knows whether it is consequential', () => {
    assert.equal(isConsequentialKey('deletes-data::Deletes rows from `x`'), true);
    assert.equal(isConsequentialKey('takes-payment::Moves money'), true);
    assert.equal(isConsequentialKey('reads-data::Reads rows'), false);
    assert.equal(isConsequentialKey('malformed'), false, 'a key with no kind is not a crash');
  });
});

describe('the pull request comment', () => {
  const withFinding = () => {
    const before: Snapshot = { version: 2, scannedAt: 'x', behaviours: [] };
    const after = only(
      route({
        gaps: [
          {
            kind: 'unprotected-destructive',
            summary: 'Deletes rows from `things` — with no visible check on who is asking',
            source: 'app/api/things/route.ts:4',
          },
        ],
      }),
    );
    return diffSnapshots(before, after);
  };

  test('it stays silent when nothing moved', () => {
    // A bot that comments on every PR to say "no change" is a bot people turn
    // off, and then it is not there on the PR that mattered.
    const snap = only(route());
    assert.equal(worthCommenting(diffSnapshots(snap, snap)), false);
  });

  test('a finding leads, above everything else', () => {
    const markdown = renderComment(withFinding());
    const warningAt = markdown.indexOf('[!WARNING]');
    const addedAt = markdown.indexOf('**Added**');
    assert.ok(warningAt > -1, 'it uses a GitHub alert so it cannot be skimmed past');
    assert.ok(addedAt === -1 || warningAt < addedAt);
  });

  test('a behaviour is never listed twice', () => {
    // It appeared in the warning AND again under "Added" with its effect list.
    // Padding is what gets a comment collapsed unread.
    const markdown = renderComment(withFinding());
    const occurrences = markdown.split('DELETE /api/things').length - 1;
    assert.equal(occurrences, 1);
  });

  test('the finding says where to look', () => {
    assert.match(renderComment(withFinding()), /app\/api\/things\/route\.ts:4/);
  });

  test('a route is code, a sentence is not', () => {
    // "A form calls sendWelcomeEmail()" in code font reads as a mistake.
    const before: Snapshot = { version: 2, scannedAt: 'x', behaviours: [] };
    const after: Snapshot = {
      version: 2,
      scannedAt: 'y',
      behaviours: [
        { id: 'route:GET /api/x', title: 'GET /api/x', effects: [], gaps: [] },
        { id: 'action:app/a.ts#send', title: 'A form calls send()', effects: [], gaps: [] },
      ],
    };
    const markdown = renderComment(diffSnapshots(before, after));
    assert.match(markdown, /\*\*`GET \/api\/x`\*\*/);
    assert.match(markdown, /\*\*A form calls send\(\)\*\*/);
  });

  test('a title cannot inject markdown', () => {
    // Titles carry names from someone else's codebase. A route parameter next
    // to a bracket is link syntax, and a comment that renders as a broken link
    // because of it is avoidable.
    const before: Snapshot = { version: 2, scannedAt: 'x', behaviours: [] };
    const after = only({
      id: 'action:a.ts#x',
      title: 'A form calls [click](http://evil.example)',
      effects: [],
      gaps: [],
    });
    const markdown = renderComment(diffSnapshots(before, after));
    // Escaping the opening bracket is what defuses it: `\[click\](...)` renders
    // as the literal text rather than a link, so the URL stays inert.
    assert.match(markdown, /\\\[click\\\]/);
    assert.equal(markdown.includes('**A form calls [click]'), false);
  });

  test('it names what it was compared against', () => {
    assert.match(renderComment(withFinding(), { comparedTo: '`main`' }), /compared with `main`/);
  });

  test('a large diff is truncated rather than dumped', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `route:GET /api/r${i}`,
      title: `GET /api/r${i}`,
      effects: [],
      gaps: [],
    }));
    const markdown = renderComment(
      diffSnapshots({ version: 2, scannedAt: 'x', behaviours: [] }, { version: 2, scannedAt: 'y', behaviours: many }),
    );
    assert.match(markdown, /…and 30 more/);
  });
});
