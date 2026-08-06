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
import { buildBehaviours } from './extract/behaviours.js';
import {
  CONSEQUENTIAL_EFFECTS,
  EFFECT_LABELS,
  UNKNOWN_GUIDANCE,
  consequenceScore,
  type Behaviour,
  type EffectKind,
} from './model.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const ACCENT = '\x1b[38;5;173m';
const WARN = '\x1b[38;5;179m';

const heading = (text: string) => console.log(`\n${BOLD}${text}${RESET}`);

/**
 * How many behaviours to show in detail. The map orients; it does not enumerate.
 * The limit exists for large codebases — hiding two items behind a "12 of 14"
 * looks broken rather than considered, so small projects show everything.
 */
const DETAIL_LIMIT = 12;
const SHOW_ALL_BELOW = 16;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function summariseEffects(behaviours: Behaviour[]) {
  const counts = new Map<EffectKind, number>();
  for (const behaviour of behaviours) {
    for (const kind of new Set(behaviour.effects.map((e) => e.kind))) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  // Consequential kinds first — money, deletion and access before everything else.
  return [...counts.entries()].sort((a, b) => {
    const aBig = CONSEQUENTIAL_EFFECTS.has(a[0]) ? 1 : 0;
    const bBig = CONSEQUENTIAL_EFFECTS.has(b[0]) ? 1 : 0;
    if (aBig !== bBig) return bBig - aBig;
    return b[1] - a[1];
  });
}

function printBehaviour(behaviour: Behaviour, index: number) {
  console.log(`\n  ${BOLD}${index}. ${behaviour.title}${RESET}`);
  console.log(`     ${DIM}${behaviour.trigger.source.file}:${behaviour.trigger.source.line}${RESET}`);

  const ordered = [...behaviour.effects].sort((a, b) => {
    const aBig = CONSEQUENTIAL_EFFECTS.has(a.kind) ? 1 : 0;
    const bBig = CONSEQUENTIAL_EFFECTS.has(b.kind) ? 1 : 0;
    return bBig - aBig;
  });

  for (const effect of ordered) {
    const mark = CONSEQUENTIAL_EFFECTS.has(effect.kind) ? `${ACCENT}●${RESET}` : `${DIM}○${RESET}`;
    const hedge = effect.confidence === 'likely' ? ` ${DIM}(probably)${RESET}` : '';
    console.log(`     ${mark} ${effect.description}${hedge}`);
  }

  for (const unknown of behaviour.unknowns) {
    if (UNKNOWN_GUIDANCE[unknown.reason].severity !== 'warning') continue;
    console.log(`     ${WARN}⚠${RESET} ${unknown.detail}`);
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

  if (!appDir) {
    console.error(`\n${BOLD}No app directory found.${RESET}`);
    console.error(
      `${DIM}This looks like a Pages Router project. We only read the App Router so far.${RESET}`,
    );
    process.exit(1);
  }

  const behaviours = buildBehaviours(root, triggers);
  const elapsed = Date.now() - started;

  console.log(`${DIM}Next.js ${detected.version} · app router at ${appDir} · ${elapsed}ms${RESET}`);

  // ---- What the application can do, at a glance -------------------------
  heading(`${behaviours.length} ways into this application`);

  const summary = summariseEffects(behaviours);
  if (summary.length > 0) {
    heading('What it can do');
    // Column width from the labels actually present, not a guessed constant —
    // otherwise a long label silently collides with the count beside it.
    const width = Math.max(...summary.map(([kind]) => EFFECT_LABELS[kind].length)) + 2;
    for (const [kind, count] of summary) {
      const mark = CONSEQUENTIAL_EFFECTS.has(kind) ? `${ACCENT}●${RESET}` : `${DIM}○${RESET}`;
      const label = EFFECT_LABELS[kind].padEnd(width);
      console.log(`  ${mark} ${label}${DIM}${count} ${plural(count, 'way in', 'ways in')}${RESET}`);
    }
  }

  // ---- The ones that matter ---------------------------------------------
  const ranked = [...behaviours]
    .map((b) => ({ b, score: consequenceScore(b) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length > 0) {
    const showAll = ranked.length <= SHOW_ALL_BELOW;
    const shown = showAll ? ranked : ranked.slice(0, DETAIL_LIMIT);
    const caption = showAll
      ? 'ranked by consequence'
      : `${shown.length} of ${ranked.length}, ranked by consequence`;
    heading(`Worth looking at first ${DIM}(${caption})${RESET}`);
    shown.forEach((x, i) => printBehaviour(x.b, i + 1));
  }

  // ---- Behaviours we found nothing in -----------------------------------
  const empty = behaviours.length - ranked.length;
  if (empty > 0) {
    heading(`${empty} ways in where we found no effects`);
    console.log(
      `  ${DIM}This usually means the logic lives in files we have not followed yet,${RESET}`,
    );
    console.log(`  ${DIM}not that the behaviour does nothing. Import following is not built.${RESET}`);
  }

  // ---- Unknowns are reported, never swallowed ---------------------------
  const configDependent = behaviours.flatMap((b) =>
    b.unknowns.filter((u) => u.reason === 'config-dependent'),
  );
  if (configDependent.length > 0) {
    heading(
      `${configDependent.length} ${plural(configDependent.length, 'place', 'places')} that depend on configuration`,
    );
    console.log(
      `  ${DIM}${plural(configDependent.length, 'This', 'These')} may behave differently in production than ${plural(configDependent.length, 'it does', 'they do')} locally.${RESET}`,
    );
  }

  if (skipped.length > 0) {
    heading(`${skipped.length} things we could not read`);
    const byReason = new Map<string, number>();
    for (const unknown of skipped) {
      byReason.set(unknown.reason, (byReason.get(unknown.reason) ?? 0) + 1);
    }
    for (const [reason, count] of byReason) {
      console.log(
        `  ${DIM}${count} × ${reason} — ${UNKNOWN_GUIDANCE[reason as keyof typeof UNKNOWN_GUIDANCE].action}${RESET}`,
      );
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

  ${BOLD}eriksen scan${RESET} [path]    Show what an application can do

Everything runs locally. Your code never leaves this machine.
`);
}
