/**
 * Effect detection — turning call sites into plain language.
 *
 * The matching is structural, not name-based. `supabase.from('users').delete()`,
 * `db.from('users').delete()` and `client.from('users').delete()` are the same
 * operation, and real codebases name that client whatever they feel like. So we
 * match on the shape of the call chain and treat the root identifier as an
 * optional hint rather than the key.
 */

import ts from 'typescript';
import type { Effect, Resource, SourceRef, Unknown } from '../model.js';
import { AUTH_CHECK_NAME_PATTERNS, EFFECT_PATTERNS, type EffectPattern } from './patterns.js';

// ---------------------------------------------------------------------------
// Flattening a call chain
// ---------------------------------------------------------------------------

interface CallChain {
  /** The identifier the chain starts from, if there is one. */
  root?: string;
  /** Method names in source order: supabase.from(x).delete() -> ['from','delete'] */
  chain: string[];
  /** First argument of each link, by the same index as `chain`. */
  args: (ts.Expression | undefined)[];
}

/** Strip the wrappers that sit between us and the real expression. */
function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current)) current = current.expression;
    else if (ts.isNonNullExpression(current)) current = current.expression;
    else if (ts.isAwaitExpression(current)) current = current.expression;
    else if (ts.isAsExpression(current)) current = current.expression;
    else return current;
  }
}

/**
 * Walk a call expression from the outside in, collecting method names.
 *
 * Reads backwards — `.delete()` is found before `.from()` — so both arrays are
 * reversed at the end to put them in source order, which is the order a human
 * reads and the order the pattern table is written in.
 */
function flattenCallChain(call: ts.CallExpression): CallChain {
  const chain: string[] = [];
  const args: (ts.Expression | undefined)[] = [];
  let current: ts.Expression = call;
  let root: string | undefined;

  for (;;) {
    current = unwrap(current);

    if (ts.isCallExpression(current)) {
      const callee = unwrap(current.expression);

      if (ts.isPropertyAccessExpression(callee)) {
        chain.push(callee.name.text);
        args.push(current.arguments[0]);
        current = callee.expression;
        continue;
      }

      if (ts.isIdentifier(callee)) {
        // A bare call: fetch(url), sendEmail(...)
        chain.push(callee.text);
        args.push(current.arguments[0]);
        root = callee.text;
        break;
      }

      break;
    }

    if (ts.isPropertyAccessExpression(current)) {
      // Property access with no call, e.g. `stripe.checkout` in
      // stripe.checkout.sessions.create() — part of the path, not a call.
      chain.push(current.name.text);
      args.push(undefined);
      current = current.expression;
      continue;
    }

    if (ts.isIdentifier(current)) {
      root = current.text;
    }
    break;
  }

  return { root, chain: chain.reverse(), args: args.reverse() };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Index where `needle` appears as a consecutive run inside `haystack`, or -1. */
function indexOfRun(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Describe an argument in a way that stays honest when it is not a literal.
 * `from('users')` is knowable; `from(table)` is not, and saying so is more
 * useful than pretending or omitting.
 */
function describeArgument(arg: ts.Expression | undefined): string {
  if (!arg) return 'something chosen at runtime';
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return `\`${arg.text}\``;
  if (ts.isIdentifier(arg)) return `\`${arg.text}\` (a variable)`;
  return 'something chosen at runtime';
}

/**
 * The raw resource name behind an argument, kept separate from the prose.
 * `literal:false` means the code passed a variable, so the graph knows the edge
 * is real but the target uncertain — and can say so rather than guessing.
 */
function rawName(arg: ts.Expression | undefined): { name: string; literal: boolean } | null {
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
    return { name: arg.text, literal: true };
  if (ts.isIdentifier(arg)) return { name: arg.text, literal: false };
  return null;
}

/**
 * The first matching pattern wins. The table is ordered by consequence, so
 * `.from(t).delete().select()` is reported as a deletion rather than a read —
 * which is the order a founder needs to hear it in.
 */
function matchPattern(
  detected: CallChain,
): { pattern: EffectPattern; description: string; resource?: Resource } | null {
  for (const pattern of EFFECT_PATTERNS) {
    const at = indexOfRun(detected.chain, pattern.chain);
    if (at === -1) continue;
    if (pattern.root && !(detected.root && pattern.root.test(detected.root))) continue;

    let description = pattern.describe;
    let resource: Resource | undefined;

    if (pattern.labelArgFrom !== undefined) {
      const arg = detected.args[at + pattern.labelArgFrom];
      description = description.replace('{arg}', describeArgument(arg));
      const raw = rawName(arg);
      if (raw && pattern.resourceKind) {
        resource = { kind: pattern.resourceKind, name: raw.name, literal: raw.literal };
      }
    } else if (pattern.labelFromPreviousLink) {
      // prisma.passwordResetToken.findFirst() — the model is the link before.
      const model = at > 0 ? detected.chain[at - 1] : undefined;
      description = description.replace('{arg}', model ? `\`${model}\`` : 'a table we could not name');
      if (model && pattern.resourceKind) {
        resource = { kind: pattern.resourceKind, name: model, literal: true };
      }
    }

    // Calls that always target the same place, e.g. every Stripe API.
    if (!resource && pattern.resourceKind && pattern.resourceName) {
      resource = { kind: pattern.resourceKind, name: pattern.resourceName, literal: true };
    }

    return { pattern, description, resource };
  }

  // Fall back to the naming convention for guards. Only ever produces an auth
  // check — never a destructive effect — so a bad guess here can silence a
  // warning but can never invent one.
  const called = detected.chain[detected.chain.length - 1];
  if (called && AUTH_CHECK_NAME_PATTERNS.some((re) => re.test(called))) {
    return {
      pattern: {
        chain: [called],
        kind: 'reads-data',
        describe: '',
        confidence: 'likely',
        authCheck: true,
      },
      description: `Checks who is asking, via \`${called}()\``,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Config dependence
// ---------------------------------------------------------------------------

/**
 * Is this expression being used to DECIDE something?
 *
 * The distinction that makes this warning worth reading: passing
 * `process.env.SUPABASE_URL` to a client constructor is configuration, and
 * warning about it on every behaviour is noise that teaches people to ignore
 * the warnings. Branching on `process.env.NODE_ENV === 'production'` genuinely
 * changes what the code does, and that is what surprises people in production.
 *
 * Only the second kind is reported.
 */
function isUsedInDecision(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  let child: ts.Node = node;

  while ((current = current.parent)) {
    if (ts.isIfStatement(current) && current.expression === child) return true;
    if (ts.isConditionalExpression(current) && current.condition === child) return true;
    if (ts.isSwitchStatement(current) && current.expression === child) return true;
    if (ts.isCaseClause(current)) return true;
    if (ts.isWhileStatement(current) && current.expression === child) return true;

    if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) {
      // !process.env.X — negation is only ever asked as a question.
      child = current;
      continue;
    }

    if (ts.isBinaryExpression(current)) {
      const op = current.operatorToken.kind;
      const decides =
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken ||
        op === ts.SyntaxKind.EqualsEqualsToken ||
        op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsEqualsToken;
      if (decides) return true;
    }

    // Keep climbing through wrappers that do not change the question.
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isPropertyAccessExpression(current)
    ) {
      child = current;
      continue;
    }

    // Anything else means the value is being used, not interrogated.
    return false;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Scanning a file
// ---------------------------------------------------------------------------

export interface FileEffects {
  effects: Effect[];
  unknowns: Unknown[];
}

/**
 * Find every effect and config dependency in one source file.
 *
 * `range` optionally narrows the scan to a single function's body, which is how
 * effects get attributed to the specific behaviour that causes them rather than
 * to whatever file they happen to share.
 */
export function detectEffects(
  sourceFile: ts.SourceFile,
  repoPath: string,
  range?: { pos: number; end: number },
): FileEffects {
  const effects: Effect[] = [];
  const unknowns: Unknown[] = [];
  const seenEnvVars = new Set<string>();

  const refAt = (node: ts.Node): SourceRef => ({
    file: repoPath,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
  });

  const inRange = (node: ts.Node) =>
    !range || (node.getStart(sourceFile) >= range.pos && node.getEnd() <= range.end);

  const visit = (node: ts.Node): void => {
    if (inRange(node)) {
      if (ts.isCallExpression(node)) {
        const matched = matchPattern(flattenCallChain(node));
        if (matched) {
          effects.push({
            kind: matched.pattern.kind,
            description: matched.description,
            source: refAt(node),
            confidence: matched.pattern.confidence,
            isAuthCheck: matched.pattern.authCheck,
            resource: matched.resource,
          });
        }
      }

      // process.env.SOMETHING — the highest-value unknown we produce. A
      // behaviour that changes with an environment variable is invisible in the
      // code and is exactly what surprises people in production.
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'process' &&
        node.expression.name.text === 'env' &&
        isUsedInDecision(node)
      ) {
        const varName = node.name.text;
        if (!seenEnvVars.has(varName)) {
          seenEnvVars.add(varName);
          unknowns.push({
            reason: 'config-dependent',
            detail: `This takes a different path depending on the setting \`${varName}\`, so it may not behave the same in production as it does locally.`,
            source: refAt(node),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return { effects: markCredentialReadsAsAuthChecks(dedupeEffects(effects)), unknowns };
}

/**
 * Reading a credential record IS an authorisation check.
 *
 * Not every endpoint authenticates with a session. Password reset, OAuth token
 * exchange, SCIM provisioning and API-key access all authorise by looking up a
 * token supplied in the request — dub's `/api/auth/reset-password` validates a
 * `passwordResetToken` and is properly protected, but a session-only model calls
 * it unguarded and is confidently wrong.
 *
 * A read against a table named for credentials is strong evidence the code is
 * establishing who is asking.
 */
const CREDENTIAL_TABLE = /(token|apikey|api_key|credential|secret|session|invitation|invite|magiclink|otp)/i;

function markCredentialReadsAsAuthChecks(effects: Effect[]): Effect[] {
  return effects.map((effect) =>
    effect.kind === 'reads-data' && !effect.isAuthCheck && CREDENTIAL_TABLE.test(effect.description)
      ? { ...effect, isAuthCheck: true, confidence: 'likely' as const }
      : effect,
  );
}

/**
 * Collapse identical effects reported at different lines. Ten reads of the same
 * table is one fact about the behaviour, not ten. The earliest line is kept so
 * "go look at this" still lands somewhere useful.
 */
function dedupeEffects(effects: Effect[]): Effect[] {
  const byKey = new Map<string, Effect>();
  for (const effect of effects) {
    const key = `${effect.kind}::${effect.description}`;
    const existing = byKey.get(key);
    if (!existing || effect.source.line < existing.source.line) byKey.set(key, effect);
  }
  return [...byKey.values()];
}
