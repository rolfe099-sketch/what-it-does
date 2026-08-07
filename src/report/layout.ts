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

// ---------------------------------------------------------------------------
// Three dimensions
// ---------------------------------------------------------------------------

export interface LayoutNode3D {
  key: string;
  weight: number;
  /** Model-space coordinates centred on the origin, roughly within ±500. */
  x: number;
  y: number;
  z: number;
  /** Radius at zero depth, before perspective scaling. */
  r: number;
}

export interface Layout3DResult {
  nodes: Map<string, LayoutNode3D>;
  edges: LayoutEdge[];
  /** Half-extent of the model, so the projector knows how far to stand back. */
  radius: number;
}

/**
 * Even points on a sphere, by golden-angle spiral.
 *
 * Random points on a sphere clump — you get bald patches and clusters, and the
 * force pass then has to spend its whole budget undoing that. The Fibonacci
 * spiral is even by construction and completely deterministic, so the solver
 * starts from a good arrangement and only has to express the actual structure.
 */
function fibonacciSphere(index: number, count: number): [number, number, number] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = count === 1 ? 0 : 1 - (index / (count - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * index;
  return [Math.cos(theta) * radius, y, Math.sin(theta) * radius];
}

const SPACE = 480;

/**
 * The same force model in three dimensions.
 *
 * Depth genuinely helps here: in two dimensions a densely-connected graph has to
 * resolve every relationship on one plane, and clusters that are not actually
 * related get pushed into each other for want of anywhere else to go. A third
 * axis gives them somewhere to go.
 */
export function layout3d(
  input: { key: string; weight: number }[],
  edges: LayoutEdge[],
  options: LayoutOptions = {},
): Layout3DResult {
  const minR = options.minRadius ?? 4;
  const maxR = options.maxRadius ?? 30;

  const random = rng(hash(input.map((n) => n.key)) ^ 0x3d3d3d);
  const nodes = new Map<string, LayoutNode3D>();
  const maxWeight = Math.max(1, ...input.map((n) => n.weight));

  input.forEach((n, i) => {
    const [ux, uy, uz] = fibonacciSphere(i, input.length);
    // A little seeded jitter breaks the perfect shell so the force pass has
    // something to work with, without introducing non-determinism.
    const jitter = () => (random() - 0.5) * 30;
    nodes.set(n.key, {
      key: n.key,
      weight: n.weight,
      x: ux * SPACE + jitter(),
      y: uy * SPACE + jitter(),
      z: uz * SPACE + jitter(),
      r: minR + Math.sqrt(n.weight / maxWeight) * (maxR - minR),
    });
  });

  const list = [...nodes.values()];
  const maxEdge = Math.max(1, ...edges.map((e) => e.weight));

  for (let step = 0; step < ITERATIONS; step++) {
    const temperature = (1 - step / ITERATIONS) ** 1.5;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dz = b.z - a.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1) {
          dx = (i - j) * 0.5;
          dy = (j - i) * 0.5;
          dz = 0.5;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const push = ((a.r + b.r) * 220 * temperature) / d2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        b.z += (dz / d) * push;
      }
    }

    for (const edge of edges) {
      const a = nodes.get(edge.a);
      const b = nodes.get(edge.b);
      if (!a || !b) continue;
      const strength = (edge.weight / maxEdge) * 0.05 * temperature;
      a.x += (b.x - a.x) * strength;
      a.y += (b.y - a.y) * strength;
      a.z += (b.z - a.z) * strength;
      b.x -= (b.x - a.x) * strength;
      b.y -= (b.y - a.y) * strength;
      b.z -= (b.z - a.z) * strength;
    }

    for (const n of list) {
      n.x -= n.x * 0.012 * temperature;
      n.y -= n.y * 0.012 * temperature;
      n.z -= n.z * 0.012 * temperature;
    }
  }

  const radius = Math.max(
    1,
    ...list.map((n) => Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) + n.r),
  );

  return { nodes, edges, radius };
}

export interface Projected {
  x: number;
  y: number;
  /** Perspective scale factor, also used for depth fading. */
  scale: number;
  /** Rotated depth, for painter's-algorithm sorting. */
  depth: number;
}

/**
 * Rotate then apply perspective.
 *
 * Shared verbatim with the browser: the static SVG is produced by calling this
 * in Node at the default angle, and dragging re-runs the identical maths on the
 * client. One implementation, so the picture cannot drift between the two.
 */
/**
 * How much to magnify the projection so the model fills the frame.
 *
 * Fitting to the DEFAULT angle alone would let nodes swing outside the viewport
 * as soon as anyone dragged. Sampling a spread of angles and fitting to the
 * worst of them means the chart fills the frame and never escapes it, at any
 * rotation, without rescaling as you turn — which would be far more
 * disorienting than a little unused margin.
 */
export function fitScale(
  points: { x: number; y: number; z: number; r: number }[],
  distance: number,
  target: number,
): number {
  let worst = 1;
  for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) {
    for (let pitch = -1.2; pitch <= 1.2; pitch += 0.6) {
      for (const p of points) {
        const q = project(p, yaw, pitch, distance, 0);
        const extent = Math.max(Math.abs(q.x), Math.abs(q.y)) + p.r * q.scale;
        if (extent > worst) worst = extent;
      }
    }
  }
  return target / worst;
}

export function project(
  point: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  distance: number,
  centre: number,
): Projected {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const x1 = point.x * cy - point.z * sy;
  const z1 = point.x * sy + point.z * cy;
  const y1 = point.y * cp - z1 * sp;
  const z2 = point.y * sp + z1 * cp;

  const scale = distance / (distance + z2);
  return { x: centre + x1 * scale, y: centre + y1 * scale, scale, depth: z2 };
}

