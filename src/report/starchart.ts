/**
 * The star chart — the dependency graph in three dimensions.
 *
 * WHY A THIRD AXIS IS NOT DECORATION. In two dimensions a densely-connected
 * graph has to resolve every relationship on one plane, so clusters that are not
 * actually related get pressed into each other for want of anywhere else to go.
 * Depth gives them somewhere to go, and the shape you end up looking at is
 * closer to the shape of the data.
 *
 * HOW IT STAYS HONEST WITHOUT SCRIPTING. The projection maths lives in
 * layout.ts and is called here, in Node, at a default viewing angle. The SVG
 * ships fully positioned — it draws with JavaScript disabled, every node is
 * still a link to its impact view, and tab still moves through them. Dragging
 * re-runs the identical function in the browser, so the two can never disagree.
 *
 * DEPTH CUES, all of them derived from the same perspective scale:
 *   size      near things are larger
 *   opacity   far things fade, as through atmosphere
 *   order     painter's algorithm, back to front
 */

import type { ResourceNode } from '../extract/graph.js';
import { plural } from '../model.js';
import { fitScale, layout3d, project, type LayoutEdge } from './layout.js';

const VIEW = 1000;
const CENTRE = VIEW / 2;
/** Default viewing angle. Slightly off-axis reads as a volume, not a disc. */
const YAW = 0.6;
const PITCH = -0.32;

const LABEL_LIMIT = 18;
const EDGE_LIMIT = 200;

const escape = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildEdges(graph: ResourceNode[]): LayoutEdge[] {
  const perBehaviour = new Map<string, string[]>();
  for (const node of graph) {
    for (const touch of node.touches) {
      const list = perBehaviour.get(touch.behaviour.id);
      if (list) list.push(node.key);
      else perBehaviour.set(touch.behaviour.id, [node.key]);
    }
  }
  const weights = new Map<string, number>();
  for (const keys of perBehaviour.values()) {
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

export interface StarChart {
  svg: string;
  nodeCount: number;
  edgeCount: number;
}

export function starChart(graph: ResourceNode[], resSlug: (key: string) => string): StarChart {
  if (graph.length === 0) return { svg: '', nodeCount: 0, edgeCount: 0 };

  const edges = buildEdges(graph);
  const model = layout3d(
    graph.map((n) => ({ key: n.key, weight: n.touches.length })),
    edges,
  );

  // Stand back far enough that perspective reads as depth rather than as a
  // fisheye. Roughly two and a half model radii is the usual sweet spot.
  const distance = model.radius * 2.5;
  const maxEdgeWeight = Math.max(1, ...edges.map((e) => e.weight));

  // Magnify so the model fills the frame at every rotation, not just this one.
  const fit = fitScale([...model.nodes.values()], distance, VIEW * 0.46);

  const at = (point: { x: number; y: number; z: number }) => {
    const q = project(point, YAW, PITCH, distance, 0);
    return { x: CENTRE + q.x * fit, y: CENTRE + q.y * fit, scale: q.scale, depth: q.depth };
  };

  const placed = graph
    .map((res) => {
      const point = model.nodes.get(res.key);
      if (!point) return null;
      const p = at(point);
      return { res, point, p };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Painter's algorithm: farthest first, so near nodes overlap far ones.
  const ordered = [...placed].sort((a, b) => b.p.depth - a.p.depth);

  const labelled = new Set(
    [...placed]
      .sort((a, b) => b.res.touches.length - a.res.touches.length)
      .slice(0, LABEL_LIMIT)
      .map((x) => x.res.key),
  );

  const byKey = new Map(placed.map((x) => [x.res.key, x]));

  const edgeMarkup = edges
    .map((e) => {
      const a = byKey.get(e.a);
      const b = byKey.get(e.b);
      if (!a || !b) return '';
      const strength = e.weight / maxEdgeWeight;
      // Fade with the depth of the nearer endpoint so edges recede with the
      // nodes they join rather than floating on top of everything.
      const near = Math.max(a.p.scale, b.p.scale);
      const opacity = (0.06 + strength * 0.34) * Math.min(1, near);
      return `<line class="sc__edge" pathLength="1" data-a="${escape(e.a)}" data-b="${escape(e.b)}"
        x1="${a.p.x.toFixed(1)}" y1="${a.p.y.toFixed(1)}"
        x2="${b.p.x.toFixed(1)}" y2="${b.p.y.toFixed(1)}"
        stroke-width="${(0.5 + strength * 1.8).toFixed(2)}"
        opacity="${opacity.toFixed(3)}" />`;
    })
    .join('');

  const nodeMarkup = ordered
    .map(({ res, point, p }) => {
      const isService = res.resource.kind === 'service';
      const destructive = res.deletes > 0;
      const r = res.touches.length;
      const radius = point.r * p.scale * fit;
      // Atmospheric depth: far nodes sit back without disappearing.
      const opacity = Math.max(0.32, Math.min(1, p.scale * 0.95));

      const label = labelled.has(res.key)
        ? `<text class="sc__label" x="${p.x.toFixed(1)}" y="${(p.y + radius + 13).toFixed(1)}"
             text-anchor="middle" opacity="${opacity.toFixed(2)}">${escape(res.resource.name)}</text>`
        : '';

      return `<a class="sc__node${destructive ? ' is-destructive' : ''}${isService ? ' is-service' : ''}"
        href="#${resSlug(res.key)}"
        data-key="${escape(res.key)}"
        data-x="${point.x.toFixed(1)}" data-y="${point.y.toFixed(1)}" data-z="${point.z.toFixed(1)}"
        data-r="${point.r.toFixed(1)}"
        data-name="${escape(res.resource.name)}"
        data-note="${escape(
          `${r} ${r === 1 ? 'behaviour reaches' : 'behaviours reach'} it` +
            (res.deletes > 0 ? ` · ${res.deletes} can delete` : '') +
            (isService ? ' · outside service' : ''),
        )}"
        aria-label="${escape(res.resource.name)}: reached by ${r} ${plural(r, 'behaviour', 'behaviours')}">
        <circle class="sc__hit" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}"
          r="${Math.max(radius + 6, 13).toFixed(1)}" />
        <circle class="sc__dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}"
          r="${radius.toFixed(1)}" opacity="${opacity.toFixed(2)}" />
        ${label}
      </a>`;
    })
    .join('');

  const svg = `<svg class="sc__svg" viewBox="0 0 ${VIEW} ${VIEW}"
    role="img" aria-labelledby="sc-title sc-desc" preserveAspectRatio="xMidYMid meet"
    data-distance="${distance.toFixed(1)}" data-yaw="${YAW}" data-pitch="${PITCH}"
    data-fit="${fit.toFixed(4)}">
    <title id="sc-title">Three-dimensional map of the tables and services this application depends on</title>
    <desc id="sc-desc">${graph.length} resources arranged in depth. Larger and brighter
      means nearer and more depended upon. The same information is listed as text under
      "What it depends on".</desc>
    <g class="sc__edges">${edgeMarkup}</g>
    <g class="sc__nodes">${nodeMarkup}</g>
  </svg>`;

  return { svg, nodeCount: graph.length, edgeCount: edges.length };
}
