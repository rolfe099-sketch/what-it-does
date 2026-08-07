/**
 * Assembling behaviours: trigger + everything reachable from it.
 *
 * Scoping matters more than it looks. utils/auth-helpers/server.ts holds eleven
 * separate server actions; attributing every effect in that file to all eleven
 * would produce a map that is confidently wrong, which is worse than an empty
 * one. So a server action is traced from its own function body, while a page or
 * route file — which has one entry point — is traced whole.
 */

import ts from 'typescript';
import type { Behaviour, Trigger } from '../model.js';
import { createResolver } from './resolve.js';
import { detectGaps } from './gaps.js';
import type { MiddlewareInfo } from './nextjs/middleware.js';
import { createTraceContext, traceFrom, DEFAULT_DEPTH, type TraceContext } from './trace.js';

/** Span of a top-level declaration by name. */
function rangeOfExportedFunction(
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
  }
  return undefined;
}

/** The sentence a founder would actually say out loud. */
function titleFor(trigger: Trigger): string {
  switch (trigger.kind) {
    case 'page':
      return trigger.urlPath === '/'
        ? 'Someone opens the home page'
        : `Someone opens ${trigger.urlPath}`;
    case 'api-route':
      return `${trigger.methods?.join(' / ')} ${trigger.urlPath}`;
    case 'server-action':
      return `A form calls ${trigger.exportName}()`;
    case 'middleware':
      return 'Every request, before anything else';
  }
}

/** Stable across scans, so drift can be diffed later. */
function idFor(trigger: Trigger): string {
  switch (trigger.kind) {
    case 'server-action':
      return `action:${trigger.source.file}#${trigger.exportName}`;
    case 'api-route':
      return `route:${trigger.methods?.join(',')} ${trigger.urlPath}`;
    case 'middleware':
      return 'middleware';
    default:
      return `page:${trigger.urlPath}`;
  }
}

export interface BuildOptions {
  /** How many import hops to follow. Deeper is slower and rarely more useful. */
  depth?: number;
}

export function buildBehaviours(
  root: string,
  triggers: Trigger[],
  middleware: MiddlewareInfo,
  options: BuildOptions = {},
): { behaviours: Behaviour[]; context: TraceContext } {
  const resolver = createResolver(root);
  const context = createTraceContext(root, resolver, options.depth ?? DEFAULT_DEPTH);

  // Middleware coverage is the main innocent explanation for a missing auth
  // check, so gap detection needs to know which paths it actually runs on.
  const gapContext = { middleware };

  const behaviours: Behaviour[] = triggers.map((trigger) => {
    const sourceFile = context.sources.get(trigger.source.file);

    // Server actions share a file with their siblings, so scope to the one
    // function. Everything else owns its file.
    const range =
      sourceFile && trigger.kind === 'server-action' && trigger.exportName
        ? rangeOfExportedFunction(sourceFile, trigger.exportName)
        : undefined;

    const traced = traceFrom(context, trigger.source.file, range, context.maxDepth);

    const behaviour: Behaviour = {
      id: idFor(trigger),
      title: titleFor(trigger),
      trigger,
      steps: [],
      effects: traced.effects,
      unknowns: traced.unknowns,
      gaps: [],
    };

    behaviour.gaps = detectGaps(behaviour, gapContext);
    return behaviour;
  });

  return { behaviours, context };
}
