/**
 * Control flow: real steps, and guards recognised by shape.
 *
 * The pair of tests that matter most are the last two. A guard shape on its own
 * is not authorisation — input validation has exactly the same shape — and
 * conflating them would silence real findings across every codebase at once.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from './helpers.js';
import type { Behaviour } from '../src/model.js';

const at = (behaviours: Behaviour[], file: string) =>
  behaviours.find((b) => b.trigger.source.file.includes(file));

describe('steps are real control flow, not sorted effects', () => {
  const { behaviours } = scan('exports');

  test('a behaviour carries ordered steps from its own body', () => {
    const f = at(behaviours, 'api/f');
    assert.ok(f, 'the fixture route should be found');
    assert.ok(f.steps.length >= 3, 'expected several statements');
  });

  test('steps run in source order, top to bottom', () => {
    const f = at(behaviours, 'api/f')!;
    const lines = f.steps.map((s) => s.source.line);
    assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
  });

  test('the sequence reads as a narrative', () => {
    const f = at(behaviours, 'api/f')!;
    assert.deepEqual(
      f.steps.map((s) => s.kind),
      ['gets', 'guard', 'does', 'responds'],
    );
  });

  test('a guard says what happens when its check fails', () => {
    const guard = at(behaviours, 'api/f')!.steps.find((s) => s.kind === 'guard');
    assert.ok(guard, 'the inline check should be recognised as a guard');
    assert.match(
      guard.otherwise ?? '',
      /401/,
      'a refusal status is worth digging out — "returns" alone says nothing about permission',
    );
  });
});

describe('guards are recognised by shape, not by name', () => {
  const { behaviours } = scan('exports');

  test('an inline guard calling a function no heuristic would match is still found', () => {
    // getSessionSomehow() matches none of the withAuth/verify*/require* patterns.
    // Before shape detection this endpoint was reported as unprotected.
    const f = at(behaviours, 'api/f')!;
    assert.ok(f.effects.some((e) => e.isAuthCheck));
    assert.equal(f.gaps.length, 0, 'it deletes rows, but the check is right there');
  });

  test('INPUT VALIDATION is not mistaken for authorisation', () => {
    // api/g has an identical early-exit shape, but the condition is about the
    // request body rather than about who is asking. Treating every early exit
    // as auth would silence findings everywhere.
    const g = at(behaviours, 'api/g')!;
    assert.equal(g.effects.some((e) => e.isAuthCheck), false);
    assert.ok(
      g.gaps.some((gap) => gap.kind === 'unprotected-destructive'),
      'a 400 on a missing field says nothing about permission',
    );
  });

  test('the shape signal is a fallback, so a known guard is not reported twice', () => {
    const b = at(behaviours, 'api/b')!;
    const authChecks = b.effects.filter((e) => e.isAuthCheck);
    assert.ok(authChecks.length >= 1);
    assert.ok(
      !authChecks.some((e) => e.description.includes('then stops if the answer is wrong')),
      'the shape fallback should stay quiet when a real auth API was already found',
    );
  });
});
