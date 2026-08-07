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
import { detectFramework } from '../src/extract/detect.js';
import { buildBehaviours } from '../src/extract/behaviours.js';
import { buildResourceGraph } from '../src/extract/graph.js';
import type { Behaviour } from '../src/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const fixture = (name: string) => path.join(here, 'fixtures', name);

/**
 * Goes through the same framework router the CLI does, so a fixture is named by
 * directory and never by framework. Which framework a fixture is written in is
 * then a property of the fixture, not something a test has to know — and adding
 * a third framework does not touch a single existing test.
 */
export function scan(name: string) {
  const root = fixture(name);
  const detected = detectFramework(root);
  if (!detected.supported) {
    throw new Error(`fixture "${name}" was not recognised by any extractor`);
  }
  const { framework, where, triggers, skipped, middleware } = detected.scan;
  const { behaviours } = buildBehaviours(root, triggers, middleware);
  const graph = buildResourceGraph(behaviours);
  return { root, framework, where, triggers, skipped, middleware, behaviours, graph };
}

/** Find a behaviour by its rendered title, for readable assertions. */
export const byTitle = (behaviours: Behaviour[], text: string): Behaviour | undefined =>
  behaviours.find((b) => b.title.includes(text));

export const effectDescriptions = (b: Behaviour | undefined) =>
  (b?.effects ?? []).map((e) => e.description);
