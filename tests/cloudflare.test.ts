/**
 * The second framework.
 *
 * These tests are as much about the architecture as about Cloudflare. The claim
 * in the README is that adding a framework means adding an extractor and
 * nothing else. If that is true, then everything below the entry point layer —
 * effects, guards, config detection, the resource graph — should work on a
 * Cloudflare project without having been told Cloudflare exists. So most of
 * what is asserted here is not entry point detection at all. It is the shared
 * machinery, proving it never depended on Next.js.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scan, byTitle, effectDescriptions } from './helpers.js';
import { detectFramework } from '../src/extract/detect.js';
import { fixture } from './helpers.js';

describe('Cloudflare Pages Functions are found', () => {
  const { framework, triggers } = scan('cfpages');

  test('the project is identified without a package.json', () => {
    // eriksenlabs.com, the project that prompted this extractor, has no
    // package.json at all. Requiring one would have found nothing.
    assert.equal(framework, 'Cloudflare Pages Functions');
  });

  test('the verb comes from the export name, not the file', () => {
    const contact = triggers.find((t) => t.urlPath === '/api/contact');
    assert.deepEqual(contact?.methods, ['POST'], 'onRequestPost handles POST');
  });

  test('all four export shapes are caught, not just the obvious one', () => {
    // export { handler as onRequestDelete } and export const onRequestGet.
    // Catching only `export async function` finds neither.
    const project = triggers.filter((t) => t.urlPath === '/api/projects/[id]');
    const verbs = new Set(project.flatMap((t) => t.methods ?? []));
    assert.deepEqual(verbs, new Set(['DELETE', 'GET']));
  });

  test('two handlers in one file are two behaviours, not one', () => {
    // They have different bodies, different guards and different consequences.
    // Merged, the guard on the read vouched for the delete — a false negative
    // in exactly the check this tool exists to make.
    const project = triggers.filter((t) => t.urlPath === '/api/projects/[id]');
    assert.equal(project.length, 2);
    assert.deepEqual(
      new Set(project.map((t) => t.exportName)),
      new Set(['handler', 'onRequestGet']),
      'each one names the function to read',
    );
  });

  test('a file that exports no handler is not a route', () => {
    // functions/api/helper.js is a helper. Listing it would be a lie, and
    // reporting it as unreadable would be noise.
    assert.equal(
      triggers.some((t) => t.urlPath.includes('helper')),
      false,
    );
  });
});

describe('middleware is scoped by directory', () => {
  const { triggers, middleware, behaviours } = scan('cfpages');

  test('every _middleware is kept, not only the last one seen', () => {
    // Cloudflare has no matcher config; position in the tree is the scope. A
    // project with one at the root and one under /api is the normal shape, and
    // keeping only one of them silently narrows coverage.
    assert.equal(middleware.matchers?.length, 2);
    assert.equal(triggers.filter((t) => t.kind === 'middleware').length, 2);
  });

  test('two middlewares get two identities, not one that flickers', () => {
    // The id was the constant string 'middleware'. Two of them collapsed into
    // one entry that would appear to change on every single drift diff.
    const ids = behaviours.filter((b) => b.trigger.kind === 'middleware').map((b) => b.id);
    assert.equal(new Set(ids).size, 2);
  });

  test('a scoped middleware does not claim to cover everything', () => {
    const scoped = behaviours.find((b) => b.trigger.urlPath === '/api/*');
    assert.match(scoped!.title, /Every request to \/api\/\*/);
  });
});

describe('the shared machinery never knew about Next.js', () => {
  const { behaviours, graph } = scan('cfpages');

  test('a literal URL is read, so a raw fetch names its service', () => {
    // This project has no SDK — Cloudflare Workers mostly do not — so the only
    // evidence of what the call does is the hostname. Without reading it the
    // whole endpoint degraded to "calls another service over the network".
    const contact = byTitle(behaviours, '/api/contact');
    assert.ok(
      effectDescriptions(contact).some((d) => d.includes('Resend')),
      'api.resend.com sends email, and the call site says so plainly',
    );
    const send = contact!.effects.find((e) => e.description.includes('Resend'))!;
    assert.equal(send.kind, 'sends-email', 'not the generic calls-external');
  });

  test('worker-style config is recognised, not only process.env', () => {
    // Cloudflare hands config over as context.env. Only understanding the Node
    // shape meant a function branching on an API key looked like it branched on
    // nothing — which is exactly the case this was found on.
    const contact = byTitle(behaviours, '/api/contact');
    assert.ok(
      contact?.unknowns.some(
        (u) => u.reason === 'config-dependent' && u.detail.includes('RESEND_API_KEY'),
      ),
      'the key is read inside an if, so it decides what the code does',
    );
  });

  test('a guard imported from outside functions/ is still traced', () => {
    const del = byTitle(behaviours, 'DELETE');
    assert.ok(
      del?.effects.some((e) => e.isAuthCheck),
      'requireAdmin lives in lib/, two directories up',
    );
  });

  test('a protected destructive route produces no finding', () => {
    const del = byTitle(behaviours, 'DELETE');
    assert.equal(del?.gaps.length, 0, 'it deletes, but the guard was found');
  });

  test('the resource graph populates from a framework it was not written for', () => {
    const projects = graph.find((n) => n.resource.name === 'projects');
    assert.ok(projects, 'the projects table should be a node');
    assert.ok(projects.reads >= 1 && projects.deletes >= 1, 'read and deleted by the same route');
  });
});

describe('an unsupported project is told something useful', () => {
  test('a recognised framework is named even though we cannot read it', () => {
    // The old behaviour was "Not a Next.js project" and exit(1), which says
    // nothing about their code and reads as a broken install.
    const detected = detectFramework(fixture('unsupported'));
    assert.equal(detected.supported, false);
    assert.equal(
      detected.supported === false && detected.survey.recognised?.name,
      'Express',
    );
  });

  test('the survey knows there is code here, so it cannot claim the project is static', () => {
    const detected = detectFramework(fixture('unsupported'));
    assert.equal(detected.supported === false && detected.survey.staticOnly, false);
    assert.ok(detected.supported === false && detected.survey.codeFiles > 0);
  });

  test('a project in a language we cannot read is NAMED, not misdescribed', () => {
    // Found by running the tool on a real 41-file Python repo: it reported
    // "there is no server-side code here" and "a static site does what its
    // HTML says", because the file census counted only JavaScript. Being
    // confidently wrong about someone's entire codebase is the worst thing
    // this tool can say, and it was saying it on its most-seen output.
    const detected = detectFramework(fixture('pythonapp'));
    assert.equal(detected.supported, false);
    const survey = detected.supported === false ? detected.survey : null;

    assert.equal(survey?.staticOnly, false, 'a Python project is not a static site');
    assert.equal(survey?.otherLanguages[0].name, 'Python');
    assert.equal(survey?.otherLanguages[0].files, 2);
    assert.equal(survey?.codeFiles, 0, 'and there is genuinely no JavaScript to read');
  });

  test('a directory with no code at all is still allowed to be static', () => {
    // The narrowing must not cost us the case the old branch got right.
    const detected = detectFramework(fixture('emptydir'));
    assert.equal(detected.supported === false && detected.survey.staticOnly, true);
    assert.equal(detected.supported === false && detected.survey.otherLanguages.length, 0);
  });

  test('a workspace root points at the application one level down', () => {
    // Pointing the tool at a monorepo root is the single most likely way to
    // reach this path, and "we could not identify a framework" is both true and
    // useless there. The applications are one directory away.
    const detected = detectFramework(fixture('workspace'));
    assert.equal(detected.supported, false);
    const children = detected.supported === false ? detected.survey.scannableChildren : [];
    assert.deepEqual(
      children.map((c) => c.dir),
      ['apps/site'],
    );
  });

  test('a child is only offered if it would actually scan', () => {
    // packages/ui lists `next` as a dependency but has no app router, and
    // packages/helpers has a directory called functions that is ordinary source
    // code. Sending someone to either is worse than saying nothing — the next
    // thing they would see is a second failure.
    const detected = detectFramework(fixture('workspace'));
    const dirs =
      detected.supported === false
        ? detected.survey.scannableChildren.map((c) => c.dir)
        : [];
    assert.equal(dirs.includes('packages/ui'), false, 'a component library is not an app');
    assert.equal(dirs.includes('packages/helpers'), false, 'functions/ alone proves nothing');
  });
});
