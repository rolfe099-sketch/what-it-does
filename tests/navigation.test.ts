/**
 * View switching, and the specificity trap that shipped inside it.
 *
 * The report switches views with pure CSS `:target` — no script, so the back
 * button works and every view is a shareable link. The cost of that choice is
 * that navigation correctness is a *specificity* question, and specificity is
 * not something a reader of the stylesheet computes in their head. So it gets
 * a test.
 *
 * THE BUG THIS EXISTS FOR. The rule that hid the map when another view was
 * targeted was written `body:has(.view:target) #map`. Its specificity is
 * (1,2,1), because :has() contributes its most specific argument — which beats
 * `#map:target` at (1,1,0). So clicking the Map tab set the hash to #map, the
 * hiding rule won over the showing rule, and every view in the document was
 * switched off. A blank page, on the one interaction every reader performs.
 *
 * It reached npm and the hosted demos before an operator hit it, which is
 * exactly the kind of thing a test is cheaper than.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_CSS } from '../src/report/styles.js';

/**
 * Specificity of a simple selector, counting (ids, classes, elements).
 *
 * Deliberately small — it understands only the shapes this stylesheet's view
 * rules actually use, and :has() is scored the way the spec says: by its most
 * specific argument. A general CSS parser would be a dependency, and the point
 * here is to check one invariant rather than to be a parser.
 */
function specificity(selector: string): [number, number, number] {
  let rest = selector;
  let a = 0;
  let b = 0;
  let c = 0;

  // :has(...) and :not(...) contribute their argument's specificity.
  const functional = /:(?:has|not|is)\(([^()]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = functional.exec(rest)) !== null) {
    const inner = specificity(match[1]);
    a += inner[0];
    b += inner[1];
    c += inner[2];
  }
  rest = rest.replace(functional, ' ');

  a += (rest.match(/#[\w-]+/g) ?? []).length;
  b += (rest.match(/\.[\w-]+/g) ?? []).length;
  b += (rest.match(/:[\w-]+/g) ?? []).length; // pseudo-classes
  b += (rest.match(/\[[^\]]+\]/g) ?? []).length;
  c += (rest.match(/(?:^|[\s>+~])([a-z][\w-]*)/g) ?? []).length;

  return [a, b, c];
}

const beats = (x: [number, number, number], y: [number, number, number]) => {
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
};

/** Every rule in the stylesheet that sets `display` on something. */
function displayRules(): { selector: string; value: string }[] {
  const found: { selector: string; value: string }[] = [];
  // Comments first: this stylesheet documents its own rules heavily, and a
  // comment mentioning #map would otherwise be read as part of the selector
  // of whatever follows it.
  const css = REPORT_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const body = match[2];
    const display = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(body);
    if (display) found.push({ selector: match[1].trim(), value: display[1].trim() });
  }
  return found;
}

describe('the specificity calculator agrees with the spec', () => {
  test('it scores the two rules that fought', () => {
    assert.deepEqual(specificity('body:has(.view:target) #map'), [1, 2, 1]);
    assert.deepEqual(specificity('#map:target'), [1, 1, 0]);
    assert.equal(
      beats(specificity('body:has(.view:target) #map'), specificity('#map:target')),
      true,
      'this is the trap: the hiding rule outranks the showing rule',
    );
  });
});

describe('returning to the map cannot produce a blank page', () => {
  test('no rule can hide the map while the map is the target', () => {
    // The guard has to be structural — a selector that stops MATCHING when the
    // map is the target — because any fix that relies on out-specifying the
    // hiding rule is one edit away from losing the race again.
    for (const rule of displayRules()) {
      if (rule.value !== 'none') continue;
      if (!/#map(?![\w-])/.test(rule.selector)) continue;

      assert.match(
        rule.selector,
        /#map:not\(:target\)/,
        `"${rule.selector}" hides the map without excluding the case where the map IS the target`,
      );
    }
  });

  test('the map is shown by default, and that rule is unconditional', () => {
    const shows = displayRules().filter(
      (r) => r.selector === '#map' && r.value !== 'none',
    );
    assert.equal(shows.length, 1, 'exactly one unconditional rule should show the map');
  });

  test('a targeted view is shown', () => {
    const shows = displayRules().filter((r) => r.selector === '.view:target');
    assert.equal(shows.length, 1);
    assert.notEqual(shows[0].value, 'none');
  });

  test('views are hidden by default, so only one is ever open', () => {
    // Three rules target `.view`: the default that hides them, and two
    // fallbacks (no-:has(), and print) that deliberately show everything.
    // A flat regex cannot see at-rule context, so this asserts intent: exactly
    // one hides, and every other one shows rather than hides.
    const all = displayRules().filter((r) => r.selector === '.view');
    const hides = all.filter((r) => r.value === 'none');
    assert.equal(hides.length, 1, 'exactly one rule should hide views by default');
    for (const rule of all) {
      if (rule.value === 'none') continue;
      assert.match(rule.value, /^block/, 'a fallback must show views, never hide them');
    }
  });

  test('the no-:has() fallback still shows everything rather than nothing', () => {
    // Without :has() the switching cannot work, so the document degrades to
    // every view stacked and readable. Degrading to a blank page instead is
    // the failure this whole file is about.
    assert.match(REPORT_CSS, /@supports not \(selector\(:has\(\*\)\)\)\{\s*\.view\{display:block\}/);
  });
});
