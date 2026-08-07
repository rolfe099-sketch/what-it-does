/**
 * The sample application, and the bugs it caught on its first run.
 *
 * `examples/tidepool` is a fictional SaaS written to be scanned — it is the
 * hosted demo, so what it reports is the first thing most people will ever see
 * this tool say. That makes it worth a test: a demo that quietly rots into
 * saying something wrong is worse than no demo.
 *
 * Two of these lock down real bugs the example exposed before it was published.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFramework } from '../src/extract/detect.js';
import { buildBehaviours } from '../src/extract/behaviours.js';
import { createResolver } from '../src/extract/resolve.js';
import type { Behaviour } from '../src/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.join(here, '..', 'examples', 'tidepool');

function scanExample() {
  const detected = detectFramework(EXAMPLE);
  if (!detected.supported) throw new Error('the example should be a readable project');
  const { behaviours } = buildBehaviours(
    EXAMPLE,
    detected.scan.triggers,
    detected.scan.middleware,
  );
  return behaviours;
}

const find = (behaviours: Behaviour[], title: string) => behaviours.find((b) => b.title === title);

describe('the sample application reports what it was built to report', () => {
  const behaviours = scanExample();

  test('it produces exactly the five intended findings', () => {
    // Pinned deliberately. If a change to the analysis adds a sixth, that is
    // either a new true finding worth adding to the example on purpose, or a
    // regression — and either way somebody should have to look at it.
    const flagged = behaviours
      .filter((b) => b.gaps.length > 0)
      .map((b) => b.title)
      .sort();

    assert.deepEqual(flagged, [
      'A form calls sendOnboardingEmail()',
      'DELETE /api/admin/users/[id]',
      'DELETE /api/keys',
      'DELETE /api/projects/[id]',
      'POST /api/billing/checkout',
    ]);
  });

  test('the guard on the read does not vouch for the delete beside it', () => {
    // GET checks membership; DELETE in the same file never got the check. One
    // behaviour per handler is what makes this visible at all.
    assert.equal(find(behaviours, 'GET /api/projects/[id]')?.gaps.length, 0);
    assert.ok(find(behaviours, 'DELETE /api/projects/[id]')?.gaps.length);
  });

  test('a route the middleware matcher misses is the stronger claim', () => {
    // The matcher covers /admin/:path* and not /api/admin/:path*. Saying so is
    // the difference between "check this" and "nothing is checking upstream".
    const admin = find(behaviours, 'DELETE /api/admin/users/[id]');
    assert.equal(admin?.gaps[0].confidence, 'likely');
    assert.match(admin!.gaps[0].detail, /matcher does NOT cover this path/);
  });

  test('correct code stays silent', () => {
    // Most of the example is right, and a demo where everything is broken
    // teaches nothing about what a finding means.
    for (const title of [
      'DELETE /api/tasks/[id]', // guarded by requireMember through a barrel
      'POST /api/webhooks/stripe', // signature verification IS the check
      'A form calls deleteWorkspace()', // checks membership and role
      'POST /api/invite',
    ]) {
      assert.equal(find(behaviours, title)?.gaps.length, 0, `${title} should not be flagged`);
    }
  });

  test('the graph is rich enough to be worth drawing', () => {
    // The demo exists to show the spatial views. If the example thins out to a
    // handful of nodes they stop demonstrating anything.
    const resources = new Set(
      behaviours.flatMap((b) => b.effects.map((e) => e.resource?.name).filter(Boolean)),
    );
    assert.ok(resources.size >= 10, `expected a dozen-ish resources, got ${resources.size}`);
    assert.ok(behaviours.length >= 20);
  });
});

describe('a root alias is project code, never a package', () => {
  // Found by the example: with no tsconfig, `@/lib/auth` fell through to
  // "third-party", so every guard behind it was skipped as somebody else's
  // library — and four correctly-protected routes drew confident findings.
  const resolver = createResolver(EXAMPLE);

  test('a scoped package is still a package', () => {
    assert.equal(resolver.resolve('app/page.tsx', '@supabase/supabase-js'), 'third-party');
    assert.equal(resolver.resolve('app/page.tsx', 'stripe'), 'third-party');
    assert.equal(resolver.resolve('app/page.tsx', 'node:fs'), 'third-party');
  });

  test('an alias that resolves gives the file', () => {
    assert.equal(resolver.resolve('app/page.tsx', '@/lib/db'), 'lib/db.ts');
  });

  test('an alias that does NOT resolve is our failure, not a package', () => {
    // An npm scope cannot be empty, so `@/` can only ever be an alias.
    // Reporting null makes it an honest unknown instead of silence.
    assert.equal(resolver.resolve('app/page.tsx', '@/lib/nothing-here'), null);

    const bare = createResolver(path.join(here, 'fixtures', 'unsupported'));
    assert.equal(bare.resolve('src/server.js', '@/lib/auth'), null);
    assert.equal(bare.resolve('src/server.js', '~/lib/auth'), null);
    assert.equal(bare.resolve('src/server.js', '#internal/auth'), null);
  });
});

describe('the example stays honest about what it is', () => {
  test('it says in writing that it is not a real product', () => {
    const readme = fs.readFileSync(path.join(EXAMPLE, 'README.md'), 'utf8');
    assert.match(readme, /not a real product/i);
    assert.match(readme, /fictional/i);
  });
});
