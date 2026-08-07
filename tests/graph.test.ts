/**
 * The resource graph, the cascade, and layout determinism.
 *
 * The determinism test is the load-bearing one. A layout seeded from
 * Math.random() looks fine and quietly destroys the product's differentiator:
 * if the map rearranges itself between scans, you cannot tell what moved.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from './helpers.js';
import { impactOf, resourcesOf } from '../src/extract/graph.js';
import { simulate } from '../src/extract/simulate.js';
import { layout, layout3d, project, fitScale } from '../src/report/layout.js';

describe('resource graph', () => {
  const { graph, behaviours } = scan('gapdemo');

  test('resources are keyed and deduplicated across behaviours', () => {
    const keys = graph.map((n) => n.key);
    assert.equal(new Set(keys).size, keys.length, 'no duplicate resource nodes');
  });

  test('it is ranked by blast radius', () => {
    const counts = graph.map((n) => n.touches.length);
    assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  });

  test('reads, writes and deletes are counted separately', () => {
    const users = graph.find((n) => n.resource.name === 'users');
    assert.ok(users, 'the users table should be in the graph');
    assert.ok(users.deletes > 0, 'something deletes from users');
  });

  test('a behaviour knows what it depends on', () => {
    const del = behaviours.find((b) => b.title.includes('DELETE /api/projects'));
    const names = resourcesOf(del!).map((r) => r.name);
    assert.ok(names.includes('projects'));
  });
});

describe('impact is phrased as consequences', () => {
  const { graph } = scan('gapdemo');

  test('the headline names a number of behaviours, not a statistic', () => {
    const node = graph[0];
    const impact = impactOf(node);
    assert.ok(impact.consequences[0].match(/\d+ behaviour/));
    assert.equal(impact.blastRadius, node.touches.length);
  });

  test('a service is not described as having a shape you can change', () => {
    const { graph: g } = scan('gapdemo');
    const service = g.find((n) => n.resource.kind === 'service');
    if (!service) return;
    const text = impactOf(service).consequences.join(' ');
    assert.ok(
      !text.includes('change its shape'),
      "you cannot change the shape of someone else's API",
    );
  });
});

describe('the cascade', () => {
  const { graph } = scan('gapdemo');

  test('wave one is direct; everything after it is inference', () => {
    const sim = simulate(graph[0], graph);
    assert.equal(sim.waves[0].certainty, 'direct');
    for (const wave of sim.waves.slice(1)) {
      assert.equal(
        wave.certainty,
        'inferred',
        'a cascade presented as confidently as a direct reference oversells what we can see',
      );
    }
  });

  test('it always says how far to trust itself', () => {
    const sim = simulate(graph[0], graph);
    assert.ok(sim.caveats.length > 0);
    assert.ok(sim.caveats.join(' ').includes('literally'));
  });

  test('the premise matches the kind of thing being changed', () => {
    const service = graph.find((n) => n.resource.kind === 'service');
    if (!service) return;
    assert.ok(simulate(service, graph).premise.includes('stops responding'));
  });
});

describe('layout determinism', () => {
  const nodes = [
    { key: 'a', weight: 5 },
    { key: 'b', weight: 3 },
    { key: 'c', weight: 8 },
    { key: 'd', weight: 1 },
  ];
  const edges = [
    { a: 'a', b: 'b', weight: 2 },
    { a: 'b', b: 'c', weight: 4 },
    { a: 'c', b: 'd', weight: 1 },
  ];

  test('2d layout is identical across runs', () => {
    const one = layout(nodes, edges);
    const two = layout(nodes, edges);
    for (const key of one.nodes.keys()) {
      assert.deepEqual(one.nodes.get(key), two.nodes.get(key));
    }
  });

  test('3d layout is identical across runs', () => {
    const one = layout3d(nodes, edges);
    const two = layout3d(nodes, edges);
    for (const key of one.nodes.keys()) {
      assert.deepEqual(one.nodes.get(key), two.nodes.get(key));
    }
  });

  test('different graphs do not share an arrangement', () => {
    const other = layout([...nodes, { key: 'e', weight: 2 }], edges);
    assert.notDeepEqual(layout(nodes, edges).nodes.get('a'), other.nodes.get('a'));
  });

  test('no node lands outside the viewBox', () => {
    const result = layout(nodes, edges);
    for (const n of result.nodes.values()) {
      assert.ok(n.x >= 0 && n.x <= result.width, `x out of bounds: ${n.x}`);
      assert.ok(n.y >= 0 && n.y <= result.height, `y out of bounds: ${n.y}`);
    }
  });

  test('projection stays finite through a full rotation', () => {
    const model = layout3d(nodes, edges);
    const distance = model.radius * 2.5;
    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.2) {
      for (const point of model.nodes.values()) {
        const p = project(point, yaw, -0.32, distance, 500);
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'projection went non-finite');
        assert.ok(p.scale > 0, 'perspective scale inverted — the camera is inside the model');
      }
    }
  });

  test('the fit keeps every node in frame at every angle', () => {
    const model = layout3d(nodes, edges);
    const distance = model.radius * 2.5;
    const fit = fitScale([...model.nodes.values()], distance, 460);
    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.3) {
      for (let pitch = -1.2; pitch <= 1.2; pitch += 0.6) {
        for (const point of model.nodes.values()) {
          const p = project(point, yaw, pitch, distance, 0);
          const x = 500 + p.x * fit;
          const y = 500 + p.y * fit;
          assert.ok(x >= -5 && x <= 1005, `x escaped the frame at yaw ${yaw.toFixed(1)}: ${x}`);
          assert.ok(y >= -5 && y <= 1005, `y escaped the frame at yaw ${yaw.toFixed(1)}: ${y}`);
        }
      }
    }
  });
});
