/** One byte per pixel; any non-zero value is foreground. */
export interface BinaryImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export type Connectivity = 4 | 8;
export type LabelAlgorithm = 'bfs' | 'union-find';

export interface LabelOptions {
  /** 4 (default) or 8. */
  connectivity?: Connectivity;
  /** Both produce identical labels (numbered by first pixel in raster order). Default 'bfs'. */
  algorithm?: LabelAlgorithm;
  /** Components with fewer pixels are removed (label 0) and not counted. Default 1. */
  minArea?: number;
  /** Throws if more components than this survive. Default 1_000_000. */
  maxComponents?: number;
  maxPixels?: number;
}

export interface Component {
  /** 1-based label in `labels`. */
  label: number;
  area: number;
  /** Inclusive pixel bounds. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  /** Mean of pixel indices (x, y), so a single pixel at (3, 2) has centroid (3, 2). */
  centroidX: number;
  centroidY: number;
}

export interface LabelResult {
  width: number;
  height: number;
  /** 0 = background or removed; otherwise 1..count. */
  labels: Uint32Array;
  count: number;
  components: Component[];
}

export const DEFAULT_MAX_PIXELS = 16_777_216;
export const DEFAULT_MAX_COMPONENTS = 1_000_000;

function positive(name: string, value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new RangeError(`${name} must be a positive integer`);
  return value as number;
}

export function labelComponents(image: BinaryImage, options: LabelOptions = {}): LabelResult {
  if (typeof options !== 'object' || options === null)
    throw new TypeError('options must be an object');
  const candidate = image as Partial<BinaryImage> | null;
  if (typeof candidate !== 'object' || candidate === null)
    throw new TypeError('image must be an object');
  const width = positive('width', candidate.width);
  const height = positive('height', candidate.height);
  const data = candidate.data;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) {
    throw new TypeError('data must be a Uint8Array or Uint8ClampedArray');
  }
  const maxPixels = positive('maxPixels', options.maxPixels ?? DEFAULT_MAX_PIXELS);
  if (width * height > maxPixels) throw new RangeError('image exceeds maxPixels');
  if (data.length !== width * height) throw new RangeError('data length must equal width * height');
  const connectivity = options.connectivity ?? 4;
  if (connectivity !== 4 && connectivity !== 8) throw new RangeError('connectivity must be 4 or 8');
  const algorithm = options.algorithm ?? 'bfs';
  if (algorithm !== 'bfs' && algorithm !== 'union-find') throw new TypeError('unknown algorithm');
  const minArea = positive('minArea', options.minArea ?? 1);
  const maxComponents = positive('maxComponents', options.maxComponents ?? DEFAULT_MAX_COMPONENTS);

  const n = width * height;
  const raw =
    algorithm === 'bfs'
      ? bfs(data, width, height, connectivity)
      : unionFind(data, width, height, connectivity);

  const area = new Uint32Array(raw.count + 1);
  for (let i = 0; i < n; i++) area[raw.labels[i]!]!++;
  const remap = new Uint32Array(raw.count + 1);
  let count = 0;
  for (let l = 1; l <= raw.count; l++) {
    if (area[l]! >= minArea) {
      if (++count > maxComponents) throw new RangeError('component count exceeds maxComponents');
      remap[l] = count;
    }
  }
  const labels = new Uint32Array(n);
  const components: Component[] = Array.from({ length: count }, (_, i) => ({
    label: i + 1,
    area: 0,
    minX: width,
    minY: height,
    maxX: -1,
    maxY: -1,
    width: 0,
    height: 0,
    centroidX: 0,
    centroidY: 0,
  }));
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      const label = remap[raw.labels[i]!]!;
      if (label === 0) continue;
      labels[i] = label;
      const c = components[label - 1]!;
      c.area++;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      c.centroidX += x;
      c.centroidY += y;
    }
  }
  for (const c of components) {
    c.width = c.maxX - c.minX + 1;
    c.height = c.maxY - c.minY + 1;
    c.centroidX /= c.area;
    c.centroidY /= c.area;
  }
  return { width, height, labels, count, components };
}

function neighbourOffsets(connectivity: Connectivity): [number, number][] {
  return connectivity === 8
    ? [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]
    : [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ];
}

function bfs(data: ArrayLike<number>, width: number, height: number, connectivity: Connectivity) {
  const labels = new Uint32Array(width * height);
  const queue = new Uint32Array(width * height);
  const offsets = neighbourOffsets(connectivity);
  let count = 0;
  for (let start = 0; start < labels.length; start++) {
    if (!data[start] || labels[start]) continue;
    count++;
    let head = 0;
    let tail = 0;
    labels[start] = count;
    queue[tail++] = start;
    while (head < tail) {
      const p = queue[head++]!;
      const px = p % width;
      const py = (p - px) / width;
      for (const [dx, dy] of offsets) {
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const q = y * width + x;
        if (data[q] && !labels[q]) {
          labels[q] = count;
          queue[tail++] = q;
        }
      }
    }
  }
  return { labels, count };
}

function unionFind(
  data: ArrayLike<number>,
  width: number,
  height: number,
  connectivity: Connectivity,
) {
  const n = width * height;
  const parent = new Uint32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a: number): number => {
    let root = a;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[a] !== root) {
      const next = parent[a]!;
      parent[a] = root;
      a = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    // Keep the smaller index as root so representatives are the first raster pixel.
    if (ra < rb) parent[rb] = ra;
    else if (rb < ra) parent[ra] = rb;
  };
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      if (!data[i]) continue;
      if (x > 0 && data[i - 1]) union(i, i - 1);
      if (y > 0) {
        if (data[i - width]) union(i, i - width);
        if (connectivity === 8) {
          if (x > 0 && data[i - width - 1]) union(i, i - width - 1);
          if (x < width - 1 && data[i - width + 1]) union(i, i - width + 1);
        }
      }
    }
  }
  const labels = new Uint32Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (!data[i]) continue;
    const root = find(i);
    if (root === i) labels[i] = ++count;
    else labels[i] = labels[root]!;
  }
  return { labels, count };
}
