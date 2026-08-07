/**
 * Cloudflare Pages Functions.
 *
 * The second framework, and the one that tests whether the architecture claim
 * in the README is true: *"adding a framework means adding an extractor, not
 * rewriting anything."* This file is the whole extractor. Everything downstream
 * — effects, tracing, guards, the graph, the cascade, all five views — works on
 * its output without a line changing, because they all speak Trigger.
 *
 * Like Next.js App Router, routing is a filesystem convention, which is why
 * both are cheap to support:
 *
 *   functions/api/contact.js        ->  /api/contact
 *   functions/api/[id].ts           ->  /api/[id]
 *   functions/api/[[path]].ts       ->  /api/[[path]]      (catch-all)
 *   functions/_middleware.js        ->  runs before matching requests
 *
 * The verb comes from the export name rather than from the file: `onRequestPost`
 * handles POST, and a bare `onRequest` handles everything.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import type { Trigger, Unknown } from '../../model.js';
import { NO_MIDDLEWARE, type MiddlewareInfo } from '../nextjs/middleware.js';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.wrangler', 'coverage']);
const CODE_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.mjs']);

/** `onRequestPost` -> POST. A bare `onRequest` answers every verb. */
const HANDLER = /^onRequest(Get|Post|Put|Patch|Delete|Head|Options)?$/;

export interface CloudflareScan {
  functionsDir: string | null;
  triggers: Trigger[];
  skipped: Unknown[];
  middleware: MiddlewareInfo;
}

export function detectCloudflarePages(root: string): { found: boolean; dir?: string } {
  for (const candidate of ['functions', path.join('src', 'functions')]) {
    const full = path.join(root, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      return { found: true, dir: candidate.split(path.sep).join('/') };
    }
  }
  return { found: false };
}

function* walk(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/**
 * Which verbs does this file answer?
 *
 * Reuses the same four export shapes learned the hard way from Next.js —
 * declaration, variable, aliased export, re-export — because the mistake of
 * only catching the obvious two is framework-independent.
 */
function handlers(sourceFile: ts.SourceFile): { method: string; line: number; declared: string }[] {
  const found: { method: string; line: number; declared: string }[] = [];
  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  // `declared` is the name of the function to scope analysis to, which is not
  // always the export name: `export { handler as onRequestDelete }` answers
  // DELETE but the body to read is called `handler`.
  const record = (name: string, line: number, declared = name) => {
    const match = HANDLER.exec(name);
    if (!match) return;
    found.push({ method: (match[1] ?? 'ANY').toUpperCase(), line, declared });
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      record(statement.name.text, lineOf(statement));
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) record(decl.name.text, lineOf(statement));
        if (ts.isObjectBindingPattern(decl.name)) {
          for (const element of decl.name.elements) {
            if (ts.isIdentifier(element.name)) record(element.name.text, lineOf(statement));
          }
        }
      }
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        record(element.name.text, lineOf(statement), (element.propertyName ?? element.name).text);
      }
    }
  }

  return found;
}

/** functions/api/contact.js -> /api/contact ; index files drop their name. */
export function urlPathFor(relativePath: string): string {
  const withoutExtension = relativePath.replace(/\.(tsx?|jsx?|mjs)$/, '');
  const segments = withoutExtension.split('/').filter(Boolean);
  if (segments[segments.length - 1] === 'index') segments.pop();
  return segments.length === 0 ? '/' : '/' + segments.join('/');
}

export function findEntryPoints(root: string): CloudflareScan {
  const detected = detectCloudflarePages(root);
  if (!detected.found || !detected.dir) {
    return { functionsDir: null, triggers: [], skipped: [], middleware: NO_MIDDLEWARE };
  }

  const functionsRoot = path.join(root, ...detected.dir.split('/'));
  const triggers: Trigger[] = [];
  const skipped: Unknown[] = [];
  // Cloudflare scopes middleware by directory, so a project can have several —
  // one at the root and one under /api is the common shape. They accumulate:
  // taking only the last would silently narrow coverage and turn correct code
  // into a finding.
  const middlewareScopes: string[] = [];

  for (const fullPath of walk(functionsRoot)) {
    const extension = path.extname(fullPath);
    if (!CODE_EXTENSIONS.has(extension)) continue;

    const repoPath = path.relative(root, fullPath).split(path.sep).join('/');
    const relative = path.relative(functionsRoot, fullPath).split(path.sep).join('/');

    let sourceFile: ts.SourceFile;
    try {
      const text = fs.readFileSync(fullPath, 'utf8');
      sourceFile = ts.createSourceFile(repoPath, text, ts.ScriptTarget.Latest, true, scriptKindFor(repoPath));
    } catch (error) {
      skipped.push({
        reason: 'parse-failed',
        detail: `We failed to read this file. That is our bug, not a problem with your code. (${(error as Error).message})`,
        source: { file: repoPath, line: 1 },
      });
      continue;
    }

    const base = path.basename(relative, extension);

    // _middleware runs before matching requests, like Next.js middleware. It has
    // no matcher config — its position in the tree is its scope.
    if (base === '_middleware') {
      const dir = path.dirname(relative);
      const scope = urlPathFor(dir === '.' ? '' : dir);
      middlewareScopes.push(scope === '/' ? '/(.*)' : `${scope}/(.*)`);
      triggers.push({
        kind: 'middleware',
        urlPath: scope === '/' ? '*' : `${scope}/*`,
        source: { file: repoPath, line: 1 },
      });
      continue;
    }

    const found = handlers(sourceFile);
    if (found.length === 0) {
      // A file under functions/ that exports no handler is a helper, not a
      // route. Saying nothing about it is correct — reporting it as unreadable
      // would be noise.
      continue;
    }

    /**
     * One trigger per handler FUNCTION, not per file.
     *
     * A file exporting both onRequestGet and onRequestDelete holds two
     * different behaviours: different bodies, different guards, different
     * consequences. Merging them into one entry meant a guard on the read
     * excused the delete, and the walkthrough showed one function's steps
     * under both verbs. Several exports pointing at the SAME function stay
     * together, because that really is one behaviour answering two verbs.
     */
    const byFunction = new Map<string, typeof found>();
    for (const handler of found) {
      const group = byFunction.get(handler.declared);
      if (group) group.push(handler);
      else byFunction.set(handler.declared, [handler]);
    }

    for (const [declared, group] of byFunction) {
      triggers.push({
        kind: 'api-route',
        urlPath: urlPathFor(relative),
        methods: group.map((h) => h.method),
        exportName: declared,
        source: { file: repoPath, line: group[0].line },
      });
    }
  }

  const middleware: MiddlewareInfo =
    middlewareScopes.length > 0 ? { present: true, matchers: middlewareScopes } : NO_MIDDLEWARE;

  return { functionsDir: detected.dir, triggers, skipped, middleware };
}
