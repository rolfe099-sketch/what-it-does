/**
 * Supabase Edge Functions.
 *
 * The third framework, and the one the audience actually has. Lovable and Bolt
 * emit a Vite React front end with Supabase behind it — so for a large share
 * of people who built a product by describing it to an assistant, THIS is
 * where their server-side code lives. Scanning their front end correctly and
 * then saying nothing about their backend is answering the wrong question well.
 *
 * Routing is a filesystem convention again, which is why this is cheap:
 *
 *   supabase/functions/hello-world/index.ts  ->  /functions/v1/hello-world
 *   supabase/functions/_shared/cors.ts       ->  not a function; shared code
 *
 * ── The thing that makes this extractor honest ──────────────────────────────
 *
 * `supabase/config.toml` carries a per-function `verify_jwt` flag:
 *
 *   [functions.image-manipulation]
 *   verify_jwt = true
 *
 * When it is true — which is the DEFAULT — the platform rejects any request
 * without a valid JWT before a line of the function runs. That is an
 * authorisation check living entirely outside the function body, and a scanner
 * that cannot see it would report every properly-protected function as having
 * no check on who is asking. Precisely the failure that produced 106 false
 * findings on a real codebase the first time this tool met Next.js middleware.
 *
 * So the flag is read and expressed as MiddlewareInfo, which the existing gap
 * logic already understands: a covered path gets the softened claim, an
 * uncovered one gets the strong claim, and neither is invented here.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import type { Trigger, Unknown } from '../../model.js';
import { NO_MIDDLEWARE, type MiddlewareInfo } from '../nextjs/middleware.js';

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];

/** Supabase serves every function under this prefix. */
export const FUNCTION_PREFIX = '/functions/v1';

export interface SupabaseScan {
  functionsDir: string | null;
  triggers: Trigger[];
  skipped: Unknown[];
  middleware: MiddlewareInfo;
}

export function detectSupabase(root: string): { found: boolean; dir?: string } {
  const candidate = path.join(root, 'supabase', 'functions');
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return { found: true, dir: 'supabase/functions' };
  }
  return { found: false };
}

/**
 * Which directories under functions/ are actually functions.
 *
 * A leading underscore is the Supabase convention for shared code — `_shared`
 * holds the CORS headers half the examples import. Listing it as an endpoint
 * would invent a route that does not exist.
 */
function isFunctionDir(name: string): boolean {
  return !name.startsWith('_') && !name.startsWith('.');
}

function entryFileFor(dir: string): string | null {
  for (const extension of CODE_EXTENSIONS) {
    const full = path.join(dir, 'index' + extension);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/**
 * Per-function `verify_jwt`, read from config.toml.
 *
 * Deliberately not a TOML parser. Only two things are needed — the section
 * header and one boolean — and a dependency to read them would be the largest
 * thing in this project's dependency tree. Anything it cannot parse is left
 * undefined rather than guessed at.
 */
export function readJwtConfig(root: string): Map<string, boolean> {
  const found = new Map<string, boolean>();
  const configPath = path.join(root, 'supabase', 'config.toml');

  let text: string;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch {
    return found;
  }

  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;

    const section = /^\[functions\.([^\]]+)\]$/.exec(line);
    if (section) {
      current = section[1].trim();
      continue;
    }
    if (line.startsWith('[')) {
      current = null; // some other section
      continue;
    }

    if (current) {
      const flag = /^verify_jwt\s*=\s*(true|false)\b/.exec(line);
      if (flag) found.set(current, flag[1] === 'true');
    }
  }

  return found;
}

/**
 * The name of the function that handles requests, and where it starts.
 *
 * Four shapes in the wild, and the two `export default` ones are current —
 * Supabase's own examples use them today, so an extractor that only knew
 * `Deno.serve` would miss the code people are writing right now:
 *
 *   Deno.serve(handler)                                    classic
 *   serve(handler)                                         legacy std/http
 *   export default { fetch: handler }                      current
 *   export default { fetch: withSupabase({...}, handler) } current, wrapped
 */
function findHandler(sourceFile: ts.SourceFile): { line: number; wrappedAuth?: string } | null {
  let result: { line: number; wrappedAuth?: string } | null = null;
  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  /**
   * `withSupabase({ auth: 'user' }, handler)` requires a signed-in user before
   * the handler runs, so it IS an authorisation check — and `auth: 'none'`
   * explicitly is not. Reading the option rather than the function name keeps
   * the two apart.
   */
  const authOptionOf = (call: ts.CallExpression): string | undefined => {
    const first = call.arguments[0];
    if (!first || !ts.isObjectLiteralExpression(first)) return undefined;
    for (const prop of first.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : '';
      if (key !== 'auth') continue;
      if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
        return prop.initializer.text;
      }
    }
    return undefined;
  };

  const visit = (node: ts.Node): void => {
    if (result) return;

    // Deno.serve(...) and a bare serve(...)
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDenoServe =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'Deno' &&
        callee.name.text === 'serve';
      const isBareServe = ts.isIdentifier(callee) && callee.text === 'serve';
      if (isDenoServe || isBareServe) {
        result = { line: lineOf(node) };
        return;
      }
    }

    // export default { fetch: ... }
    if (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) {
      for (const prop of node.expression.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : '';
        if (key !== 'fetch') continue;

        const value = prop.initializer;
        const wrapped =
          ts.isCallExpression(value) &&
          ts.isIdentifier(value.expression) &&
          value.expression.text === 'withSupabase'
            ? authOptionOf(value)
            : undefined;

        result = { line: lineOf(prop), wrappedAuth: wrapped };
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return result;
}

export function findEntryPoints(root: string): SupabaseScan {
  const detected = detectSupabase(root);
  if (!detected.found || !detected.dir) {
    return { functionsDir: null, triggers: [], skipped: [], middleware: NO_MIDDLEWARE };
  }

  const functionsRoot = path.join(root, 'supabase', 'functions');
  const jwt = readJwtConfig(root);
  const triggers: Trigger[] = [];
  const skipped: Unknown[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(functionsRoot, { withFileTypes: true });
  } catch {
    return { functionsDir: detected.dir, triggers: [], skipped: [], middleware: NO_MIDDLEWARE };
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !isFunctionDir(entry.name)) continue;

    const dir = path.join(functionsRoot, entry.name);
    const file = entryFileFor(dir);
    if (!file) {
      skipped.push({
        reason: 'unsupported',
        detail: `The directory "${entry.name}" has no index file, so we could not find the function it holds.`,
        source: { file: `supabase/functions/${entry.name}`, line: 1 },
      });
      continue;
    }

    const repoPath = path.relative(root, file).split(path.sep).join('/');

    let sourceFile: ts.SourceFile;
    try {
      const text = fs.readFileSync(file, 'utf8');
      sourceFile = ts.createSourceFile(repoPath, text, ts.ScriptTarget.Latest, true, scriptKindFor(repoPath));
    } catch (error) {
      skipped.push({
        reason: 'parse-failed',
        detail: `We failed to read this file. That is our bug, not a problem with your code. (${(error as Error).message})`,
        source: { file: repoPath, line: 1 },
      });
      continue;
    }

    const handler = findHandler(sourceFile);
    const urlPath = `${FUNCTION_PREFIX}/${entry.name}`;

    if (!handler) {
      skipped.push({
        reason: 'unsupported',
        detail: `We could not find the request handler in "${entry.name}". We look for Deno.serve, serve, or a default export with a fetch property.`,
        source: { file: repoPath, line: 1 },
      });
      continue;
    }

    /**
     * verify_jwt defaults to TRUE when the function has no entry in
     * config.toml, because that is what the platform does. Assuming the safer
     * default the other way would invent findings against functions that are
     * in fact protected.
     */
    const jwtVerified = jwt.get(entry.name) ?? true;

    /**
     * `withSupabase({ auth: 'user' }, handler)` belongs in the same category as
     * verify_jwt: a wrapper that establishes the caller BEFORE the handler body
     * runs, so nothing inside the body will ever look like a check. Without
     * this, a correctly-protected function drew a confident finding — the
     * option was already being read and then thrown away.
     *
     * `auth: 'none'` is the explicit opposite and must not count. Reading the
     * option rather than the wrapper's name is what keeps them apart.
     */
    const wrapperChecks = handler.wrappedAuth !== undefined && handler.wrappedAuth !== 'none';

    /**
     * Said in the words of the thing that actually does it, so a reader can go
     * and verify the claim. "Middleware runs here" would be a lie — Supabase
     * has no middleware — and a vague hedge would understate a definite check.
     */
    const platformCheck = wrapperChecks
      ? `Checks who is asking — withSupabase requires auth: '${handler.wrappedAuth}' before this runs`
      : jwtVerified
        ? jwt.has(entry.name)
          ? "Checks who is asking — Supabase verifies the caller's token before this runs (verify_jwt = true)"
          : "Checks who is asking — Supabase verifies the caller's token before this runs (verify_jwt defaults to true)"
        : undefined;

    triggers.push({
      kind: 'api-route',
      urlPath,
      // A function answers whatever verb it is sent; nothing declares one.
      methods: ['ANY'],
      platformCheck,
      source: { file: repoPath, line: handler.line },
    });
  }

  /**
   * No middleware. Supabase has no such concept, and saying otherwise would
   * put a sentence about middleware in front of someone who has none. The
   * platform's own check travels on the trigger instead, in its own words.
   */
  return {
    functionsDir: detected.dir,
    triggers,
    skipped,
    middleware: {
      ...NO_MIDDLEWARE,
      absentNote:
        'Supabase runs no gate in front of this function — verify_jwt is false for it in config.toml, so any caller reaches the code.',
    },
  };
}
