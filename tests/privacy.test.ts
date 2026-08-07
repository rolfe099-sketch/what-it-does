/**
 * What the report is allowed to know about the machine that made it.
 *
 * The report is the shareable artifact — its own footer invites you to send it
 * to someone. That makes anything it carries about the MACHINE rather than the
 * code a leak, and the worst of them is the scanned path: on Windows a project
 * usually lives under `C:\\Users\\<real name>\\`, so a shared report was
 * publishing the owner's name. Found on the hosted demo, where it read
 * `D:\\for fun\\examples\\tidepool`.
 *
 * The person who ran the scan already saw the path — the CLI prints it. The
 * file they hand to somebody else does not need it.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { detectFramework } from '../src/extract/detect.js';
import { buildBehaviours } from '../src/extract/behaviours.js';
import { renderReport } from '../src/report/render.js';
import { DEFAULT_DEPTH } from '../src/extract/trace.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function reportFor(fixture: string, includeCode: boolean): string {
  const root = path.join(here, 'fixtures', fixture);
  const detected = detectFramework(root);
  if (!detected.supported) throw new Error(`${fixture} should scan`);
  const { behaviours } = buildBehaviours(root, detected.scan.triggers, detected.scan.middleware);

  return renderReport({
    projectName: fixture,
    root,
    framework: detected.scan.framework,
    behaviours,
    skipped: detected.scan.skipped,
    middleware: detected.scan.middleware,
    elapsedMs: 42,
    scannedAt: new Date('2026-01-01T00:00:00Z'),
    traceDepth: DEFAULT_DEPTH,
    includeCode,
  });
}

describe('a report carries nothing about the machine that made it', () => {
  for (const includeCode of [true, false]) {
    const label = includeCode ? 'with source excerpts' : 'with --no-code';

    test(`no absolute filesystem path appears in the report, ${label}`, () => {
      const html = reportFor('gapdemo', includeCode);

      // Windows drive paths, and POSIX paths under the usual home roots.
      const absolute = [
        /[A-Za-z]:[\\/][^\s"'<>]{2,}/,
        /\/(?:home|Users|root)\/[^\s"'<>]{2,}/,
      ];
      for (const pattern of absolute) {
        const hit = html.match(pattern);
        assert.equal(hit, null, `report leaks an absolute path: ${hit?.[0]}`);
      }
    });

    test(`the scan root itself is absent, ${label}`, () => {
      const root = path.join(here, 'fixtures', 'gapdemo');
      const html = reportFor('gapdemo', includeCode);
      assert.equal(html.includes(root), false, 'the scanned directory must not be embedded');
      // Both separators, since the path is built with the platform's own.
      assert.equal(html.includes(root.split(path.sep).join('/')), false);
    });

    test(`no home directory or user name appears, ${label}`, () => {
      const html = reportFor('gapdemo', includeCode);
      const home = os.homedir();
      assert.equal(html.includes(home), false, 'the home directory must not appear');

      const user = path.basename(home);
      // Guarded: a fixture could legitimately contain a short common word that
      // happens to match a username. Only a distinctive one is worth asserting.
      if (user.length > 3) {
        assert.equal(html.includes(user), false, `the user name "${user}" must not appear`);
      }
    });
  }

  test('file references stay repo-relative, which is what makes them useful', () => {
    // Removing the absolute path must not cost the reader the ability to find
    // anything — every location in the report is still an address in their repo.
    const html = reportFor('gapdemo', true);
    assert.match(html, /app\/api\/billing\/route\.ts:\d+/);
  });
});
