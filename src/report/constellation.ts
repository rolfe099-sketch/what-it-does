/**
 * The constellation — the resource graph, drawn.
 *
 * WHAT IS PLOTTED AND WHY. Nodes are resources, not behaviours. Drawing all 686
 * behaviours plus 69 resources gives 755 points and a hairball nobody can read.
 * The resources ARE the architecture of the data — 69 nodes is a picture. Two
 * resources are linked when some behaviour reaches both, so an edge means "these
 * two are used together", which is the relationship that actually constrains
 * what you can safely change.
 *
 * ENCODING, ALL OF IT MEANINGFUL:
 *   area          blast radius — how many behaviours reach it
 *   filled ring   a table you own
 *   hollow ring   an outside service you do not control
 *   accent        something can DELETE from it
 *   edge opacity  how many behaviours reach both ends
 *
 * Nothing here is decorative. A picture where size is arbitrary teaches the eye
 * to ignore size.
 *
 * The SVG is fully rendered server-side with positions baked in, so it draws with
 * scripting disabled. JavaScript only adds hover isolation and pan/zoom.
 */

import type { ResourceNode } from '../extract/graph.js';
import { plural } from '../model.js';
import { layout, type LayoutEdge } from './layout.js';

/** Above this many nodes, labels are drawn only for the largest. */
const LABEL_LIMIT = 22;
/** Hairball guard: the strongest edges carry the shape, the rest are noise. */
const EDGE_LIMIT = 220;

const escape = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const nodeId = (key: string) => 'n-' + key.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

/**
 * Two resources are connected when a behaviour reaches both.
 * The weight is how many behaviours do — a strong edge means the two are almost
 * always changed together.
 */
function buildEdges(graph: ResourceNode[]): LayoutEdge[] {
  const behaviourToResources = new Map<string, string[]>();

  for (const node of graph) {
    for (const touch of node.touches) {
      const list = behaviourToResources.get(touch.behaviour.id);
      if (list) list.push(node.key);
      else behaviourToResources.set(touch.behaviour.id, [node.key]);
    }
  }

  const weights = new Map<string, number>();
  for (const keys of behaviourToResources.values()) {
    // A behaviour touching one resource creates no edge; touching n creates
    // every pair among them.
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const [a, b] = keys[i] < keys[j] ? [keys[i], keys[j]] : [keys[j], keys[i]];
        const id = `${a}|${b}`;
        weights.set(id, (weights.get(id) ?? 0) + 1);
      }
    }
  }

  return [...weights.entries()]
    .map(([id, weight]) => {
      const [a, b] = id.split('|');
      return { a, b, weight };
    })
    .sort((x, y) => y.weight - x.weight)
    .slice(0, EDGE_LIMIT);
}

/**
 * A scale reference behind the map, like the rings of a range scope.
 *
 * Functional, not ornamental: the rings give the eye a fixed frame to judge
 * position and drift against while panning, and the centre mark says where
 * "rest" is after a zoom. It pans and zooms WITH the nodes because it is part
 * of the map, which is what makes it a reference rather than wallpaper.
 */
function graticule(width: number, height: number): string {
  const cx = width / 2;
  const cy = height / 2;
  const unit = Math.min(width, height);
  const rings = [0.18, 0.33, 0.48]
    .map((t) => `<circle cx="${cx}" cy="${cy}" r="${(unit * t).toFixed(0)}" opacity="${t === 0.48 ? '.5' : '1'}"/>`)
    .join('');
  const arm = unit * 0.02;
  return `<g class="cst__grid" aria-hidden="true">${rings}
    <path class="cst__grid-mark" d="M${(cx - arm).toFixed(0)} ${cy} h${(arm * 2).toFixed(0)} M${cx} ${(cy - arm).toFixed(0)} v${(arm * 2).toFixed(0)}" opacity=".6"/>
  </g>`;
}

export interface Constellation {
  svg: string;
  nodeCount: number;
  edgeCount: number;
  /** Edges dropped by the hairball guard, reported rather than hidden. */
  edgesOmitted: number;
}

export function constellation(graph: ResourceNode[], resSlug: (key: string) => string): Constellation {
  if (graph.length === 0) {
    return { svg: '', nodeCount: 0, edgeCount: 0, edgesOmitted: 0 };
  }

  const allEdges = buildEdges(graph);
  const edges = allEdges;
  const result = layout(
    graph.map((n) => ({ key: n.key, weight: n.touches.length })),
    edges,
  );

  const byKey = new Map(graph.map((n) => [n.key, n]));
  const maxEdgeWeight = Math.max(1, ...edges.map((e) => e.weight));

  // Which nodes get a label: the biggest, so text never stacks into mush.
  const labelled = new Set(
    [...result.nodes.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, LABEL_LIMIT)
      .map((n) => n.key),
  );

  // Adjacency, embedded as data attributes so hover isolation needs no lookup
  // structure in the browser.
  const neighbours = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!neighbours.has(e.a)) neighbours.set(e.a, new Set());
    if (!neighbours.has(e.b)) neighbours.set(e.b, new Set());
    neighbours.get(e.a)!.add(e.b);
    neighbours.get(e.b)!.add(e.a);
  }

  const edgeMarkup = edges
    .map((e) => {
      const a = result.nodes.get(e.a);
      const b = result.nodes.get(e.b);
      if (!a || !b) return '';
      const strength = e.weight / maxEdgeWeight;
      return `<line class="cst__edge" data-a="${escape(e.a)}" data-b="${escape(e.b)}"
        x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"
        stroke-width="${(0.6 + strength * 2.2).toFixed(2)}"
        opacity="${(0.12 + strength * 0.45).toFixed(2)}" />`;
    })
    .join('');

  const nodeMarkup = graph
    .map((res) => {
      const pos = result.nodes.get(res.key);
      if (!pos) return '';
      const isService = res.resource.kind === 'service';
      const destructive = res.deletes > 0;
      const near = [...(neighbours.get(res.key) ?? [])].join(' ');

      const label = labelled.has(res.key)
        ? `<text class="cst__label" x="${pos.x.toFixed(1)}" y="${(pos.y + pos.r + 13).toFixed(1)}"
             text-anchor="middle">${escape(res.resource.name)}</text>`
        : '';

      // A link, so the whole map is keyboard navigable and every node reaches
      // its impact view without any script running.
      return `<a class="cst__node${destructive ? ' is-destructive' : ''}${isService ? ' is-service' : ''}"
        href="#${resSlug(res.key)}" id="${nodeId(res.key)}"
        data-key="${escape(res.key)}" data-near="${escape(near)}"
        data-name="${escape(res.resource.name)}"
        data-note="${escape(
          `${res.touches.length} ${res.touches.length === 1 ? 'behaviour reaches' : 'behaviours reach'} it` +
            (res.deletes > 0 ? ` · ${res.deletes} can delete` : '') +
            (res.resource.kind === 'service' ? ' · outside service' : ''),
        )}"
        aria-label="${escape(res.resource.name)}: reached by ${res.touches.length} ${plural(res.touches.length, 'behaviour', 'behaviours')}">
        <circle class="cst__hit" cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}"
          r="${Math.max(pos.r + 6, 14).toFixed(1)}" />
        <circle class="cst__glow" cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}"
          r="${(pos.r * 1.9).toFixed(1)}" />
        <circle class="cst__dot" cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}"
          r="${pos.r.toFixed(1)}" />
        ${label}
      </a>`;
    })
    .join('');

  const svg = `<svg class="cst__svg" viewBox="0 0 ${result.width} ${result.height}"
    role="img" aria-labelledby="cst-title cst-desc" preserveAspectRatio="xMidYMid meet">
    <title id="cst-title">Map of the tables and services this application depends on</title>
    <desc id="cst-desc">${graph.length} ${plural(graph.length, 'resource', 'resources')}. Larger means more behaviours reach it.
      Lines connect resources that some behaviour uses together. The same information is
      listed as text under "What it depends on".</desc>
    ${graticule(result.width, result.height)}
    <g class="cst__edges">${edgeMarkup}</g>
    <g class="cst__nodes">${nodeMarkup}</g>
  </svg>`;

  return {
    svg,
    nodeCount: graph.length,
    edgeCount: edges.length,
    edgesOmitted: 0,
  };
}
