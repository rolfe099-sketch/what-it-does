/**
 * Entry-point detection.
 *
 * Route handlers are exported in at least four shapes in the wild. A naive
 * implementation catches two, and the two it misses are silent: the route simply
 * never appears, and nothing tells you it is missing. Each shape here caused a
 * real miss on a real codebase before it was fixed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from './helpers.js';
import { matcherToRegExp, middlewareCovers } from '../src/extract/nextjs/middleware.js';
import { urlPathFromDir } from '../src/extract/nextjs/entrypoints.js';

describe('route export shapes', () => {
  const { triggers } = scan('exports');
  const routes = triggers.filter((t) => t.kind === 'api-route');
  const at = (urlPath: string) => routes.find((r) => r.urlPath === urlPath);

  test('export async function GET()', () => {
    assert.deepEqual(at('/api/a')?.methods, ['GET']);
  });

  test('export const POST = wrapper(handler)', () => {
    assert.deepEqual(at('/api/b')?.methods, ['POST']);
  });

  test('export { handler as PUT, handler as DELETE }', () => {
    const methods = at('/api/c')?.methods ?? [];
    assert.deepEqual([...methods].sort(), ['DELETE', 'PUT']);
  });

  test('export const { PATCH } = factory()', () => {
    assert.deepEqual(at('/api/d')?.methods, ['PATCH']);
  });

  test('export * from elsewhere is reported as OUR limitation, not opaque code', () => {
    const { skipped } = scan('exports');
    const wildcard = skipped.find((u) => u.source.file.includes('api/e'));
    assert.ok(wildcard, 'the wildcard re-export should be reported, not silently dropped');
    assert.equal(
      wildcard.reason,
      'unsupported',
      'it is resolvable — we just do not follow modules yet — so it must not be labelled "dynamic"',
    );
  });
});

describe('url derivation', () => {
  test('route groups are stripped', () => {
    assert.equal(urlPathFromDir('(marketing)/nested'), '/nested');
  });

  test('dynamic segments are kept', () => {
    assert.equal(urlPathFromDir('blog/[slug]'), '/blog/[slug]');
  });

  test('parallel routes are stripped', () => {
    assert.equal(urlPathFromDir('@modal/photo'), '/photo');
  });

  test('the app root is /', () => {
    assert.equal(urlPathFromDir(''), '/');
  });

  test('private folders are excluded from routing', () => {
    const { triggers } = scan('exports');
    const pages = triggers.filter((t) => t.kind === 'page').map((t) => t.urlPath);
    assert.ok(
      !pages.some((p) => p.includes('_private')),
      'an underscore-prefixed folder is not a route',
    );
    assert.ok(pages.includes('/nested/[id]'), 'route group stripped, dynamic segment kept');
  });
});

describe('middleware matchers', () => {
  test('the negative-lookahead form Next.js templates ship with compiles', () => {
    const re = matcherToRegExp('/((?!api/|_next/).*)');
    assert.ok(re);
    assert.ok(re.test('/dashboard'));
    assert.ok(!re.test('/api/users'));
  });

  test('path-to-regexp wildcards compile', () => {
    const re = matcherToRegExp('/dashboard/:path*');
    assert.ok(re);
    assert.ok(re.test('/dashboard'));
    assert.ok(re.test('/dashboard/settings/deep'));
    assert.ok(!re.test('/other'));
  });

  test('coverage is decided per route, not per project', () => {
    const { middleware } = scan('exports');
    assert.equal(middleware.present, true);
    assert.equal(middlewareCovers(middleware, '/api/b'), false, 'api/ is excluded by the matcher');
    assert.equal(middlewareCovers(middleware, '/nested/[id]'), true, 'pages are covered');
  });

  test('middleware with no matcher runs everywhere', () => {
    assert.equal(middlewareCovers({ present: true, matchers: null }, '/anything'), true);
  });

  test('no middleware covers nothing', () => {
    assert.equal(middlewareCovers({ present: false, matchers: [] }, '/anything'), false);
  });
});
