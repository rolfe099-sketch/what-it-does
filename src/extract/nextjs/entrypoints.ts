/**
 * Next.js App Router entry-point detection.
 *
 * This is the cheapest and most reliable part of the whole system, and it is why
 * Next.js is the first target: App Router entry points are FILESYSTEM
 * CONVENTIONS, not registrations buried in code. Finding triggers is directory
 * traversal plus a handful of AST checks — no heuristics, no guessing.
 *
 *   app/page.tsx                    ->  GET /
 *   app/dashboard/page.tsx          ->  GET /dashboard
 *   app/(marketing)/about/page.tsx  ->  GET /about        (route group stripped)
 *   app/api/users/route.ts          ->  whichever verbs it exports
 *   app/blog/[slug]/page.tsx        ->  GET /blog/[slug]
 *   middleware.ts                   ->  runs before matching requests
 *   any file with 'use server'      ->  server actions
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import type { SourceRef, Trigger, Unknown } from '../../model.js';

/** Directories that never contain application entry points. */
const IGNORED_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build', 'out',
  '.turbo', '.vercel', 'coverage', '.cache',
]);

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

/** HTTP verbs Next.js recognises as route handler exports. */
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export interface EntryPointScan {
  /** Where the app directory lives, repo-relative. */
  appDir: string | null;
  triggers: Trigger[];
  skipped: Unknown[];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Is this a Next.js project at all? Checked before anything expensive runs. */
export function detectNextJs(root: string): { isNext: boolean; version?: string; reason?: string } {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { isNext: false, reason: 'No package.json found.' };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const version = pkg.dependencies?.next ?? pkg.devDependencies?.next;
    if (!version) return { isNext: false, reason: 'No "next" dependency in package.json.' };
    return { isNext: true, version };
  } catch {
    return { isNext: false, reason: 'package.json could not be parsed.' };
  }
}

/** App Router lives at app/ or src/app/. Nothing else is valid. */
function findAppDir(root: string): string | null {
  for (const candidate of ['app', path.join('src', 'app')]) {
    const full = path.join(root, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      return candidate.split(path.sep).join('/');
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// URL path derivation
// ---------------------------------------------------------------------------

/**
 * Turn a directory path inside app/ into the URL it serves.
 *
 * Segments that do not appear in the URL:
 *   (group)   route groups — organisational only
 *   @slot     parallel routes
 *   _private  folders opted out of routing
 */
export function urlPathFromDir(relativeDir: string): string {
  const segments = relativeDir
    .split('/')
    .filter(Boolean)
    .filter((segment) => {
      if (segment.startsWith('(') && segment.endsWith(')')) return false;
      if (segment.startsWith('@')) return false;
      if (segment.startsWith('_')) return false;
      return true;
    });

  return segments.length === 0 ? '/' : '/' + segments.join('/');
}

/** True if any path segment is a private folder, which excludes it from routing. */
function isPrivatePath(relativeDir: string): boolean {
  return relativeDir.split('/').some((s) => s.startsWith('_'));
}

// ---------------------------------------------------------------------------
// Source parsing
//
// createSourceFile rather than a full Program: we only need syntax here, not
// types, and it is roughly two orders of magnitude cheaper. Type information
// becomes necessary later for call-graph tracing, not for finding triggers.
// ---------------------------------------------------------------------------

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file));
}

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

interface RouteExports {
  methods: { method: string; line: number }[];
  /**
   * `export * from './other'` — the verbs are real but live in another file.
   * This is resolvable; we just do not follow modules yet. That makes it OUR
   * limitation ('unsupported'), not genuinely opaque code ('dynamic'), and the
   * distinction is exactly what the reason codes exist to preserve.
   */
  wildcardReexport?: { module: string; line: number };
}

/**
 * Which HTTP verbs does a route file export?
 *
 * Real codebases export handlers in at least four shapes, and the last two are
 * the ones every naive implementation misses:
 *
 *   export async function GET() {}                       function declaration
 *   export const POST = withAuth(handler)                variable, any initialiser
 *   export { handler as GET, handler as POST }           aliased export
 *   export { GET } from './elsewhere'                    re-export
 */
function exportedHttpMethods(sourceFile: ts.SourceFile): RouteExports {
  const methods: { method: string; line: number }[] = [];
  let wildcardReexport: RouteExports['wildcardReexport'];

  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const statement of sourceFile.statements) {
    // export async function GET() {}
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      const name = statement.name.text;
      if (HTTP_METHODS.includes(name)) methods.push({ method: name, line: lineOf(sourceFile, statement) });
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const decl of statement.declarationList.declarations) {
        // export const POST = anything
        if (ts.isIdentifier(decl.name) && HTTP_METHODS.includes(decl.name.text)) {
          methods.push({ method: decl.name.text, line: lineOf(sourceFile, statement) });
        }

        // export const { POST } = serve(...)  — destructured from a factory.
        // The BOUND name is what gets exported, so `{ POST: handler }` exports
        // `handler` and is correctly ignored here.
        if (ts.isObjectBindingPattern(decl.name)) {
          for (const element of decl.name.elements) {
            if (ts.isIdentifier(element.name) && HTTP_METHODS.includes(element.name.text)) {
              methods.push({ method: element.name.text, line: lineOf(sourceFile, statement) });
            }
          }
        }
      }
    }

    if (ts.isExportDeclaration(statement)) {
      // export { handler as GET }  /  export { GET } from './x'
      // The EXPORTED name is what Next.js binds to, so `name` is what matters
      // here and `propertyName` (the local alias source) is irrelevant.
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (HTTP_METHODS.includes(element.name.text)) {
            methods.push({ method: element.name.text, line: lineOf(sourceFile, statement) });
          }
        }
      }

      // export * from './x' — verbs exist but we cannot see them from here.
      if (!statement.exportClause && statement.moduleSpecifier) {
        const spec = statement.moduleSpecifier;
        wildcardReexport = {
          module: ts.isStringLiteral(spec) ? spec.text : 'another file',
          line: lineOf(sourceFile, statement),
        };
      }
    }
  }

  return { methods, wildcardReexport };
}

/** Does this file carry a file-level 'use server' directive? */
function hasUseServerDirective(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) break; // directives must come first
    const expr = statement.expression;
    if (ts.isStringLiteral(expr) && expr.text === 'use server') return true;
    if (!ts.isStringLiteral(expr)) break;
  }
  return false;
}

/** Exported functions in a 'use server' file are server actions. */
function exportedFunctionNames(sourceFile: ts.SourceFile): { name: string; line: number }[] {
  const found: { name: string; line: number }[] = [];

  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      found.push({ name: statement.name.text, line: lineOf(sourceFile, statement) });
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          found.push({ name: decl.name.text, line: lineOf(sourceFile, statement) });
        }
      }
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

function* walk(dir: string, root: string): Generator<string> {
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
      yield* walk(full, root);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

const toRepoPath = (root: string, full: string) =>
  path.relative(root, full).split(path.sep).join('/');

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

export function findEntryPoints(root: string): EntryPointScan {
  const triggers: Trigger[] = [];
  const skipped: Unknown[] = [];
  const appDir = findAppDir(root);

  const readOrSkip = (fullPath: string): { text: string; sourceFile: ts.SourceFile } | null => {
    const repoPath = toRepoPath(root, fullPath);
    try {
      const text = fs.readFileSync(fullPath, 'utf8');
      return { text, sourceFile: parse(repoPath, text) };
    } catch (error) {
      skipped.push({
        reason: 'parse-failed',
        detail: `We failed to read this file. That is our bug, not a problem with your code. (${(error as Error).message})`,
        source: { file: repoPath, line: 1 },
      });
      return null;
    }
  };

  // --- Pages and route handlers, from the app directory ------------------
  if (appDir) {
    const appRoot = path.join(root, ...appDir.split('/'));

    for (const fullPath of walk(appRoot, root)) {
      const repoPath = toRepoPath(root, fullPath);
      const ext = path.extname(fullPath);
      if (!CODE_EXTENSIONS.has(ext)) continue;

      const base = path.basename(fullPath, ext);
      const relativeDir = path
        .relative(appRoot, path.dirname(fullPath))
        .split(path.sep)
        .join('/');

      if (isPrivatePath(relativeDir)) continue;

      if (base === 'page') {
        triggers.push({
          kind: 'page',
          urlPath: urlPathFromDir(relativeDir),
          source: { file: repoPath, line: 1 },
        });
        continue;
      }

      if (base === 'route') {
        const parsed = readOrSkip(fullPath);
        if (!parsed) continue;
        const { methods, wildcardReexport } = exportedHttpMethods(parsed.sourceFile);

        if (methods.length > 0) {
          triggers.push({
            kind: 'api-route',
            urlPath: urlPathFromDir(relativeDir),
            methods: methods.map((m) => m.method),
            source: { file: repoPath, line: methods[0].line },
          });
          continue;
        }

        if (wildcardReexport) {
          skipped.push({
            reason: 'unsupported',
            detail: `This endpoint re-exports everything from "${wildcardReexport.module}". We do not follow imports into other files yet, so we cannot tell you which methods it handles.`,
            source: { file: repoPath, line: wildcardReexport.line },
          });
          continue;
        }

        // Exports nothing we recognise. Genuinely opaque rather than our gap.
        skipped.push({
          reason: 'dynamic',
          detail:
            'This route file exports no recognised HTTP method, so we cannot tell what it responds to.',
          source: { file: repoPath, line: 1 },
        });
      }
    }
  }

  // --- Middleware, which sits at the project root, not inside app/ --------
  for (const candidate of ['middleware.ts', 'middleware.js', 'src/middleware.ts', 'src/middleware.js']) {
    const full = path.join(root, ...candidate.split('/'));
    if (!fs.existsSync(full)) continue;
    triggers.push({
      kind: 'middleware',
      urlPath: '*',
      source: { file: candidate, line: 1 },
    });
    break;
  }

  // --- Server actions, which can live anywhere -----------------------------
  for (const fullPath of walk(root, root)) {
    const ext = path.extname(fullPath);
    if (!CODE_EXTENSIONS.has(ext)) continue;

    const repoPath = toRepoPath(root, fullPath);
    // Cheap pre-filter: reading every file is fine, parsing every file is not.
    let text: string;
    try {
      text = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    if (!text.includes('use server')) continue;

    const sourceFile = parse(repoPath, text);
    if (!hasUseServerDirective(sourceFile)) continue;

    for (const fn of exportedFunctionNames(sourceFile)) {
      triggers.push({
        kind: 'server-action',
        urlPath: '',
        exportName: fn.name,
        source: { file: repoPath, line: fn.line },
      });
    }
  }

  return { appDir, triggers, skipped };
}
