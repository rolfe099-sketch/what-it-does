/**
 * Effect patterns — the table that turns code into plain language.
 *
 * THIS FILE IS DATA. Adding support for a new library means adding rows here;
 * it should never require touching effects.ts. If you find yourself writing an
 * `if` in the matcher for one specific library, the table is missing an
 * expressive feature — fix the table, not the logic.
 *
 * Matching is on the CALL CHAIN, not on the variable name. `supabase.from('x')
 * .delete()` and `db.from('x').delete()` and `client.from('x').delete()` are
 * the same thing, and real codebases name that client whatever they like.
 */

import type { EffectKind } from '../model.js';

export interface EffectPattern {
  /**
   * Consecutive method names to find in the call chain.
   * ['from', 'delete'] matches x.from('users').delete() and also
   * x.from('users').delete().select() — a chain may continue past the match.
   */
  chain: string[];
  /** Optional constraint on the root identifier, when the chain alone is ambiguous. */
  root?: RegExp;
  kind: EffectKind;
  /**
   * Which call in the chain carries a useful string argument, by index into
   * `chain`. `from('users')` is index 0, so the table name gets captured.
   */
  labelArgFrom?: number;
  /**
   * Take the label from the chain link BEFORE the match rather than from an
   * argument. Prisma and similar ORMs name the model as a property —
   * `prisma.passwordResetToken.findFirst()` — so the useful word is in the
   * chain, not in the parentheses. Without this the description degrades to
   * "Reads the first matching record" and the model name is lost.
   */
  labelFromPreviousLink?: boolean;
  /** `{arg}` is replaced by the captured argument, or dropped if absent. */
  describe: string;
  confidence: 'certain' | 'likely';
  /**
   * This call establishes WHO is asking. Marking it lets gap detection ask the
   * question that matters: does anything destructive happen here without one of
   * these appearing first?
   */
  authCheck?: boolean;
}

/**
 * Ordered by consequence. The matcher takes the FIRST match per call site, so
 * destructive and money-moving patterns must appear before their read-only
 * siblings: `.from(t).delete().select()` is a deletion, not a read.
 */
export const EFFECT_PATTERNS: EffectPattern[] = [
  // ---------------------------------------------------------------- payment
  {
    chain: ['checkout', 'sessions', 'create'],
    kind: 'takes-payment',
    describe: 'Starts a Stripe checkout — this is where money is taken',
    confidence: 'certain',
  },
  {
    chain: ['paymentIntents', 'create'],
    kind: 'takes-payment',
    describe: 'Creates a Stripe payment',
    confidence: 'certain',
  },
  {
    chain: ['subscriptions', 'create'],
    kind: 'takes-payment',
    describe: 'Starts a recurring subscription charge',
    confidence: 'certain',
  },
  {
    chain: ['subscriptions', 'update'],
    kind: 'takes-payment',
    describe: 'Changes an existing subscription — may change what a customer is billed',
    confidence: 'certain',
  },
  {
    chain: ['subscriptions', 'cancel'],
    kind: 'takes-payment',
    describe: 'Cancels a subscription',
    confidence: 'certain',
  },
  {
    chain: ['billingPortal', 'sessions', 'create'],
    kind: 'takes-payment',
    describe: 'Opens the Stripe billing portal, where a customer can change what they pay',
    confidence: 'certain',
  },
  {
    chain: ['refunds', 'create'],
    kind: 'takes-payment',
    describe: 'Issues a refund',
    confidence: 'certain',
  },

  // --------------------------------------------------------------- deletion
  {
    chain: ['from', 'delete'],
    kind: 'deletes-data',
    labelArgFrom: 0,
    describe: 'Deletes rows from {arg}',
    confidence: 'certain',
  },
  {
    chain: ['auth', 'admin', 'deleteUser'],
    kind: 'deletes-data',
    describe: 'Permanently deletes a user account',
    confidence: 'certain',
  },
  {
    chain: ['storage', 'from', 'remove'],
    kind: 'deletes-data',
    labelArgFrom: 1,
    describe: 'Deletes stored files from {arg}',
    confidence: 'certain',
  },
  {
    chain: ['deleteMany'],
    kind: 'deletes-data',
    labelFromPreviousLink: true,
    describe: 'Deletes multiple rows from {arg}',
    confidence: 'certain',
  },
  {
    chain: ['delete'],
    root: /prisma|db|client/i,
    kind: 'deletes-data',
    labelFromPreviousLink: true,
    describe: 'Deletes a row from {arg}',
    confidence: 'certain',
  },
  {
    chain: ['unlink'],
    kind: 'deletes-data',
    describe: 'Deletes a file from disk',
    confidence: 'certain',
  },
  {
    chain: ['users', 'deleteUser'],
    kind: 'deletes-data',
    describe: 'Permanently deletes a user account',
    confidence: 'certain',
  },
  {
    // Drizzle: db.delete(users).where(...)
    chain: ['delete'],
    root: /^(db|database|drizzle|tx)$/i,
    kind: 'deletes-data',
    labelArgFrom: 0,
    describe: 'Deletes rows from {arg}',
    confidence: 'certain',
  },

  // ----------------------------------------------------------------- access
  {
    chain: ['auth', 'signUp'],
    kind: 'changes-access',
    describe: 'Creates a new account',
    confidence: 'certain',
  },
  {
    chain: ['auth', 'signInWithPassword'],
    kind: 'changes-access',
    describe: 'Signs someone in with a password',
    confidence: 'certain',
  },
  {
    chain: ['auth', 'signInWithOtp'],
    kind: 'changes-access',
    describe: 'Signs someone in with an emailed link or code',
    confidence: 'certain',
  },
  {
    chain: ['auth', 'signInWithOAuth'],
    kind: 'changes-access',
    describe: 'Signs someone in through an external provider',
    confidence: 'certain',
  },
  {
    chain: ['auth', 'signOut'],
    kind: 'changes-access',
    describe: 'Signs someone out',
    confidence: 'certain',
  },
  {
    chain: ['auth', 'updateUser'],
    kind: 'changes-access',
    describe: 'Changes account credentials or details',
    confidence: 'certain',
  },
  {
    chain: ['auth', 'exchangeCodeForSession'],
    kind: 'changes-access',
    describe: 'Turns a login code into an active session',
    confidence: 'certain',
  },
  {
    chain: ['auth', 'resetPasswordForEmail'],
    kind: 'sends-email',
    describe: 'Emails a password reset link',
    confidence: 'certain',
  },

  // NextAuth / Auth.js. `signIn` and `signOut` are bare calls rather than
  // methods, which is why the chain is a single element.
  {
    chain: ['signIn'],
    kind: 'changes-access',
    describe: 'Signs someone in',
    confidence: 'certain',
  },
  {
    chain: ['signOut'],
    kind: 'changes-access',
    describe: 'Signs someone out',
    confidence: 'certain',
  },
  {
    chain: ['users', 'updateUser'],
    kind: 'changes-access',
    describe: 'Changes a user account',
    confidence: 'certain',
  },
  {
    chain: ['users', 'createUser'],
    kind: 'changes-access',
    describe: 'Creates a user account',
    confidence: 'certain',
  },
  {
    chain: ['users', 'banUser'],
    kind: 'changes-access',
    describe: 'Bans a user',
    confidence: 'certain',
  },

  // ------------------------------------------------------------------ email
  {
    chain: ['emails', 'send'],
    kind: 'sends-email',
    describe: 'Sends an email',
    confidence: 'certain',
  },
  {
    chain: ['sendMail'],
    kind: 'sends-email',
    describe: 'Sends an email',
    confidence: 'certain',
  },
  {
    chain: ['sendEmail'],
    kind: 'sends-email',
    describe: 'Sends an email',
    confidence: 'likely',
  },
  {
    chain: ['sendBatchEmail'],
    kind: 'sends-email',
    describe: 'Sends several emails at once',
    confidence: 'likely',
  },

  // ------------------------------------------------------------------ write
  {
    chain: ['from', 'insert'],
    kind: 'writes-data',
    labelArgFrom: 0,
    describe: 'Adds rows to {arg}',
    confidence: 'certain',
  },
  {
    chain: ['from', 'update'],
    kind: 'writes-data',
    labelArgFrom: 0,
    describe: 'Changes rows in {arg}',
    confidence: 'certain',
  },
  {
    chain: ['from', 'upsert'],
    kind: 'writes-data',
    labelArgFrom: 0,
    describe: 'Adds or changes rows in {arg}',
    confidence: 'certain',
  },
  {
    chain: ['storage', 'from', 'upload'],
    kind: 'writes-file',
    labelArgFrom: 1,
    describe: 'Uploads a file to {arg}',
    confidence: 'certain',
  },
  {
    // Drizzle: db.insert(users).values({...})
    chain: ['insert', 'values'],
    kind: 'writes-data',
    labelArgFrom: 0,
    describe: 'Adds rows to {arg}',
    confidence: 'certain',
  },
  {
    // Drizzle: db.update(users).set({...})
    chain: ['update', 'set'],
    kind: 'writes-data',
    labelArgFrom: 0,
    describe: 'Changes rows in {arg}',
    confidence: 'certain',
  },
  {
    chain: ['createMany'],
    kind: 'writes-data',
    labelFromPreviousLink: true,
    describe: 'Adds multiple rows to {arg}',
    confidence: 'certain',
  },
  {
    chain: ['updateMany'],
    kind: 'writes-data',
    labelFromPreviousLink: true,
    describe: 'Changes multiple rows in {arg}',
    confidence: 'certain',
  },
  {
    chain: ['upsert'],
    root: /prisma|db|client/i,
    kind: 'writes-data',
    labelFromPreviousLink: true,
    describe: 'Adds or changes a row in {arg}',
    confidence: 'certain',
  },
  {
    chain: ['create'],
    root: /prisma|db/i,
    kind: 'writes-data',
    labelFromPreviousLink: true,
    describe: 'Adds a row to {arg}',
    confidence: 'likely',
  },
  {
    chain: ['update'],
    root: /prisma|db/i,
    kind: 'writes-data',
    labelFromPreviousLink: true,
    describe: 'Changes a row in {arg}',
    confidence: 'likely',
  },
  {
    chain: ['writeFile'],
    kind: 'writes-file',
    describe: 'Writes a file to disk',
    confidence: 'certain',
  },
  {
    chain: ['writeFileSync'],
    kind: 'writes-file',
    describe: 'Writes a file to disk',
    confidence: 'certain',
  },

  // ------------------------------------------------------------------- read
  {
    chain: ['from', 'select'],
    kind: 'reads-data',
    labelArgFrom: 0,
    describe: 'Reads rows from {arg}',
    confidence: 'certain',
  },
  // ---- Establishing who is asking -------------------------------------
  // Marked authCheck so gap detection can ask whether anything destructive
  // happens without one of these appearing anywhere in its path.
  {
    chain: ['auth', 'getUser'],
    kind: 'reads-data',
    describe: 'Checks who is signed in',
    confidence: 'certain',
    authCheck: true,
  },
  {
    chain: ['auth', 'getSession'],
    kind: 'reads-data',
    describe: 'Checks the current session',
    confidence: 'certain',
    authCheck: true,
  },
  {
    // NextAuth v4
    chain: ['getServerSession'],
    kind: 'reads-data',
    describe: 'Checks who is signed in',
    confidence: 'certain',
    authCheck: true,
  },
  {
    // NextAuth v4 JWT
    chain: ['getToken'],
    kind: 'reads-data',
    describe: 'Reads the session token to see who is asking',
    confidence: 'certain',
    authCheck: true,
  },
  {
    // Auth.js v5 and Clerk both expose a bare auth(). Ambiguous by name, but in
    // a Next.js app it means the same thing either way: who is asking?
    chain: ['auth'],
    kind: 'reads-data',
    describe: 'Checks who is signed in',
    confidence: 'likely',
    authCheck: true,
  },
  {
    // Clerk
    chain: ['currentUser'],
    kind: 'reads-data',
    describe: 'Loads the signed-in user',
    confidence: 'certain',
    authCheck: true,
  },
  {
    // Stripe webhook signature verification. This IS an authorisation check —
    // it proves the caller is Stripe — and counting it prevents a false alarm
    // on every webhook endpoint in existence.
    chain: ['webhooks', 'constructEvent'],
    kind: 'reads-data',
    describe: 'Verifies the request really came from Stripe',
    confidence: 'certain',
    authCheck: true,
  },
  {
    chain: ['useSession'],
    kind: 'reads-data',
    describe: 'Reads the session in the browser',
    confidence: 'certain',
    authCheck: true,
  },
  {
    chain: ['getSession'],
    kind: 'reads-data',
    describe: 'Checks the current session',
    confidence: 'likely',
    authCheck: true,
  },
  {
    chain: ['findMany'],
    kind: 'reads-data',
    labelFromPreviousLink: true,
    describe: 'Reads rows from {arg}',
    confidence: 'certain',
  },
  {
    chain: ['findUnique'],
    kind: 'reads-data',
    labelFromPreviousLink: true,
    describe: 'Reads one row from {arg}',
    confidence: 'certain',
  },
  {
    chain: ['findFirst'],
    kind: 'reads-data',
    labelFromPreviousLink: true,
    describe: 'Reads the first matching row from {arg}',
    confidence: 'certain',
  },

  // --------------------------------------------------------------- external
  {
    chain: ['customers', 'create'],
    kind: 'calls-external',
    describe: 'Creates a customer record at Stripe',
    confidence: 'certain',
  },
  {
    chain: ['fetch'],
    kind: 'calls-external',
    describe: "Calls another service over the network",
    confidence: 'likely',
  },
  {
    chain: ['axios'],
    kind: 'calls-external',
    describe: 'Calls another service over the network',
    confidence: 'likely',
  },
];

/**
 * Function names that establish who is asking.
 *
 * The explicit table above cannot enumerate every project's guard — dub has
 * `verifyQstashSignature`, another codebase has `requireWorkspaceOwner`, a third
 * has `withAdmin`. But the naming is strongly conventional, and missing these
 * produces the worst possible output: a confident claim that a properly
 * protected endpoint is unprotected.
 *
 * Matched against the called function name only, and reported at 'likely'
 * confidence because it is inference from a name rather than a known API.
 */
export const AUTH_CHECK_NAME_PATTERNS: RegExp[] = [
  // verifySignature, validateSession, checkPermission, requireAdmin, ensureAuth
  /^(verify|validate|check|require|ensure|assert)\w*(auth|signature|session|token|permission|access|admin|owner|role|webhook|apikey|key)/i,
  // The higher-order-guard convention: withAuth, withAdmin, withWorkspace, and
  // longer forms like withReferralsEmbedToken. The distinguishing word can sit
  // anywhere after `with`, which an earlier version got wrong by anchoring it to
  // the second position.
  /^with\w*(Auth|Token|Session|Admin|User|Workspace|Access|Key|Guard|Permission|Role|Owner|Member|Partner|Program|Embed)/i,
  // Direct fetches of the current actor
  /^(requireAuth|requireUser|requireSession|getCurrentUser|getAuthUser|getUserOrThrow|protect|authorize|authorise)$/i,
];

/**
 * Libraries we deliberately do not trace into. Reaching one of these is an
 * expected boundary, not a failure — the user does not need to see inside
 * Stripe's SDK, and saying "we can't read this" about it would be noise.
 */
export const THIRD_PARTY_BOUNDARIES = [
  'stripe',
  '@supabase/',
  '@prisma/',
  'resend',
  'nodemailer',
  'next/',
  'react',
];
