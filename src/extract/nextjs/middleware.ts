/**
 * Middleware coverage.
 *
 * Next.js middleware can protect a route invisibly, which is why every
 * authorisation finding currently softens to "this project has middleware, it
 * might be doing the check". That hedge is honest but blunt: applied to every
 * route, it weakens real findings and excuses none of them specifically.
 *
 * The matcher tells us which paths middleware actually runs on. Knowing that
 * turns one blanket caveat into two precise statements:
 *
 *   covered      "middleware runs here and may be doing the check"
 *   not covered  "middleware exists but does NOT run on this path"
 *
 * The second is a materially stronger finding, and it is the one worth reading.
 */

import ts from 'typescript';

export interface MiddlewareInfo {
  present: boolean;
  /**
   * Matcher patterns as written. `null` means middleware exists but declares no
   * matcher, which in Next.js means it runs on every request.
   */
  matchers: string[] | null;
}

export const NO_MIDDLEWARE: MiddlewareInfo = { present: false, matchers: [] };

/** Pull `export const config = { matcher: ... }` out of a middleware file. */
export function parseMiddlewareConfig(sourceFile: ts.SourceFile): string[] | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = (ts.getModifiers(statement) ?? []).some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!exported) continue;

    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== 'config') continue;
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;

      for (const property of decl.initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        if (!ts.isIdentifier(property.name) || property.name.text !== 'matcher') continue;

        const value = property.initializer;

        if (ts.isStringLiteral(value)) return [value.text];

        if (ts.isArrayLiteralExpression(value)) {
          const matchers: string[] = [];
          for (const element of value.elements) {
            if (ts.isStringLiteral(element)) {
              matchers.push(element.text);
            } else if (ts.isObjectLiteralExpression(element)) {
              // { source: '/api/:path*', missing: [...] } — the conditions are
              // request-time, so only the path is knowable statically.
              for (const prop of element.properties) {
                if (
                  ts.isPropertyAssignment(prop) &&
                  ts.isIdentifier(prop.name) &&
                  prop.name.text === 'source' &&
                  ts.isStringLiteral(prop.initializer)
                ) {
                  matchers.push(prop.initializer.text);
                }
              }
            }
          }
          return matchers.length > 0 ? matchers : null;
        }

        // A computed matcher cannot be read statically. Treat it as "runs
        // everywhere", which is the assumption that avoids false accusations.
        return null;
      }

      // config exists but declares no matcher: middleware runs on everything.
      return null;
    }
  }

  // No config export at all: middleware runs on everything.
  return null;
}

/**
 * Turn a Next.js matcher into a testable expression.
 *
 * Matchers are path-to-regexp with inline regex allowed, so both of these are
 * legal and both must work:
 *
 *   '/dashboard/:path*'
 *   '/((?!api|_next/static|favicon.ico).*)'
 *
 * The named-parameter substitutions leave raw regex untouched, so one converter
 * handles both forms.
 */
export function matcherToRegExp(matcher: string): RegExp | null {
  try {
    let source = matcher;
    source = source.replace(/\/:[A-Za-z0-9_]+\*/g, '(?:/.*)?'); // /:path*  — zero or more
    source = source.replace(/\/:[A-Za-z0-9_]+\+/g, '/.+'); // /:path+  — one or more
    source = source.replace(/:[A-Za-z0-9_]+/g, '[^/]+'); // /:id     — one segment
    return new RegExp(`^${source}$`);
  } catch {
    // A matcher we cannot compile is treated as unknown by the caller rather
    // than crashing the scan.
    return null;
  }
}

/**
 * Make a route path testable against a matcher.
 * Our paths carry Next.js dynamic segments; matchers expect concrete URLs.
 */
function concreteForm(urlPath: string): string {
  return urlPath
    .replace(/\[\.\.\.[^\]]+\]/g, 'a/b') // catch-all [...slug]
    .replace(/\[[^\]]+\]/g, 'x'); // single [id]
}

/**
 * Does middleware run on this path?
 *
 * Returns `null` when it cannot be determined — an uncompilable matcher, for
 * instance. Callers must treat null as "assume covered", because assuming
 * otherwise turns an unknown into an accusation.
 */
export function middlewareCovers(info: MiddlewareInfo, urlPath: string): boolean | null {
  if (!info.present) return false;
  if (info.matchers === null) return true; // no matcher means every request

  const path = concreteForm(urlPath);
  let anyUnreadable = false;

  for (const matcher of info.matchers) {
    const regex = matcherToRegExp(matcher);
    if (!regex) {
      anyUnreadable = true;
      continue;
    }
    if (regex.test(path)) return true;
  }

  return anyUnreadable ? null : false;
}
