import test from 'node:test';
import assert from 'node:assert/strict';
import { labelComponents } from '../dist/esm/index.js';

const lcg = (seed) => {
  let s = seed;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
};
const randomImage = (width, height, seed, density) => {
  const rand = lcg(seed);
  return {
    width,
    height,
    data: Uint8Array.from({ length: width * height }, () => (rand() < density ? 1 : 0)),
  };
};
const parse = (rows) => ({
  width: rows[0].length,
  height: rows.length,
  data: Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0)),
});

// Independent reference: min-index propagation to a fixpoint, then renumber by first raster pixel.
function reference(img, connectivity) {
  const { width, height, data } = img;
  const comp = Array.from({ length: width * height }, (_, i) => (data[i] ? i : -1));
  const deltas = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && (connectivity === 8 || !dx || !dy)) deltas.push([dx, dy]);
    }
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (comp[i] < 0) continue;
        for (const [dx, dy] of deltas) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (comp[j] >= 0 && comp[j] < comp[i]) {
            comp[i] = comp[j];
            changed = true;
          }
        }
      }
  }
  const ids = new Map();
  return comp.map((c) => (c < 0 ? 0 : (ids.get(c) ?? (ids.set(c, ids.size + 1), ids.size))));
}

test('rejects malformed images and options', () => {
  const img = parse(['##', '..']);
  assert.throws(() => labelComponents(null), TypeError);
  assert.throws(() => labelComponents({ width: 2, height: 2, data: [1, 0, 0, 0] }), TypeError);
  assert.throws(() => labelComponents({ ...img, data: new Uint8Array(3) }), RangeError);
  for (const bad of [0, -1, 1.5, Number.NaN, Infinity]) {
    assert.throws(() => labelComponents({ ...img, width: bad }), RangeError);
  }
  assert.throws(() => labelComponents(img, null), TypeError);
  assert.throws(() => labelComponents(img, { connectivity: 6 }), RangeError);
  assert.throws(() => labelComponents(img, { algorithm: 'dfs' }), TypeError);
  assert.throws(() => labelComponents(img, { minArea: 0 }), RangeError);
  assert.throws(() => labelComponents(img, { maxPixels: 3 }), RangeError);
  assert.throws(() => labelComponents(img, { maxComponents: 0 }), RangeError);
});

test('4- versus 8-connectivity on diagonal pixels', () => {
  const img = parse(['#.', '.#']);
  assert.equal(labelComponents(img).count, 2);
  assert.equal(labelComponents(img, { connectivity: 8 }).count, 1);
  assert.equal(labelComponents(img, { algorithm: 'union-find' }).count, 2);
  assert.equal(labelComponents(img, { algorithm: 'union-find', connectivity: 8 }).count, 1);
});

test('hand-checked labels and statistics', () => {
  const img = parse(['##..#', '#...#', '..#..', '.###.']);
  const r = labelComponents(img);
  assert.deepEqual(
    Array.from(r.labels),
    [1, 1, 0, 0, 2, 1, 0, 0, 0, 2, 0, 0, 3, 0, 0, 0, 3, 3, 3, 0],
  );
  assert.equal(r.count, 3);
  assert.deepEqual(r.components[0], {
    label: 1,
    area: 3,
    minX: 0,
    minY: 0,
    maxX: 1,
    maxY: 1,
    width: 2,
    height: 2,
    centroidX: 1 / 3,
    centroidY: 1 / 3,
  });
  assert.deepEqual(r.components[1], {
    label: 2,
    area: 2,
    minX: 4,
    minY: 0,
    maxX: 4,
    maxY: 1,
    width: 1,
    height: 2,
    centroidX: 4,
    centroidY: 0.5,
  });
  assert.deepEqual(r.components[2], {
    label: 3,
    area: 4,
    minX: 1,
    minY: 2,
    maxX: 3,
    maxY: 3,
    width: 3,
    height: 2,
    centroidX: 2,
    centroidY: 2.75,
  });
});

test('BFS, union-find and the fixpoint reference agree on random images', () => {
  for (const [w, h, seed, density] of [
    [16, 12, 1, 0.5],
    [31, 9, 2, 0.6],
    [1, 20, 3, 0.7],
    [20, 1, 4, 0.7],
    [25, 25, 5, 0.4],
    [40, 30, 6, 0.55],
  ]) {
    const img = randomImage(w, h, seed, density);
    for (const connectivity of [4, 8]) {
      const expected = reference(img, connectivity);
      for (const algorithm of ['bfs', 'union-find']) {
        const r = labelComponents(img, { connectivity, algorithm });
        assert.deepEqual(Array.from(r.labels), expected, `${algorithm} ${connectivity}`);
        assert.equal(r.count, Math.max(0, ...expected));
        assert.equal(
          r.components.reduce((s, c) => s + c.area, 0),
          img.data.reduce((s, v) => s + (v ? 1 : 0), 0),
        );
      }
    }
  }
});

test('stats match a brute-force scan of the label image', () => {
  const img = randomImage(30, 20, 9, 0.5);
  const r = labelComponents(img, { connectivity: 8 });
  for (const c of r.components) {
    let area = 0,
      sx = 0,
      sy = 0,
      minX = 99,
      minY = 99,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++) {
        if (r.labels[y * r.width + x] !== c.label) continue;
        area++;
        sx += x;
        sy += y;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    assert.deepEqual([c.area, c.minX, c.minY, c.maxX, c.maxY], [area, minX, minY, maxX, maxY]);
    assert.ok(
      Math.abs(c.centroidX - sx / area) < 1e-12 && Math.abs(c.centroidY - sy / area) < 1e-12,
    );
    assert.equal(c.width, maxX - minX + 1);
    assert.equal(c.height, maxY - minY + 1);
  }
});

test('minArea removes small components and renumbers; maxComponents and maxPixels bound work', () => {
  const img = parse(['#.##', '#...', '....', '###.']);
  const r = labelComponents(img, { minArea: 2 });
  assert.equal(r.count, 3);
  assert.deepEqual(Array.from(r.labels), [1, 0, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 0]);
  assert.equal(labelComponents(img, { minArea: 3 }).count, 1);
  assert.equal(labelComponents(img, { minArea: 100 }).count, 0);
  assert.throws(() => labelComponents(img, { maxComponents: 2, minArea: 2 }), RangeError);
  assert.equal(labelComponents(img, { maxComponents: 2, minArea: 3 }).count, 1);
  assert.doesNotThrow(() => labelComponents(img, { maxPixels: 16 }));
});

test('empty, full and snake images; owned outputs; input untouched; large image bounded time', () => {
  const empty = { width: 4, height: 4, data: new Uint8Array(16) };
  const none = labelComponents(empty);
  assert.equal(none.count, 0);
  assert.deepEqual(none.components, []);
  const full = { width: 4, height: 4, data: new Uint8ClampedArray(16).fill(255) };
  assert.equal(labelComponents(full).components[0].area, 16);
  const snake = parse(['#####', '....#', '#####', '#....', '#####']);
  for (const algorithm of ['bfs', 'union-find'])
    assert.equal(labelComponents(snake, { algorithm }).count, 1);
  const before = Array.from(full.data);
  const r = labelComponents(full);
  assert.deepEqual(Array.from(full.data), before);
  assert.notEqual(r.labels.buffer, full.data.buffer);
  const big = randomImage(1200, 1000, 11, 0.6);
  for (const algorithm of ['bfs', 'union-find']) {
    const t = Date.now();
    labelComponents(big, { connectivity: 8, algorithm });
    assert.ok(Date.now() - t < 5000);
  }
});
