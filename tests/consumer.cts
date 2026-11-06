import {
  labelComponents,
  type BinaryImage,
  type Component,
  type Connectivity,
  type LabelOptions,
  type LabelResult,
} from '@lp-labs/image-connected-components';
const image: BinaryImage = { width: 2, height: 2, data: new Uint8Array(4) };
const connectivity: Connectivity = 8;
const options: LabelOptions = { connectivity, algorithm: 'union-find', minArea: 2 };
const result: LabelResult = labelComponents(image, options);
const first: Component | undefined = result.components[0];
result.labels.length.toFixed();
first?.centroidX.toFixed();
// @ts-expect-error only 4 or 8
labelComponents(image, { connectivity: 6 });
// @ts-expect-error unknown algorithm
labelComponents(image, { algorithm: 'dfs' });
// @ts-expect-error data must be bytes
labelComponents({ width: 1, height: 1, data: [1] });
