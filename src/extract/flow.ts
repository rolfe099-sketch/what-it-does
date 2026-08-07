/**
 * Control flow — real steps, and guards recognised by shape.
 *
 * ── Why this replaces sorting effects by line number ──────────────────────
 *
 * The walkthrough used to list a behaviour's effects ordered by file and line,
 * which is honest but weak: it cannot tell you that the third line stops
 * everything if a check fails, and it cannot tell you the order things happen
 * in when they live in different files. Walking the entry function's own
 * statements in order gives real sequence, and real branches.
 *
 * ── Why a guard is a SHAPE, not a name ────────────────────────────────────
 *
 * Guard detection was a regex on function names — `withAuth`, `verifySignature`,
 * `requireUser`. That works until someone calls theirs `ensureCaller` or
 * `gate`, and then a properly protected endpoint gets reported as unprotected.
 *
 * Every authorisation check ever written has the same shape:
 *
 *     <read something>
 *     if (<that thing is missing or wrong>) <stop>
 *
 * where "stop" is a throw, a redirect, or a response carrying 401/403. That
 * shape is detectable, and unlike a name it cannot be spelled differently.
 *
 * The name heuristic is kept alongside it, because a guard hidden inside an
 * imported wrapper has no visible shape from the call site. Either signal is
 * enough; neither can invent a finding, only silence one.
 */

import ts from 'typescript';
import type { Effect, SourceRef, Step, StepKind, Unknown } from '../model.js';
import { detectEffects } from './effects.js';

/** Status codes that mean "you may not". */
const REFUSAL_CODES = new Set([401, 403]);

/** Calls that end a request by sending the visitor somewhere else. */
const REDIRECTS = /^(redirect|notFound|unauthorized|forbidden|permanentRedirect)$/;

// ---------------------------------------------------------------------------
// Guard shape
// ---------------------------------------------------------------------------

/** Does this statement (or anything in it) stop the behaviour? */
function isEarlyExit(node: ts.Node): { stops: true; how: string } | null {
  let found: { stops: true; how: string } | null = null;

  const visit = (n: ts.Node): void => {
    if (found) return;

    if (ts.isThrowStatement(n)) {
      found = { stops: true, how: 'throws an error' };
      return;
    }

    if (ts.isReturnStatement(n)) {
      const refusal = n.expression ? refusalStatus(n.expression) : null;
      found = refusal
        ? { stops: true, how: `answers ${refusal}` }
        : { stops: true, how: 'stops here' };
      return;
    }

    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : '';
      if (REDIRECTS.test(name)) {
        found = { stops: true, how: `sends them to ${name}()` };
        return;
      }
    }

    ts.forEachChild(n, visit);
  };

  visit(node);
  return found;
}

/**
 * Is this expression building a refusal — a response carrying 401 or 403?
 *
 * A plain `return null` ends the behaviour but says nothing about permission.
 * A 401 is unambiguous, which is why it is worth digging for the literal.
 */
function refusalStatus(expression: ts.Expression): string | null {
  let status: number | null = null;

  const visit = (n: ts.Node): void => {
    if (status !== null) return;
    if (
      ts.isPropertyAssignment(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'status' &&
      ts.isNumericLiteral(n.initializer)
    ) {
      const value = Number(n.initializer.text);
      if (REFUSAL_CODES.has(value)) status = value;
    }
    ts.forEachChild(n, visit);
  };

  visit(expression);
  return status === null ? null : `${status}`;
}

/**
 * A guard: a condition whose failure branch stops the behaviour.
 *
 * Deliberately shallow. `if (!user) throw` is a guard. A conditional whose
 * branches both continue is a branch, not a guard, and calling it one would
 * silence real findings.
 */
export function guardShape(statement: ts.Statement): { condition: string; otherwise: string } | null {
  if (!ts.isIfStatement(statement)) return null;

  const exit = isEarlyExit(statement.thenStatement);
  if (!exit) return null;

  // An else branch that continues means this is a fork, not a gate.
  if (statement.elseStatement && !isEarlyExit(statement.elseStatement)) return null;

  return { condition: conditionText(statement.expression), otherwise: exit.how };
}

/** Readable rendering of a condition, kept short enough to sit in a sentence. */
function conditionText(expression: ts.Expression): string {
  const raw = expression.getText().replace(/\s+/g, ' ').trim();
  return raw.length > 70 ? raw.slice(0, 67) + '…' : raw;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** The body of whatever function this range describes. */
function bodyOf(node: ts.Node): ts.Block | undefined {
  let found: ts.Block | undefined;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      (ts.isFunctionDeclaration(n) ||
        ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        ts.isMethodDeclaration(n)) &&
      n.body &&
      ts.isBlock(n.body)
    ) {
      found = n.body;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function nameOfDeclaration(statement: ts.VariableStatement): string | null {
  const decl = statement.declarationList.declarations[0];
  if (!decl) return null;
  if (ts.isIdentifier(decl.name)) return decl.name.text;
  // const { data: session } = await ... — the interesting name is the binding.
  if (ts.isObjectBindingPattern(decl.name)) {
    const first = decl.name.elements[0];
    if (first && ts.isIdentifier(first.name)) return first.name.text;
  }
  return null;
}

/**
 * Walk the entry function's own statements, in order.
 *
 * Only the top level. Nesting every branch produces a tree nobody reads, and
 * the guards — which are the reason to do this at all — sit at the top by
 * convention, because that is what an early exit is for.
 */
export function extractSteps(
  sourceFile: ts.SourceFile,
  repoPath: string,
  range: { pos: number; end: number } | undefined,
): Step[] {
  const scope = range
    ? findNodeInRange(sourceFile, range)
    : (sourceFile as unknown as ts.Node);
  if (!scope) return [];

  const body = bodyOf(scope);
  if (!body) return [];

  const steps: Step[] = [];

  for (const statement of body.statements) {
    const at: SourceRef = {
      file: repoPath,
      line: sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1,
    };

    const found = detectEffects(sourceFile, repoPath, {
      pos: statement.getStart(sourceFile),
      end: statement.getEnd(),
    });

    const guard = guardShape(statement);
    if (guard) {
      steps.push({
        kind: 'guard',
        label: `Checks ${guard.condition}`,
        otherwise: guard.otherwise,
        source: at,
        effects: found.effects,
        unknowns: found.unknowns,
      });
      continue;
    }

    const step = describe(statement, found.effects);
    if (!step) continue;

    steps.push({
      kind: step.kind,
      label: step.label,
      source: at,
      effects: found.effects,
      unknowns: found.unknowns,
    });
  }

  return steps;
}

/** Turn a statement into a sentence, or skip it if it says nothing. */
function describe(
  statement: ts.Statement,
  effects: Effect[],
): { kind: StepKind; label: string } | null {
  // An effect already describes itself better than any generic phrasing could.
  if (effects.length > 0) {
    const primary = effects[0];
    return { kind: 'does', label: primary.description };
  }

  if (ts.isVariableStatement(statement)) {
    const name = nameOfDeclaration(statement);
    return name ? { kind: 'gets', label: `Works out \`${name}\`` } : null;
  }

  if (ts.isIfStatement(statement)) {
    return { kind: 'branch', label: `Depending on ${conditionText(statement.expression)}` };
  }

  if (ts.isReturnStatement(statement)) {
    return { kind: 'responds', label: 'Answers the request' };
  }

  if (ts.isTryStatement(statement)) {
    return { kind: 'branch', label: 'Attempts the work, catching failures' };
  }

  // Expression statements with no detected effect are usually calls into
  // libraries we have no pattern for. Saying nothing is better than saying
  // something wrong, so they are skipped rather than guessed at.
  return null;
}

/** The outermost node fully inside `range`. */
function findNodeInRange(
  sourceFile: ts.SourceFile,
  range: { pos: number; end: number },
): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (n.getStart(sourceFile) >= range.pos && n.getEnd() <= range.end) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

/**
 * Words that mean the condition is about WHO, not about WHAT.
 *
 * A guard shape on its own is not an authorisation check — `if (!body.email)
 * throw` is input validation and has nothing to do with permission. Treating
 * every early exit as auth would silence real findings wholesale, which is the
 * expensive direction to be wrong in.
 *
 * So the shape must also be asking about identity. This is still a name
 * heuristic, but on the CONDITION rather than on the enclosing function, which
 * is both narrower and closer to the thing being decided.
 */
const IDENTITY = /\b(session|user|auth|token|actor|account|member|role|perm|permission|admin|owner|caller|viewer|credential|apikey|api_key|signed|login|logged)/i;

/**
 * A guard that is specifically about permission.
 *
 * Only ever ADDS an auth check, so a false positive here can quiet a warning
 * but can never manufacture one — which is the safe direction for a heuristic.
 */
export function guardChecksIdentity(statement: ts.Statement): boolean {
  if (!ts.isIfStatement(statement)) return false;
  if (!guardShape(statement)) return false;
  return IDENTITY.test(statement.expression.getText());
}

/**
 * Does this function contain an identity guard anywhere in it?
 *
 * Used to recognise an imported wrapper as authorisation without its name
 * having to match a pattern — the case where someone called theirs `gate` or
 * `ensureCaller` and every name-based rule missed it.
 */
export function containsIdentityGuard(node: ts.Node): boolean {
  const body = bodyOf(node) ?? node;
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIfStatement(n) && guardChecksIdentity(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}
