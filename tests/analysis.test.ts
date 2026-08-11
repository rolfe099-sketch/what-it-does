/**
 * Effects, guards and findings.
 *
 * Every assertion here is a bug that shipped and was caught by hand. The first
 * run against a real production codebase produced 106 findings; all but a
 * handful were the tool being confidently wrong. These lock the fixes down.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scan, byTitle, effectDescriptions } from './helpers.js';

describe('effects name what they act on', () => {
  const { behaviours } = scan('exports');

  test('a table name is captured as structured data, not only prose', () => {
    const get = byTitle(behaviours, '/api/a');
    const read = get?.effects.find((e) => e.kind === 'reads-data' && e.resource);
    assert.equal(read?.resource?.kind, 'table');
    assert.equal(read?.resource?.name, 'widgets');
    assert.equal(read?.resource?.literal, true);
  });

  test('deletion is reported as deletion, not as the read that follows it', () => {
    const post = byTitle(behaviours, 'POST /api/b');
    assert.ok(
      effectDescriptions(post).some((d) => d.includes('Deletes rows from')),
      'the pattern table is ordered by consequence so .delete() wins over .select()',
    );
  });
});

describe('guard detection', () => {
  const { behaviours } = scan('exports');

  test('a guard imported through a BARREL file is still found', () => {
    // lib/auth/index.ts is `export * from './guard'` and contains no declarations.
    // Before re-export following, the trace stopped there and this endpoint was
    // reported as having no authorisation check at all.
    const post = byTitle(behaviours, 'POST /api/b');
    assert.ok(
      post?.effects.some((e) => e.isAuthCheck),
      'withGuard resolves through the barrel to the real getServerSession',
    );
  });

  test('a guard is recognised from its name when we cannot see inside it', () => {
    const post = byTitle(behaviours, 'POST /api/b');
    assert.ok(
      effectDescriptions(post).some((d) => d.includes('withGuard')),
      'the naming heuristic can only ever silence a warning, never invent one',
    );
  });
});

describe('findings do not fire on correct code', () => {
  test('a destructive endpoint behind a guard produces NO finding', () => {
    const { behaviours } = scan('exports');
    const post = byTitle(behaviours, 'POST /api/b');
    assert.equal(
      post?.gaps.length,
      0,
      'it deletes rows, but the guard was found — flagging it would be a false accusation',
    );
  });

  test('a destructive endpoint with no guard anywhere DOES produce a finding', () => {
    const { behaviours } = scan('gapdemo');
    const del = byTitle(behaviours, 'DELETE /api/projects/[id]');
    assert.ok(del, 'the fixture endpoint should be detected');
    assert.ok(
      del.gaps.some((g) => g.kind === 'unprotected-destructive'),
      'nothing establishes who is asking',
    );
  });

  test('every finding states what would make it a false alarm', () => {
    const { behaviours } = scan('gapdemo');
    for (const b of behaviours) {
      for (const gap of b.gaps) {
        assert.ok(
          gap.detail.length > 60,
          `gap on "${b.title}" must explain itself, not just accuse`,
        );
      }
    }
  });
});

describe('name promises are anchored to the leading verb', () => {
  const { behaviours } = scan('gapdemo');

  test('sendWelcomeEmail with no email sent is flagged', () => {
    const action = byTitle(behaviours, 'sendWelcomeEmail');
    assert.ok(
      action?.gaps.some((g) => g.kind === 'unfulfilled-promise'),
      'the name leads with a sending verb and nothing sends',
    );
  });

  test('a behaviour that fulfils its name is not flagged', () => {
    // deleteAccount deletes. The promise is kept, so there is nothing to say.
    const action = byTitle(behaviours, 'deleteAccount');
    assert.ok(
      !action?.gaps.some((g) => g.kind === 'unfulfilled-promise'),
      'deleteAccount does delete, so no promise is broken',
    );
  });

  test('promises apply to actions only, never to URL paths', () => {
    // A path names a resource and an action ambiguously. Reading a promise into
    // "/api/invoices/[id]" produced "does not move money" for a page that
    // displays an invoice.
    const { behaviours: all } = scan('exports');
    const routeGaps = all
      .filter((b) => b.trigger.kind === 'api-route')
      .flatMap((b) => b.gaps)
      .filter((g) => g.kind === 'unfulfilled-promise');
    assert.equal(routeGaps.length, 0);
  });
});

describe('config dependence is only reported when it decides something', () => {
  const { behaviours } = scan('gapdemo');

  test('branching on an env var is reported', () => {
    const billing = byTitle(behaviours, '/api/billing');
    assert.ok(
      billing?.unknowns.some(
        (u) => u.reason === 'config-dependent' && u.detail.includes('STRIPE_MODE'),
      ),
      'STRIPE_MODE is read inside a ternary, so it changes what the code does',
    );
  });

  test('the reason codes stay distinct', () => {
    // Collapsing these into a generic "unknown" throws away the only one that
    // matters: config-dependent means "may behave differently in production".
    const reasons = new Set(behaviours.flatMap((b) => b.unknowns.map((u) => u.reason)));
    for (const r of reasons) {
      assert.ok(
        ['third-party', 'dynamic', 'config-dependent', 'unsupported', 'parse-failed'].includes(r),
        `unexpected reason code: ${r}`,
      );
    }
  });
});

describe('the AI SDK is recognised', () => {
  // Found by scanning a real project: both of its API routes reported no
  // effects, when calling a language model was the whole point of the app.
  const { behaviours, graph } = scan('exports');

  test('streamText is an effect, not silence', () => {
    const h = behaviours.find((b) => b.trigger.source.file.includes('api/h'));
    assert.ok(h, 'the route should be detected');
    assert.ok(
      h.effects.some((e) => e.description.includes('language model')),
      'a route whose purpose is calling a model must not come back empty',
    );
  });

  test('the model is a dependency you can lose', () => {
    const model = graph.find((n) => n.resource.name === 'language model');
    assert.ok(model, 'it should appear in the dependency graph as a service');
    assert.equal(model.resource.kind, 'service');
  });

  test('the cost is stated, because that is the part that surprises people', () => {
    const h = behaviours.find((b) => b.trigger.source.file.includes('api/h'))!;
    const call = h.effects.find((e) => e.description.includes('language model'))!;
    assert.match(call.description, /costs money/);
  });
});

/**
 * Endpoints that are the front door.
 *
 * Found by scanning 284 public repositories and then reading what came back.
 * The unprotected-destructive rule fired 131 times across that corpus, and a
 * hand-check of a random sample turned up registration and OTP-send endpoints
 * reported as having "no visible check on who is asking". True, and useless:
 * those cannot be behind a check, because they are what a person uses before
 * they have an identity.
 *
 * Every application with users has a signup route, so the finding was drifting
 * toward "this app has users" — and under fail-on-new it would have broken a
 * customer's build over their registration handler.
 *
 * This never surfaced earlier because the precision work had only been done on
 * projects where nothing was reported at all. Zero findings is a perfect
 * false-positive rate that proves nothing. These three cases are the corpus
 * boiled down: two that must stay silent, one that must still fire.
 */
describe('an endpoint that is the authentication is not missing it', () => {
  test('a registration route is not reported', () => {
    const { behaviours } = scan('gapdemo');
    const register = behaviours.find((b) => b.trigger.source.file.includes('auth/register'));
    assert.ok(register, 'the registration fixture should be found');
    assert.equal(
      register!.gaps.some((g) => g.kind === 'unprotected-destructive'),
      false,
      'a signup endpoint cannot check who is asking — that is what it is for',
    );
  });

  test('a send-one-time-code route is not reported', () => {
    const { behaviours } = scan('gapdemo');
    const verify = behaviours.find((b) => b.trigger.source.file.includes('workflow/verify'));
    assert.ok(verify, 'the verify fixture should be found');
    assert.equal(
      verify!.gaps.some((g) => g.kind === 'unprotected-destructive'),
      false,
    );
  });

  /**
   * The control. Suppressing noise is only worth anything if the signal
   * survives it — a rule that reports nothing would pass both tests above.
   */
  test('a genuinely unguarded delete is still reported', () => {
    const { behaviours } = scan('gapdemo');
    const purge = behaviours.find((b) => b.trigger.source.file.includes('admin/purge'));
    assert.ok(purge, 'the purge fixture should be found');
    assert.ok(
      purge!.gaps.some((g) => g.kind === 'unprotected-destructive'),
      'an unguarded delete with no auth segment in its path must still fire',
    );
  });
});
