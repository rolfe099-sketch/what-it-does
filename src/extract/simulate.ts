/**
 * Simulating a change — propagating it through the graph.
 *
 * The first order is easy and everybody already knows it: remove a table and the
 * things that read it break. It is the SECOND order that catches people out.
 *
 * If the behaviour you just broke was the only thing WRITING to some other
 * table, then that table is still there, still readable, and quietly stops being
 * maintained. Everything downstream keeps working — on data nobody updates any
 * more. That failure has no error message and no stack trace, and it is exactly
 * the class of thing a tool can see and a person cannot.
 *
 * HONESTY BOUNDARY. Wave one is close to observation: those behaviours name the
 * thing you are removing. Everything after it is INFERENCE from a static graph,
 * and it is labelled that way. A cascade presented with the same confidence as a
 * direct reference would be the tool overselling what it can actually see.
 */

import type { Behaviour } from '../model.js';
import type { ResourceNode } from './graph.js';

export type ChangeKind = 'remove-resource' | 'service-down';

export interface Wave {
  /** 1 = directly affected. Higher numbers are further downstream. */
  order: number;
  /** Plain language: what this wave is and why it follows from the last. */
  title: string;
  detail: string;
  behaviours: Behaviour[];
  /** Resources this wave strands, if any. */
  resources: ResourceNode[];
  /** How sure we are. Only wave one is ever 'direct'. */
  certainty: 'direct' | 'inferred';
}

export interface Simulation {
  /** "If you remove the `users` table" */
  premise: string;
  waves: Wave[];
  /** Distinct behaviours affected across every wave. */
  totalBehaviours: number;
  caveats: string[];
}

/** Does this behaviour put data INTO the resource? */
function writesTo(behaviour: Behaviour, node: ResourceNode): boolean {
  const touch = node.touches.find((t) => t.behaviour.id === behaviour.id);
  if (!touch) return false;
  return touch.effects.some(
    (e) => e.kind === 'writes-data' || e.kind === 'writes-file' || e.kind === 'deletes-data',
  );
}

/** Does this behaviour only take data OUT of the resource? */
function readsFrom(behaviour: Behaviour, node: ResourceNode): boolean {
  const touch = node.touches.find((t) => t.behaviour.id === behaviour.id);
  if (!touch) return false;
  return touch.effects.some((e) => e.kind === 'reads-data');
}

export function simulate(
  target: ResourceNode,
  graph: ResourceNode[],
  kind: ChangeKind = 'remove-resource',
): Simulation {
  const isService = target.resource.kind === 'service';
  const premise =
    kind === 'service-down' || isService
      ? `If ${target.resource.name} stops responding`
      : `If you remove or rename ${target.resource.name}`;

  const waves: Wave[] = [];
  const affected = new Map<string, Behaviour>();

  // ── Wave 1 ────────────────────────────────────────────────────────────
  // Everything that names the thing directly.
  const direct = target.touches.map((t) => t.behaviour);
  direct.forEach((b) => affected.set(b.id, b));

  waves.push({
    order: 1,
    title: 'Stops working straight away',
    detail:
      kind === 'service-down' || isService
        ? 'These call it directly. Whatever they were doing with it will fail.'
        : 'These name it directly, so they break the moment it is gone.',
    behaviours: direct,
    resources: [],
    certainty: 'direct',
  });

  // ── Wave 2 ────────────────────────────────────────────────────────────
  // Resources that were only ever written to by behaviours in wave 1.
  // They survive the change and quietly stop being maintained.
  const brokenIds = new Set(direct.map((b) => b.id));
  const stranded = graph.filter((node) => {
    if (node.key === target.key) return false;
    const writers = node.touches.filter((t) => writesTo(t.behaviour, node));
    if (writers.length === 0) return false;
    return writers.every((t) => brokenIds.has(t.behaviour.id));
  });

  if (stranded.length > 0) {
    waves.push({
      order: 2,
      title: 'Left with nothing keeping it up to date',
      detail:
        'Every behaviour that wrote to these is in the list above. They would still ' +
        'exist and still be readable — but nothing would be updating them any more. ' +
        'This is the failure with no error message.',
      behaviours: [],
      resources: stranded,
      certainty: 'inferred',
    });

    // ── Wave 3 ──────────────────────────────────────────────────────────
    // Everything reading data that nobody maintains any more.
    const downstream = new Map<string, Behaviour>();
    for (const node of stranded) {
      for (const touch of node.touches) {
        if (brokenIds.has(touch.behaviour.id)) continue;
        if (!readsFrom(touch.behaviour, node)) continue;
        downstream.set(touch.behaviour.id, touch.behaviour);
      }
    }

    if (downstream.size > 0) {
      downstream.forEach((b, id) => affected.set(id, b));
      waves.push({
        order: 3,
        title: 'Keeps running, on data that has gone stale',
        detail:
          'These read the tables above. They would not crash and they would not warn ' +
          'you — they would carry on serving whatever was there when the writing stopped.',
        behaviours: [...downstream.values()],
        resources: [],
        certainty: 'inferred',
      });
    }
  }

  const caveats: string[] = [
    'Wave one is what the code literally references. Everything after it is worked ' +
      'out from the graph, so treat it as where to look rather than as what will happen.',
  ];

  if (target.uncertain) {
    caveats.push(
      `Some code reaches ${target.resource.name} through a name chosen at runtime, so the ` +
        'real first wave may be larger than this.',
    );
  }

  caveats.push(
    'Only names written literally in the code are here at all. Anything reached ' +
      'dynamically is missing from every wave.',
  );

  return { premise, waves, totalBehaviours: affected.size, caveats };
}
