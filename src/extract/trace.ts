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

export interface TraceContext {
  root: string;
  sources: SourceCache;
  resolver: Resolver;
  /** Memo across the whole scan — helpers get called from many places. */
  memo: Map<string, TraceResult>;
  maxDepth: number;
}

export function createTraceContext(
  root: string,
  resolver: Resolver,
  maxDepth = DEFAULT_DEPTH,
): TraceContext {
  return { root, sources: new SourceCache(root), resolver, memo: new Map(), maxDepth };
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

  // Effects written directly in this range.
  const direct = detectEffects(sourceFile, repoPath, range);
  const effects: Effect[] = [...direct.effects];
  const unknowns: Unknown[] = [...direct.unknowns];

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
        unknowns.push({
          reason: 'unsupported',
          detail: `We could not resolve the import "${binding.specifier}", so anything it does is invisible to us.`,
          source: { file: repoPath, line: 1 },
        });
        continue;
      }

      const targetSource = context.sources.get(resolved);
      if (!targetSource) continue;

      // A namespace import gives no single symbol to scope to, so the whole
      // module is in scope.
      const targetRange =
        binding.importedName === '*' ? undefined : rangeOfSymbol(targetSource, binding.importedName);

      const nested = traceFrom(context, resolved, targetRange, depth - 1, seen);
      effects.push(...nested.effects);
      unknowns.push(...nested.unknowns);
    }
  }

  const result: TraceResult = { effects: dedupe(effects), unknowns: dedupeUnknowns(unknowns) };
  context.memo.set(memoKey, result);
  return result;
}

function dedupe(effects: Effect[]): Effect[] {
  const byKey = new Map<string, Effect>();
  for (const effect of effects) {
    const key = `${effect.kind}::${effect.description}`;
    if (!byKey.has(key)) byKey.set(key, effect);
  }
  return [...byKey.values()];
}

function dedupeUnknowns(unknowns: Unknown[]): Unknown[] {
  const byKey = new Map<string, Unknown>();
  for (const unknown of unknowns) {
    const key = `${unknown.reason}::${unknown.detail}`;
    if (!byKey.has(key)) byKey.set(key, unknown);
  }
  return [...byKey.values()];
}
