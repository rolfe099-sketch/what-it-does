/**
 * Gap detection — where a behaviour does not do what it appears to.
 *
 * This is the sharpest output the tool produces and the easiest to get wrong.
 * Telling someone their live application has an unprotected delete endpoint is a
 * serious claim. Getting it wrong once costs more trust than getting it right
 * ten times earns, so two rules govern everything here:
 *
 *   1. NEVER report a gap in a behaviour we could not see into. If we found no
 *      effects at all, we are blind — that is our failure, not their bug.
 *   2. EVERY gap states what would make it a false alarm, in the same breath as
 *      the accusation.
 */

import type { Behaviour, EffectKind, Gap } from '../model.js';

/**
 * Effects that genuinely require knowing who is asking.
 *
 * Deliberately NOT the full consequential set. `changes-access` is excluded
 * because half of it IS the authentication flow — sign-in, sign-up and sign-out
 * are supposed to be reachable by someone who is not yet signed in, and
 * demanding an auth check on them is a logical error that buries the real
 * findings under nonsense.
 *
 * Deleting data and moving money are unambiguous: doing either without
 * establishing the caller is always worth a look.
 */
const NEEDS_AUTHORISATION: ReadonlySet<EffectKind> = new Set(['deletes-data', 'takes-payment']);

/**
 * Names that promise a specific effect.
 *
 * This is the signature failure of AI-generated code: a model writes a
 * plausible, well-named function and never wires up the thing the name says.
 *
 * Every pattern here is a VERB. "Email" as a noun promises nothing —
 * `updateEmail` changes an address and `signInWithEmail` identifies by one;
 * neither claims to send anything. An earlier version matched the bare noun and
 * produced confident nonsense on both.
 */
const NAME_PROMISES: { pattern: RegExp; expects: EffectKind; noun: string }[] = [
  {
    pattern: /(send|notify|invite|welcome|remind|dispatch|digest|newsletter)/i,
    expects: 'sends-email',
    noun: 'send an email',
  },
  {
    pattern: /(delete|remove|destroy|purge|wipe|revoke)/i,
    expects: 'deletes-data',
    noun: 'delete something',
  },
  {
    pattern: /(charge|checkout|subscribe|payment|billing|invoice|refund)/i,
    expects: 'takes-payment',
    noun: 'move money',
  },
  { pattern: /(upload|attach)/i, expects: 'writes-file', noun: 'store a file' },
];

/**
 * Words that make a name a false promise. `deleteButton` is a component;
 * `emailInput` is a form field. Neither promises an effect.
 */
const NOT_A_PROMISE = /(button|input|field|form|modal|dialog|icon|label|schema|type|props|config|constant)/i;

/** The action part of a URL: "/api/embed/send-otp" -> "send-otp". */
function lastSegment(urlPath: string): string {
  const segments = urlPath.split('/').filter(Boolean);
  // A trailing [param] is an argument, not an action — step back past it.
  while (segments.length > 0 && segments[segments.length - 1].startsWith('[')) segments.pop();
  return segments[segments.length - 1] ?? '';
}

export interface GapContext {
  /** Middleware can protect endpoints invisibly, so its presence softens claims. */
  hasMiddleware: boolean;
}

export function detectGaps(behaviour: Behaviour, context: GapContext): Gap[] {
  const gaps: Gap[] = [];

  // Rule 1: never accuse a behaviour we could not see into.
  if (behaviour.effects.length === 0) return gaps;

  gaps.push(...unprotectedDestructive(behaviour, context));
  gaps.push(...unfulfilledPromise(behaviour));

  return gaps;
}

/**
 * Something consequential happens and nothing establishes who is asking.
 *
 * Restricted to routes and server actions on purpose. Pages are commonly
 * protected by a layout or a parent guard we do not model, and flagging every
 * page would bury the real findings under noise.
 *
 * Server actions get the stronger wording because they are directly callable
 * over HTTP — a fact that surprises people who assume a form is the only way in.
 */
function unprotectedDestructive(behaviour: Behaviour, context: GapContext): Gap[] {
  const kind = behaviour.trigger.kind;
  if (kind !== 'api-route' && kind !== 'server-action') return [];

  const consequential = behaviour.effects.filter((e) => NEEDS_AUTHORISATION.has(e.kind));
  if (consequential.length === 0) return [];

  const hasAuthCheck = behaviour.effects.some((e) => e.isAuthCheck);
  if (hasAuthCheck) return [];

  const what = consequential[0].description;

  const escapeHatch = context.hasMiddleware
    ? 'This project has middleware, which may well be doing the check — we do not yet follow what middleware protects, so treat this as a prompt to confirm rather than a finding.'
    : 'If the check happens inside a wrapper or helper we could not follow, this is a false alarm.';

  const preamble =
    kind === 'server-action'
      ? 'Server actions are callable over HTTP directly, not only from your own forms.'
      : '';

  return [
    {
      kind: 'unprotected-destructive',
      summary: `${what} — with no visible check on who is asking`,
      detail: `${preamble} Nothing in the code we followed establishes the identity or permissions of whoever triggered this. ${escapeHatch}`.trim(),
      // Middleware is a genuine alternative explanation, so the claim softens.
      confidence: context.hasMiddleware ? 'possible' : 'likely',
      source: behaviour.trigger.source,
    },
  ];
}

/**
 * The name says one thing, the code does another.
 *
 * Only fires when we found other effects — meaning we could see into this
 * behaviour and the promised one is genuinely absent, rather than us being
 * unable to read it.
 */
function unfulfilledPromise(behaviour: Behaviour): Gap[] {
  /**
   * A function name and a URL path are different kinds of thing.
   *
   * A developer who writes `sendWelcomeEmail` has made a claim, and the verb can
   * sit anywhere in it. A URL path is an ADDRESS — `/api/invites/accept` names
   * the resource "invites" and the action "accept", and reading a promise to
   * send email into the resource noun produces confident nonsense.
   *
   * So paths only promise when the verb leads the final segment: `send-otp`
   * counts, `invites/accept` does not.
   */
  const isAction = behaviour.trigger.kind === 'server-action';
  const name = isAction ? behaviour.trigger.exportName : lastSegment(behaviour.trigger.urlPath);
  if (!name || NOT_A_PROMISE.test(name)) return [];

  const present = new Set(behaviour.effects.map((e) => e.kind));

  for (const promise of NAME_PROMISES) {
    const matches = isAction
      ? promise.pattern.test(name)
      : new RegExp(`^${promise.pattern.source}`, 'i').test(name);
    if (!matches) continue;
    if (present.has(promise.expects)) continue;

    return [
      {
        kind: 'unfulfilled-promise',
        summary: `Named "${name}", but we found nothing here that would ${promise.noun}`,
        detail: `We traced ${behaviour.effects.length} other ${behaviour.effects.length === 1 ? 'thing' : 'things'} this does, so we could read it — the promised step is not among them. Either it happens further away than we followed, or it was never wired up.`,
        confidence: 'possible',
        source: behaviour.trigger.source,
      },
    ];
  }

  return [];
}
