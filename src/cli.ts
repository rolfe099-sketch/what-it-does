#!/usr/bin/env node
/**
 * Project Eriksen CLI.
 *
 * Everything runs locally. No network calls, no telemetry, no account. The code
 * being scanned never leaves the machine — that is the product's whole position,
 * so it is enforced here rather than promised in marketing copy.
 */

import * as path from 'node:path';
import { detectNextJs, findEntryPoints } from './extract/nextjs/entrypoints.js';
import { UNKNOWN_GUIDANCE, type Trigger } from './model.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const ACCENT = '\x1b[38;5;173m';

function heading(text: string) {
  console.log(`\n${BOLD}${text}${RESET}`);
}

function describeTrigger(trigger: Trigger): string {
  switch (trigger.kind) {
    case 'page':
      return `Someone opens ${ACCENT}${trigger.urlPath}${RESET}`;
    case 'api-route':
      return `${ACCENT}${trigger.methods?.join(', ')}${RESET} ${trigger.urlPath}`;
    case 'server-action':
      return `A form calls ${ACCENT}${trigger.exportName}()${RESET}`;
    case 'middleware':
      return `Runs before every matching request`;
  }
}

function scan(target: string) {
  const root = path.resolve(target);
  console.log(`${DIM}Scanning ${root}${RESET}`);

  const detected = detectNextJs(root);
  if (!detected.isNext) {
    console.error(`\n${BOLD}Not a Next.js project.${RESET} ${detected.reason}`);
    console.error(
      `${DIM}Only Next.js is supported today. Other frameworks are extractors we have not written yet.${RESET}`,
    );
    process.exit(1);
  }

  const started = Date.now();
  const { appDir, triggers, skipped } = findEntryPoints(root);
  const elapsed = Date.now() - started;

  if (!appDir) {
    console.error(`\n${BOLD}No app directory found.${RESET}`);
    console.error(
      `${DIM}This looks like a Pages Router project. We only read the App Router so far.${RESET}`,
    );
    process.exit(1);
  }

  console.log(`${DIM}Next.js ${detected.version} · app router at ${appDir} · ${elapsed}ms${RESET}`);

  const byKind = {
    page: triggers.filter((t) => t.kind === 'page'),
    'api-route': triggers.filter((t) => t.kind === 'api-route'),
    'server-action': triggers.filter((t) => t.kind === 'server-action'),
    middleware: triggers.filter((t) => t.kind === 'middleware'),
  };

  heading(`${triggers.length} ways into this application`);

  const sections: [string, Trigger[]][] = [
    ['Pages people can visit', byKind.page],
    ['Endpoints something can call', byKind['api-route']],
    ['Actions forms can trigger', byKind['server-action']],
    ['Runs on every request', byKind.middleware],
  ];

  for (const [label, list] of sections) {
    if (list.length === 0) continue;
    heading(`${label} ${DIM}(${list.length})${RESET}`);
    for (const trigger of [...list].sort((a, b) => a.urlPath.localeCompare(b.urlPath))) {
      console.log(`  ${describeTrigger(trigger)}`);
      console.log(`    ${DIM}${trigger.source.file}:${trigger.source.line}${RESET}`);
    }
  }

  // Unknowns are reported, never swallowed. A map that quietly omits what it
  // could not read is worse than no map, because someone will act on it.
  if (skipped.length > 0) {
    heading(`${skipped.length} things we could not read`);
    for (const unknown of skipped) {
      const guidance = UNKNOWN_GUIDANCE[unknown.reason];
      console.log(`  ${unknown.detail}`);
      console.log(`    ${DIM}${unknown.source.file}:${unknown.source.line} — ${guidance.action}${RESET}`);
    }
  }

  console.log('');
}

const [command, target] = process.argv.slice(2);

if (command === 'scan') {
  scan(target ?? process.cwd());
} else {
  console.log(`
${BOLD}eriksen${RESET} — shows you what software you didn't write actually does

  ${BOLD}eriksen scan${RESET} [path]    Find every way into an application

Everything runs locally. Your code never leaves this machine.
`);
}
