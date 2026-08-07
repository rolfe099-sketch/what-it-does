/**
 * The behaviour ↔ resource graph.
 *
 * Everything interesting hangs off this. "What breaks if I change the `users`
 * table" is a graph query. So is the spatial map — that is this same bipartite
 * graph, drawn. So is impact simulation.
 *
 * It is also the part a language model answers worst. Asked "what touches the
 * users table", a model gives a plausible answer assembled from what it happened
 * to read. This gives a COMPLETE one, and says out loud where it is unsure —
 * which is the difference between a tool you can act on and a tool you have to
 * double-check.
 */

import {
  CONSEQUENTIAL_EFFECTS,
  resourceKey,
  type Behaviour,
  type Effect,
  type Resource,
} from '../model.js';

export interface Touch {
  behaviour: Behaviour;
  /** Every effect from this behaviour that lands on the resource. */
  effects: Effect[];
}

export interface ResourceNode {
  key: string;
  resource: Resource;
  touches: Touch[];
  reads: number;
  writes: number;
  deletes: number;
  /**
   * At least one edge came from a variable rather than a literal name, so the
   * true target is not knowable statically. The UI must say so — an uncertain
   * edge presented as certain is how a graph starts lying.
   */
  uncertain: boolean;
}

/** Which effect kinds count as touching a resource, and how. */
function classify(effect: Effect): 'read' | 'write' | 'delete' | null {
  switch (effect.kind) {
    case 'reads-data':
      return 'read';
    case 'writes-data':
    case 'writes-file':
      return 'write';
    case 'deletes-data':
      return 'delete';
    case 'takes-payment':
    case 'sends-email':
    case 'calls-external':
      // An outside service is written to, in the sense that the call has a
      // consequence out there that you cannot take back.
      return 'write';
    default:
      return null;
  }
}

export function buildResourceGraph(behaviours: Behaviour[]): ResourceNode[] {
  const nodes = new Map<string, ResourceNode>();

  for (const behaviour of behaviours) {
    const byResource = new Map<string, Effect[]>();

    for (const effect of behaviour.effects) {
      if (!effect.resource) continue;
      const key = resourceKey(effect.resource);
      const list = byResource.get(key);
      if (list) list.push(effect);
      else byResource.set(key, [effect]);
    }

    for (const [key, effects] of byResource) {
      const resource = effects[0].resource!;
      let node = nodes.get(key);
      if (!node) {
        node = {
          key,
          resource,
          touches: [],
          reads: 0,
          writes: 0,
          deletes: 0,
          uncertain: false,
        };
        nodes.set(key, node);
      }

      node.touches.push({ behaviour, effects });
      if (!resource.literal) node.uncertain = true;

      for (const effect of effects) {
        const how = classify(effect);
        if (how === 'read') node.reads++;
        else if (how === 'write') node.writes++;
        else if (how === 'delete') node.deletes++;
      }
    }
  }

  /**
   * Ranked by blast radius, then by destructive reach. The table half your app
   * depends on is the one you most need to know about before touching it.
   */
  return [...nodes.values()].sort(
    (a, b) => b.touches.length - a.touches.length || b.deletes - a.deletes,
  );
}

export interface Impact {
  /** Total behaviours that would be affected by a breaking change. */
  blastRadius: number;
  /** Plain-language consequences, most severe first. */
  consequences: string[];
}

/**
 * What actually happens if you change this thing.
 *
 * Deliberately phrased as consequences rather than counts. "12 behaviours read
 * from this" is a statistic; "rename a column and 12 things stop working" is the
 * sentence that answers the question someone is really asking, which is whether
 * they are about to break their product.
 */
export function impactOf(node: ResourceNode): Impact {
  const consequences: string[] = [];
  const n = node.touches.length;
  const thing = node.resource.kind === 'service' ? 'service' : node.resource.kind;

  const isService = node.resource.kind === 'service';

  if (isService) {
    consequences.push(
      `If ${node.resource.name} is unavailable or changes its API, ${n} ${n === 1 ? 'behaviour stops' : 'behaviours stop'} working.`,
    );
  } else {
    consequences.push(
      `Rename or remove this ${thing} and ${n} ${n === 1 ? 'behaviour breaks' : 'behaviours break'}.`,
    );
  }

  // Deletion before modification: losing data outranks needing to update code.
  if (node.deletes > 0) {
    consequences.push(
      `${node.deletes} ${node.deletes === 1 ? 'place can delete' : 'places can delete'} from it. Data removed here is gone for everything above.`,
    );
  }

  if (node.writes > 0) {
    consequences.push(
      isService
        ? // "Change its shape" is meaningless for someone else's API — the risk
          // is that these calls have consequences you cannot take back.
          `${node.writes} ${node.writes === 1 ? 'place sends' : 'places send'} something to it. Those calls have effects outside your application that you cannot undo.`
        : `${node.writes} ${node.writes === 1 ? 'place writes' : 'places write'} to it — change its shape and each of those needs updating too.`,
    );
  }

  if (node.reads > 0 && node.writes === 0 && node.deletes === 0) {
    consequences.push('Nothing writes to it from this application — it is read-only from here.');
  }

  if (node.uncertain) {
    consequences.push(
      'At least one of these was reached through a name chosen at runtime, so the real list may be longer than this.',
    );
  }

  return { blastRadius: n, consequences };
}

/** Resources a single behaviour depends on. The other direction of the graph. */
export function resourcesOf(behaviour: Behaviour): Resource[] {
  const seen = new Map<string, Resource>();
  for (const effect of behaviour.effects) {
    if (effect.resource) seen.set(resourceKey(effect.resource), effect.resource);
  }
  return [...seen.values()];
}

/**
 * Behaviours that share a resource with this one — the blast radius of changing
 * the behaviour itself rather than the data. If you break how this writes to
 * `users`, everything here reads what it wrote.
 */
export function neighboursOf(behaviour: Behaviour, graph: ResourceNode[]): Behaviour[] {
  const mine = new Set(resourcesOf(behaviour).map(resourceKey));
  const found = new Map<string, Behaviour>();

  for (const node of graph) {
    if (!mine.has(node.key)) continue;
    for (const touch of node.touches) {
      if (touch.behaviour.id === behaviour.id) continue;
      found.set(touch.behaviour.id, touch.behaviour);
    }
  }

  // Consequential neighbours first — if something else can DELETE from a table
  // you write to, that is the neighbour you needed to know about.
  return [...found.values()].sort((a, b) => {
    const score = (x: Behaviour) =>
      x.effects.filter((e) => CONSEQUENTIAL_EFFECTS.has(e.kind)).length;
    return score(b) - score(a);
  });
}
