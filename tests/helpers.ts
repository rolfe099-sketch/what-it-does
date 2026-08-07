/**
 * Shared scan helper for the test suite.
 *
 * Tests run against real fixture projects on disk rather than mocked ASTs. Every
 * bug this suite guards against was a bug about REAL code — barrel files,
 * factory exports, guards named things nobody predicted. A mocked syntax tree
 * would have reproduced none of them, because in each case the mistake was
 * assuming code looks simpler than it does.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findEntryPoints, detectNextJs } from '../src/extract/nextjs/entrypoints.js';
import { buildBehaviours } from '../src/extract/behaviours.js';
import { buildResourceGraph } from '../src/extract/graph.js';
import type { Behaviour } from '../src/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const fixture = (name: string) => path.join(here, 'fixtures', name);

export function scan(name: string) {
  const root = fixture(name);
  const detected = detectNextJs(root);
  const { appDir, triggers, skipped, middleware } = findEntryPoints(root);
  const { behaviours } = buildBehaviours(root, triggers, middleware);
  const graph = buildResourceGraph(behaviours);
  return { root, detected, appDir, triggers, skipped, middleware, behaviours, graph };
}

/** Find a behaviour by its rendered title, for readable assertions. */
export const byTitle = (behaviours: Behaviour[], text: string): Behaviour | undefined =>
  behaviours.find((b) => b.title.includes(text));

export const effectDescriptions = (b: Behaviour | undefined) =>
  (b?.effects ?? []).map((e) => e.description);
