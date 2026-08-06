/**
 * Assembling behaviours: trigger + effects.
 *
 * Scoping matters more than it looks. utils/auth-helpers/server.ts holds eleven
 * separate server actions; attributing every effect in that file to all eleven
 * would produce a map that is confidently wrong. So a server action is scanned
 * within its own function body, while a page or route file — which has one
 * entry point — is scanned whole.
 *
 * NOT YET DONE: following imports. Effects that live in a helper file are not
 * attributed to the behaviour that calls it. That is the next piece of work and
 * until it lands, a page whose logic sits in components will look emptier than
 * it is. The UI must say so rather than implying the behaviour is effect-free.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import type { Behaviour, Effect, Trigger, Unknown } from '../model.js';
import { detectEffects } from './effects.js';

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Find an exported function by name and return the span of its body. */
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

/** Human-readable title. This is the sentence a founder would actually say. */
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

/** Stable across scans so drift can be diffed later. */
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

export function buildBehaviours(root: string, triggers: Trigger[]): Behaviour[] {
  // One file is often home to many triggers; parse each exactly once.
  const parsed = new Map<string, ts.SourceFile | null>();

  const sourceFor = (repoPath: string): ts.SourceFile | null => {
    if (parsed.has(repoPath)) return parsed.get(repoPath)!;
    const full = path.join(root, ...repoPath.split('/'));
    try {
      const text = fs.readFileSync(full, 'utf8');
      const sf = ts.createSourceFile(repoPath, text, ts.ScriptTarget.Latest, true, scriptKindFor(repoPath));
      parsed.set(repoPath, sf);
      return sf;
    } catch {
      parsed.set(repoPath, null);
      return null;
    }
  };

  const behaviours: Behaviour[] = [];

  for (const trigger of triggers) {
    const sourceFile = sourceFor(trigger.source.file);

    let effects: Effect[] = [];
    let unknowns: Unknown[] = [];

    if (!sourceFile) {
      unknowns = [
        {
          reason: 'parse-failed',
          detail: 'We could not read the file this comes from. That is our bug.',
          source: trigger.source,
        },
      ];
    } else {
      // Server actions share a file with their siblings, so scope to the one
      // function. Everything else owns its file.
      const range =
        trigger.kind === 'server-action' && trigger.exportName
          ? rangeOfExportedFunction(sourceFile, trigger.exportName)
          : undefined;

      const found = detectEffects(sourceFile, trigger.source.file, range);
      effects = found.effects;
      unknowns = found.unknowns;
    }

    behaviours.push({
      id: idFor(trigger),
      title: titleFor(trigger),
      trigger,
      steps: [],
      effects,
      unknowns,
    });
  }

  return behaviours;
}
