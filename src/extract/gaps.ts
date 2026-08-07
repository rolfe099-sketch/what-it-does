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
import { middlewareCovers, type MiddlewareInfo } from './nextjs/middleware.js';

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
 * EVERY PATTERN IS ANCHORED TO THE START, and that anchor is load-bearing.
 * The promise lives in the leading verb — what the function claims to DO. A
 * word appearing later is almost always a noun describing WHAT it operates on:
 *
 *   sendWelcomeEmail   promises to send        anchored match
 *   signInWithEmail    identifies BY email     no match, correctly
 *   updateEmail        changes an address      no match, correctly
 *   deleteAccount      promises to delete      anchored match
 *
 * An unanchored version of this list flagged both Supabase auth helpers in
 * Vercel's own reference app for "not sending an email". Same class of error as
 * reading a promise into a URL's resource noun.
 */
const NAME_PROMISES: { pattern: RegExp; expects: EffectKind; noun: string }[] = [
  {
    // "send" alone is not enough either — dub has `send-link-clicked-webhooks`,
    // which sends webhooks. But as a LEADING verb on a server action it is a
    // strong enough signal to be worth surfacing.
    pattern: /^(send|notify|remind|invite|welcome|dispatch|deliver|email|mail)/i,
    expects: 'sends-email',
    noun: 'send an email',
  },
  {
    pattern: /^(delete|remove|destroy|purge|wipe|revoke)/i,
    expects: 'deletes-data',
    noun: 'delete something',
  },
  {
    // `invoice` and `billing` are deliberately absent. They name a RECORD, and
    // viewing, listing or generating one moves no money.
    pattern: /^(charge|checkout|subscribe|payment|refund)/i,
    expects: 'takes-payment',
    noun: 'move money',
  },
  { pattern: /^(upload|attach)/i, expects: 'writes-file', noun: 'store a file' },
];

/**
 * Words that make a name a false promise. `deleteButton` is a component;
 * `emailInput` is a form field. Neither promises an effect.
 */
const NOT_A_PROMISE = /(button|input|field|form|modal|dialog|icon|label|schema|type|props|config|constant)/i;


export interface GapContext {
  /** Which paths middleware actually runs on, so claims can be per-route. */
  middleware: MiddlewareInfo;
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

  // Middleware is the main innocent explanation for a missing check, so the
  // strength of the claim depends on whether middleware actually runs here.
  let coverage: string;
  let confidence: Gap['confidence'];

  if (!context.middleware.present) {
    coverage =
      'This project has no middleware, so nothing is checking upstream either. If the check happens inside a wrapper we could not follow, this is a false alarm.';
    confidence = 'likely';
  } else if (kind === 'server-action') {
    // A server action posts to whichever page rendered it, so its middleware
    // coverage depends on where it is used — not statically knowable.
    coverage =
      'Server actions post to whichever page uses them, so we cannot tell which middleware rules apply. Worth confirming by hand.';
    confidence = 'possible';
  } else {
    const covered = middlewareCovers(context.middleware, behaviour.trigger.urlPath);
    if (covered === true) {
      coverage =
        'Middleware does run on this path and may well be doing the check, so treat this as a prompt to confirm rather than a finding.';
      confidence = 'possible';
    } else if (covered === false) {
      coverage =
        'This project has middleware, but its matcher does NOT cover this path — so nothing is checking upstream either.';
      confidence = 'likely';
    } else {
      coverage =
        'We could not read this project\'s middleware matcher, so we cannot tell whether it runs here.';
      confidence = 'possible';
    }
  }

  /**
   * An import we could not follow outranks every other consideration.
   *
   * "No visible check" is only worth saying when we could actually see. If a
   * behaviour imports something we failed to resolve, the guard may be sitting
   * right there inside it — so the claim softens to `possible` and says which
   * import blinded us, rather than accusing code we never opened.
   */
  const unread = behaviour.unknowns.filter((u) => u.reason === 'unsupported');
  if (unread.length > 0) {
    confidence = 'possible';
    coverage = `We could not follow ${unread.length === 1 ? 'an import' : `${unread.length} imports`} used here, so the check may be inside one of them. ${unread[0].detail}`;
  }

  const preamble =
    kind === 'server-action'
      ? 'Server actions are callable over HTTP directly, not only from your own forms.'
      : '';

  return [
    {
      kind: 'unprotected-destructive',
      summary: `${what} — with no visible check on who is asking`,
      detail:
        `${preamble} Nothing in the code we followed establishes the identity or permissions of whoever triggered this. ${coverage}`.trim(),
      confidence,
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
   * SERVER ACTIONS ONLY. This is a deliberate narrowing after the wider version
   * failed on real code.
   *
   * A developer who writes `sendWelcomeEmail` has made a specific claim in a
   * name they chose. A URL path has not: it names a resource and an action
   * ambiguously, and no rule reliably separates them. Applying promises to paths
   * flagged dub's `/invoices/[id]` page for "not moving money" (it displays an
   * invoice), `send-link-clicked-webhooks` for "not sending an email" (it sends
   * webhooks) and `charge-succeeded` for "not taking payment" (it handles an
   * event about a charge that already happened).
   *
   * Every one of those was confidently wrong, which is the failure mode this
   * whole file exists to avoid. Recall is worth less than precision here.
   */
  if (behaviour.trigger.kind !== 'server-action') return [];

  const name = behaviour.trigger.exportName;
  if (!name || NOT_A_PROMISE.test(name)) return [];

  const present = new Set(behaviour.effects.map((e) => e.kind));

  for (const promise of NAME_PROMISES) {
    if (!promise.pattern.test(name)) continue;
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
