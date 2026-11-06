# @lp-labs/image-connected-components

Connected-component labelling for binary masks with 4- or 8-connectivity, BFS or union-find, and per-component area, bounding box and centroid. Catalog identity 494; standalone package version 1.0.0.
No runtime, peer, or sibling dependencies. Node >=18, ESM and CommonJS with declarations.

## Install

```sh
npm install @lp-labs/image-connected-components
```

## Quickstart (runnable JavaScript)

```js
import assert from 'node:assert/strict';
import { labelComponents } from '@lp-labs/image-connected-components';
const mask = { width: 4, height: 3, data: Uint8Array.from([1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0]) };
const result = labelComponents(mask);
assert.equal(result.count, 3);
assert.deepEqual(Array.from(result.labels), [1, 1, 0, 0, 0, 0, 0, 2, 3, 3, 0, 0]);
assert.equal(result.components[0].area, 2);
assert.equal(result.components[0].centroidX, 0.5);
assert.equal(
  labelComponents({ width: 2, height: 2, data: Uint8Array.from([1, 0, 0, 1]) }, { connectivity: 8 })
    .count,
  1,
);
```

## Configuration and errors

`labelComponents(image, options)` takes `{ width, height, data }` where data is a Uint8Array or Uint8ClampedArray of `width * height` bytes (non-zero = foreground) and returns `{ width, height, labels, count, components }`. `labels` is a new Uint32Array with 0 for background and 1..count for components, numbered by each component's first pixel in raster order. The same labelling is produced by both algorithms.

Options: `connectivity` 4 (default) or 8; `algorithm` `'bfs'` (default, iterative queue) or `'union-find'` (single raster pass with path compression); `minArea` (default 1) removes smaller components, which become label 0 and are not counted or renumbered around; `maxComponents` (default 1000000) throws when more components survive; `maxPixels` (default 16777216) bounds the image size.

Each component has `label`, `area`, inclusive `minX/minY/maxX/maxY`, `width`, `height` and `centroidX/centroidY`, the mean of the pixel indices (the centre of a pixel at (3, 2) is reported as 3, 2, not 3.5, 2.5).

Errors: `TypeError` for wrong container types or unknown algorithm; `RangeError` for invalid dimensions, data length, connectivity, counts and exceeded `maxPixels` or `maxComponents`.

## Complete public declarations

Every runtime export and public type is shown below. This is the complete emitted declaration surface.

```ts
export interface BinaryImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}
export type Connectivity = 4 | 8;
export type LabelAlgorithm = 'bfs' | 'union-find';
export interface LabelOptions {
  connectivity?: Connectivity;
  algorithm?: LabelAlgorithm;
  minArea?: number;
  maxComponents?: number;
  maxPixels?: number;
}
export interface Component {
  label: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centroidX: number;
  centroidY: number;
}
export interface LabelResult {
  width: number;
  height: number;
  labels: Uint32Array;
  count: number;
  components: Component[];
}
export declare const DEFAULT_MAX_PIXELS = 16777216;
export declare const DEFAULT_MAX_COMPONENTS = 1000000;
export declare function labelComponents(image: BinaryImage, options?: LabelOptions): LabelResult;
```

## Performance, boundaries and limitations

Binary masks only; grayscale or colour images must be thresholded by the caller. No contour tracing, hole detection, region merging by similarity or run-length output. Cost is linear in pixels; memory is the label array plus a pixel-sized queue (BFS) or parent array (union-find), both 4 bytes per pixel, so roughly 8 bytes per pixel in total with the default limit of 16.7 million pixels. Area is stored in 32 bits, which the pixel bound guarantees is sufficient.

## Development

```sh
npm ci --offline
npm run build
npm run typecheck
npm test
npm run format:check
```

The offline install requires the locked development dependencies already in the npm cache.
Build emits separate ESM/CJS and declarations; type checks include bare-package .mts/.cts consumers with negative cases.
Runtime tests import only the single-quoted standalone dist entry and also run against installed offline tarballs.
No build artifacts or development dependencies are required at runtime.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
