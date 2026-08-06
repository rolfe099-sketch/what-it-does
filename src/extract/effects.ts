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
import type { Effect, SourceRef, Unknown } from '../model.js';
import { EFFECT_PATTERNS, type EffectPattern } from './patterns.js';

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
 * The first matching pattern wins. The table is ordered by consequence, so
 * `.from(t).delete().select()` is reported as a deletion rather than a read —
 * which is the order a founder needs to hear it in.
 */
function matchPattern(detected: CallChain): { pattern: EffectPattern; description: string } | null {
  for (const pattern of EFFECT_PATTERNS) {
    const at = indexOfRun(detected.chain, pattern.chain);
    if (at === -1) continue;
    if (pattern.root && !(detected.root && pattern.root.test(detected.root))) continue;

    let description = pattern.describe;
    if (pattern.labelArgFrom !== undefined) {
      description = description.replace('{arg}', describeArgument(detected.args[at + pattern.labelArgFrom]));
    }
    return { pattern, description };
  }
  return null;
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
        node.expression.name.text === 'env'
      ) {
        const varName = node.name.text;
        if (!seenEnvVars.has(varName)) {
          seenEnvVars.add(varName);
          unknowns.push({
            reason: 'config-dependent',
            detail: `This depends on the setting \`${varName}\`. It may behave differently in production than it does locally.`,
            source: refAt(node),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return { effects: dedupeEffects(effects), unknowns };
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
