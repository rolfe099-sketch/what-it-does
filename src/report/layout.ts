/**
 * Force-directed layout, computed in Node at build time.
 *
 * Two decisions here that are not the obvious ones:
 *
 * COMPUTED ON THE SERVER, NOT IN THE BROWSER. The usual approach ships a physics
 * simulation to the client and animates nodes into place. That looks impressive
 * for four seconds and then costs you everything: the map cannot render with
 * scripting disabled, it settles differently on a slow machine, and it re-jitters
 * on every reload. Running it here emits static SVG with the positions baked in.
 *
 * DETERMINISTIC. Same graph in, same picture out, on every machine, forever.
 * A layout seeded from Math.random() reshuffles every scan, which quietly
 * destroys the ability to compare one scan against the last — and this tool's
 * whole differentiator is watching a system change over time. If the map moves
 * on its own, you cannot tell what moved.
 */

export interface LayoutNode {
  key: string;
  /** Drives node radius and mass. */
  weight: number;
  x: number;
  y: number;
  /** Set after layout, in final SVG units. */
  r: number;
}

export interface LayoutEdge {
  a: string;
  b: string;
  /** How many behaviours reach both ends. */
  weight: number;
}

export interface LayoutResult {
  nodes: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  width: number;
  height: number;
}

/**
 * mulberry32 — small, fast, and fully deterministic from an integer seed.
 * Seeded from the graph itself so the same project always lays out identically,
 * while two different projects do not start from the same arrangement.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(strings: string[]): number {
  let h = 2166136261;
  for (const s of strings) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

const VIEW = 1000;
const ITERATIONS = 400;

export interface LayoutOptions {
  /** Minimum and maximum node radius in SVG units. */
  minRadius?: number;
  maxRadius?: number;
}

export function layout(
  input: { key: string; weight: number }[],
  edges: LayoutEdge[],
  options: LayoutOptions = {},
): LayoutResult {
  const minR = options.minRadius ?? 4;
  const maxR = options.maxRadius ?? 34;

  const random = rng(hash(input.map((n) => n.key)));
  const nodes = new Map<string, LayoutNode>();

  const maxWeight = Math.max(1, ...input.map((n) => n.weight));

  // Start on a circle rather than at random points. A ring untangles far more
  // reliably than a cloud, so fewer iterations are needed and the result is
  // stable rather than luck.
  input.forEach((n, i) => {
    const angle = (i / input.length) * Math.PI * 2;
    const jitter = (random() - 0.5) * 40;
    nodes.set(n.key, {
      key: n.key,
      weight: n.weight,
      x: VIEW / 2 + Math.cos(angle) * (VIEW * 0.34) + jitter,
      y: VIEW / 2 + Math.sin(angle) * (VIEW * 0.34) + jitter,
      // Area, not radius, tracks weight — a node reached by four times as many
      // behaviours should look four times as big, and the eye reads area.
      r: minR + Math.sqrt(n.weight / maxWeight) * (maxR - minR),
    });
  });

  const list = [...nodes.values()];
  const maxEdge = Math.max(1, ...edges.map((e) => e.weight));

  for (let step = 0; step < ITERATIONS; step++) {
    // Cooling: large moves early, small corrections late.
    const temperature = (1 - step / ITERATIONS) ** 1.5;

    // Repulsion — every node pushes every other away, harder if it is bigger.
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          // Exactly coincident nodes have no direction to separate along;
          // nudge them deterministically rather than dividing by zero.
          dx = (i - j) * 0.5;
          dy = (j - i) * 0.5;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const push = ((a.r + b.r) * 160 * temperature) / d2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }

    // Attraction — connected nodes pull together, weighted by how much they share.
    for (const edge of edges) {
      const a = nodes.get(edge.a);
      const b = nodes.get(edge.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const strength = (edge.weight / maxEdge) * 0.045 * temperature;
      const fx = dx * strength;
      const fy = dy * strength;
      a.x += fx;
      a.y += fy;
      b.x -= fx;
      b.y -= fy;
    }

    // Gentle pull to centre so disconnected nodes do not drift to infinity.
    for (const n of list) {
      n.x += (VIEW / 2 - n.x) * 0.012 * temperature;
      n.y += (VIEW / 2 - n.y) * 0.012 * temperature;
    }
  }

  // Fit to the viewBox with room for the largest node and its label.
  const pad = maxR + 24;
  const xs = list.map((n) => n.x);
  const ys = list.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((VIEW - pad * 2) / spanX, (VIEW - pad * 2) / spanY);

  for (const n of list) {
    n.x = pad + (n.x - minX) * scale;
    n.y = pad + (n.y - minY) * scale;
  }

  return { nodes, edges, width: VIEW, height: VIEW };
}
