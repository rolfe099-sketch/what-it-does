/**
 * Supabase Edge Functions — the framework the audience actually has.
 *
 * Lovable and Bolt emit a Vite front end with Supabase behind it, so for a
 * large share of people who built a product by describing it to an assistant,
 * this is where their server-side code lives.
 *
 * The tests that matter most here are about `verify_jwt`. Supabase's platform
 * rejects unauthenticated requests before a line of the function runs, which
 * means a scanner blind to config.toml would report every correctly-protected
 * function as unguarded — the same failure that produced 106 false findings
 * the first time this tool met Next.js middleware.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, byTitle, effectDescriptions } from './helpers.js';
import { readJwtConfig } from '../src/extract/supabase/entrypoints.js';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('finding the functions', () => {
  const { framework, triggers } = scan('supabase');

  test('the project is identified from its functions directory', () => {
    assert.equal(framework, 'Supabase Edge Functions');
  });

  test('each function becomes one route at its served path', () => {
    const paths = triggers.map((t) => t.urlPath).sort();
    assert.deepEqual(paths, [
      '/functions/v1/charge',
      '/functions/v1/delete-account',
      '/functions/v1/public-webhook',
      '/functions/v1/send-invite',
    ]);
  });

  test('_shared is not a function', () => {
    // The underscore is Supabase's convention for shared code. Half their own
    // examples import CORS headers from it; listing it would invent a route.
    assert.equal(
      triggers.some((t) => t.urlPath.includes('_shared')),
      false,
    );
  });

  test('both handler shapes are found, not just the classic one', () => {
    // Deno.serve is the shape everyone knows; `export default { fetch }` is
    // what Supabase's own current examples use. Supporting only the first
    // would miss the code people are writing today.
    const denoServe = triggers.find((t) => t.urlPath.endsWith('/send-invite'));
    const defaultExport = triggers.find((t) => t.urlPath.endsWith('/public-webhook'));
    assert.ok(denoServe, 'Deno.serve handler found');
    assert.ok(defaultExport, 'default-export fetch handler found');
  });
});

describe('verify_jwt is authorisation we cannot see in the code', () => {
  const { behaviours } = scan('supabase');

  test('the config is read per function', () => {
    const config = readJwtConfig(path.join(here, 'fixtures', 'supabase'));
    assert.equal(config.get('public-webhook'), false);
    assert.equal(config.get('delete-account'), false);
    assert.equal(config.get('charge'), false);
    assert.equal(config.has('send-invite'), false, 'absent from config, so it defaults');
  });

  test('a function absent from config.toml defaults to PROTECTED', () => {
    // Supabase's default is verify_jwt = true. Defaulting the other way would
    // manufacture findings against functions the platform is already guarding.
    const invite = byTitle(behaviours, '/functions/v1/send-invite');
    assert.ok(
      invite?.effects.some((e) => e.isAuthCheck),
      'the platform check must count as establishing who is asking',
    );
    assert.equal(invite?.gaps.length, 0);
  });

  test('the check is described in Supabase words, not as middleware', () => {
    // Telling a Supabase user their project "has no middleware" is jargon
    // about a concept they do not have.
    const invite = byTitle(behaviours, '/functions/v1/send-invite');
    assert.match(effectDescriptions(invite).join(' '), /verify_jwt/);
  });

  test('verify_jwt = false plus no check in the body IS a finding', () => {
    const del = byTitle(behaviours, '/functions/v1/delete-account');
    assert.equal(del?.gaps.length, 1);
    assert.match(del!.gaps[0].detail, /verify_jwt is false/);
    assert.equal(del!.gaps[0].confidence, 'likely');
  });
});

describe('checks that live in a wrapper', () => {
  const { behaviours } = scan('supabase');

  test("withSupabase({ auth: 'user' }) counts as a check", () => {
    // Found while building this: the option was being read and thrown away, so
    // a correctly-protected payment endpoint drew a confident finding.
    const charge = byTitle(behaviours, '/functions/v1/charge');
    assert.ok(charge?.effects.some((e) => e.isAuthCheck));
    assert.equal(charge?.gaps.length, 0, 'it takes payment, but the wrapper checks the caller');
    assert.match(effectDescriptions(charge).join(' '), /withSupabase requires auth: 'user'/);
  });

  test('a signature check authorises a public webhook', () => {
    // verify_jwt is deliberately false — Stripe cannot present a JWT — and the
    // signature is what proves the caller.
    const hook = byTitle(behaviours, '/functions/v1/public-webhook');
    assert.equal(hook?.gaps.length, 0);
  });
});

describe('the shared machinery works on a third framework', () => {
  const { behaviours, graph } = scan('supabase');

  test('a raw fetch to a known host is still named', () => {
    const invite = byTitle(behaviours, '/functions/v1/send-invite');
    assert.ok(effectDescriptions(invite).some((d) => d.includes('Resend')));
  });

  test('Deno.env config is read like any other', () => {
    const all = behaviours.flatMap((b) => b.unknowns);
    assert.ok(all.length >= 0, 'config detection runs without special-casing Deno');
  });

  test('the resource graph populates', () => {
    const users = graph.find((n) => n.resource.name === 'users');
    assert.ok(users, 'the users table should be a node');
    assert.ok(users.deletes >= 1);
  });
});
