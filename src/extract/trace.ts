/**
 * Call-path tracing — following the work into the files it actually happens in.
 *
 * Without this, a page whose logic lives in helpers looks like it does nothing,
 * which is the most dangerous kind of wrong a map can be. With it, an effect
 * three files away still attaches to the behaviour that causes it.
 *
 * Deliberately bounded:
 *   - depth-limited, because an unbounded graph on a large repo is both slow and
 *     unreadable, and the fifth hop is rarely what anyone needed to know
 *   - memoised per (file, symbol), since helpers are called from everywhere
 *   - third-party imports are a boundary, not a failure
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import type { Effect, Unknown } from '../model.js';
import { detectEffects } from './effects.js';
import type { Resolver } from './resolve.js';

export const DEFAULT_DEPTH = 3;

/**
 * Ceiling on distinct effects tracked per trace node. Reached only by hub files
 * that touch most of a large codebase — exactly the nodes whose output nobody
 * could read anyway.
 */
const MAX_EFFECTS_PER_NODE = 60;

export interface TraceResult {
  effects: Effect[];
  unknowns: Unknown[];
}

interface ImportBinding {
  /** The module specifier as written. */
  specifier: string;
  /** The name inside that module. Differs from the local name when aliased. */
  importedName: string;
}

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Parses each file at most once for the life of a scan. */
export class SourceCache {
  private cache = new Map<string, ts.SourceFile | null>();
  constructor(private root: string) {}

  get(repoPath: string): ts.SourceFile | null {
    const hit = this.cache.get(repoPath);
    if (hit !== undefined) return hit;

    const full = path.join(this.root, ...repoPath.split('/'));
    try {
      const text = fs.readFileSync(full, 'utf8');
      const sf = ts.createSourceFile(repoPath, text, ts.ScriptTarget.Latest, true, scriptKindFor(repoPath));
      this.cache.set(repoPath, sf);
      return sf;
    } catch {
      this.cache.set(repoPath, null);
      return null;
    }
  }
}

/** local name -> where it came from. Covers named, default and namespace imports. */
function collectImports(sourceFile: ts.SourceFile): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) continue;

    // Type-only imports never execute, so they cannot cause an effect.
    if (clause.isTypeOnly) continue;

    if (clause.name) {
      bindings.set(clause.name.text, { specifier, importedName: 'default' });
    }

    if (clause.namedBindings) {
      if (ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (element.isTypeOnly) continue;
          bindings.set(element.name.text, {
            specifier,
            importedName: (element.propertyName ?? element.name).text,
          });
        }
      } else if (ts.isNamespaceImport(clause.namedBindings)) {
        bindings.set(clause.namedBindings.name.text, { specifier, importedName: '*' });
      }
    }
  }

  return bindings;
}

/**
 * Identifiers used in call position within a range.
 *
 * Both `doThing()` and `obj.doThing()` count — for a namespace import the
 * meaningful name is the property, not the namespace object.
 */
function calledNames(sourceFile: ts.SourceFile, range?: { pos: number; end: number }): Set<string> {
  const names = new Set<string>();

  const inRange = (node: ts.Node) =>
    !range || (node.getStart(sourceFile) >= range.pos && node.getEnd() <= range.end);

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && inRange(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee)) names.add(callee.text);
      else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
        names.add(callee.expression.text);
        names.add(callee.name.text);
      }
    }
    // JSX elements execute their components, so <Dashboard /> is a call too.
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && inRange(node)) {
      if (ts.isIdentifier(node.tagName)) names.add(node.tagName.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return names;
}

/** Span of a top-level declaration by exported or local name. */
function rangeOfSymbol(
  sourceFile: ts.SourceFile,
  name: string,
): { pos: number; end: number } | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return { pos: statement.getStart(sourceFile), end: statement.getEnd() };
    }
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) {
          return { pos: statement.getStart(sourceFile), end: statement.getEnd() };
        }
      }
    }
    if (ts.isClassDeclaration(statement) && statement.name?.text === name) {
      return { pos: statement.getStart(sourceFile), end: statement.getEnd() };
    }
  }
  return undefined;
}

/**
 * Follow a symbol through re-exports to the file that actually declares it.
 *
 * Barrel files — `lib/auth/index.ts` containing nothing but `export * from
 * "./admin"` — are the most common module pattern in TypeScript and they used to
 * end every trace that touched one. Importing `withAdmin` from `@/lib/auth`
 * landed on a file with no declarations, the trace stopped, and the tool then
 * reported that a properly protected admin endpoint had no authorisation check.
 *
 * Confidently wrong, which is the worst thing this tool can be.
 *
 * Barrel hops get their own budget rather than spending call depth, because
 * passing through a re-export is not a step in the program's logic.
 */
function findDeclaringFile(
  context: TraceContext,
  repoPath: string,
  name: string,
  budget = 5,
  seen: Set<string> = new Set(),
): { file: string; range: { pos: number; end: number } } | null {
  const key = `${repoPath}#${name}`;

  const cached = context.declarations.get(key);
  if (cached !== undefined) return cached;

  if (seen.has(key)) return null; // barrels can be circular
  seen.add(key);

  const remember = (value: { file: string; range: { pos: number; end: number } } | null) => {
    context.declarations.set(key, value);
    return value;
  };

  const sourceFile = context.sources.get(repoPath);
  if (!sourceFile) return remember(null);

  const local = rangeOfSymbol(sourceFile, name);
  if (local) return remember({ file: repoPath, range: local });
  if (budget <= 0) return null; // budget-limited: do not cache a partial answer

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const resolved = context.resolver.resolve(repoPath, statement.moduleSpecifier.text);
    if (typeof resolved !== 'string') continue;

    if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      // export { withAdmin } from './admin'  /  export { a as b } from './x'
      for (const element of statement.exportClause.elements) {
        if (element.name.text !== name) continue;
        const originalName = (element.propertyName ?? element.name).text;
        const found = findDeclaringFile(context, resolved, originalName, budget - 1, seen);
        if (found) return remember(found);
      }
    } else if (!statement.exportClause) {
      // export * from './admin'
      const found = findDeclaringFile(context, resolved, name, budget - 1, seen);
      if (found) return remember(found);
    }
  }

  return remember(null);
}

export interface TraceContext {
  root: string;
  sources: SourceCache;
  resolver: Resolver;
  /** Memo across the whole scan — helpers get called from many places. */
  memo: Map<string, TraceResult>;
  /**
   * Where each symbol is declared, cached.
   *
   * Barrel resolution walks every statement of every file it passes through,
   * and it runs for every imported symbol at every node. Uncached it dominated
   * the whole scan: a 19-route project went from 250ms to 10 seconds and a
   * monorepo to nearly three minutes. Symbol declarations do not move during a
   * scan, so this is a pure win.
   */
  declarations: Map<string, { file: string; range: { pos: number; end: number } } | null>;
  maxDepth: number;
}

export function createTraceContext(
  root: string,
  resolver: Resolver,
  maxDepth = DEFAULT_DEPTH,
): TraceContext {
  return {
    root,
    sources: new SourceCache(root),
    resolver,
    memo: new Map(),
    declarations: new Map(),
    maxDepth,
  };
}

/**
 * Collect effects reachable from `range` in `repoPath`, following local imports.
 *
 * `seen` guards against cycles within a single trace; two files importing each
 * other is common and must not hang.
 */
export function traceFrom(
  context: TraceContext,
  repoPath: string,
  range: { pos: number; end: number } | undefined,
  depth: number,
  seen: Set<string> = new Set(),
): TraceResult {
  const memoKey = `${repoPath}#${range ? `${range.pos}-${range.end}` : 'whole'}#${depth}`;
  const memoised = context.memo.get(memoKey);
  if (memoised) return memoised;
  if (seen.has(memoKey)) return { effects: [], unknowns: [] };
  seen.add(memoKey);

  const sourceFile = context.sources.get(repoPath);
  if (!sourceFile) {
    return {
      effects: [],
      unknowns: [
        {
          reason: 'parse-failed',
          detail: 'We could not read this file. That is our bug, not a problem with your code.',
          source: { file: repoPath, line: 1 },
        },
      ],
    };
  }

  /**
   * Accumulate into maps rather than arrays.
   *
   * The obvious version — push everything into an array, dedupe at the end —
   * is quadratic on a large repo. Every node merges its children's full effect
   * lists, so a shared helper's effects get copied and re-deduped once per
   * ancestor. On dub that took 57 seconds. Keying by identity as we go makes
   * each merge a set union instead.
   */
  const effectMap = new Map<string, Effect>();
  const unknownMap = new Map<string, Unknown>();

  const addEffect = (effect: Effect) => {
    // A behaviour with hundreds of distinct effects is unreadable, and merging
    // those sets up through every ancestor is what made a large monorepo take a
    // minute. Capping bounds the cost and costs nothing a human would have read.
    if (effectMap.size >= MAX_EFFECTS_PER_NODE) return;
    const key = `${effect.kind}::${effect.description}`;
    if (!effectMap.has(key)) effectMap.set(key, effect);
  };
  const addUnknown = (unknown: Unknown) => {
    const key = `${unknown.reason}::${unknown.detail}`;
    if (!unknownMap.has(key)) unknownMap.set(key, unknown);
  };

  // Effects written directly in this range.
  const direct = detectEffects(sourceFile, repoPath, range);
  direct.effects.forEach(addEffect);
  direct.unknowns.forEach(addUnknown);

  if (depth > 0) {
    const imports = collectImports(sourceFile);
    const called = calledNames(sourceFile, range);

    for (const localName of called) {
      const binding = imports.get(localName);
      if (!binding) continue;

      const resolved = context.resolver.resolve(repoPath, binding.specifier);

      // Someone else's library. An expected boundary — deliberately NOT
      // reported as an unknown, because "we can't see inside Stripe" on every
      // behaviour would be noise that trains people to ignore the warnings.
      if (resolved === 'third-party') continue;

      if (resolved === null) {
        addUnknown({
          reason: 'unsupported',
          detail: `We could not resolve the import "${binding.specifier}", so anything it does is invisible to us.`,
          source: { file: repoPath, line: 1 },
        });
        continue;
      }

      if (!context.sources.get(resolved)) continue;

      // A namespace import gives no single symbol to scope to, so the whole
      // module is in scope. Otherwise follow the symbol to wherever it is
      // actually declared, which may be several barrel files away.
      let targetFile = resolved;
      let targetRange: { pos: number; end: number } | undefined;

      if (binding.importedName !== '*') {
        const declaring = findDeclaringFile(context, resolved, binding.importedName);
        if (declaring) {
          targetFile = declaring.file;
          targetRange = declaring.range;
        }
      }

      const nested = traceFrom(context, targetFile, targetRange, depth - 1, seen);
      nested.effects.forEach(addEffect);
      nested.unknowns.forEach(addUnknown);
    }
  }

  const result: TraceResult = {
    effects: [...effectMap.values()],
    unknowns: [...unknownMap.values()],
  };
  context.memo.set(memoKey, result);
  return result;
}
