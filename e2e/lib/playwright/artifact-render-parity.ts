import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export type PixelComparison = {
  actualWidth: number;
  actualHeight: number;
  expectedWidth: number;
  expectedHeight: number;
  width: number;
  height: number;
  totalPixels: number;
  exactDiffPixels: number;
  exactDiffRatio: number;
  perceptualDiffPixels: number;
  perceptualDiffRatio: number;
  diffPng: Buffer;
};

export type ParityClassification =
  | 'exact'
  | 'perceptually-equivalent'
  | 'different'
  | 'unstable';

export function comparePngBuffers(
  actualBuffer: Buffer,
  expectedBuffer: Buffer,
  perceptualThreshold = 0.1,
): PixelComparison {
  const actual = PNG.sync.read(actualBuffer);
  const expected = PNG.sync.read(expectedBuffer);
  const width = Math.max(actual.width, expected.width);
  const height = Math.max(actual.height, expected.height);
  const normalizedActual = normalizePngSize(actual, width, height);
  const normalizedExpected = normalizePngSize(expected, width, height);
  const totalPixels = width * height;
  const exactDiffPixels = pixelmatch(
    normalizedActual.data,
    normalizedExpected.data,
    undefined,
    width,
    height,
    { includeAA: true, threshold: 0 },
  );
  const diff = new PNG({ width, height });
  const perceptualDiffPixels = pixelmatch(
    normalizedActual.data,
    normalizedExpected.data,
    diff.data,
    width,
    height,
    { includeAA: false, threshold: perceptualThreshold },
  );

  return {
    actualWidth: actual.width,
    actualHeight: actual.height,
    expectedWidth: expected.width,
    expectedHeight: expected.height,
    width,
    height,
    totalPixels,
    exactDiffPixels,
    exactDiffRatio: ratio(exactDiffPixels, totalPixels),
    perceptualDiffPixels,
    perceptualDiffRatio: ratio(perceptualDiffPixels, totalPixels),
    diffPng: PNG.sync.write(diff),
  };
}

function normalizePngSize(source: PNG, width: number, height: number): PNG {
  if (source.width === width && source.height === height) return source;
  const normalized = new PNG({ width, height });
  PNG.bitblt(source, normalized, 0, 0, source.width, source.height, 0, 0);
  return normalized;
}

export function classifyPixelParity(input: {
  comparison: Pick<PixelComparison, 'exactDiffPixels' | 'perceptualDiffRatio'>;
  actualSelfDriftRatio: number;
  expectedSelfDriftRatio: number;
  maxPerceptualDiffRatio: number;
  maxSelfDriftRatio: number;
}): ParityClassification {
  if (
    input.actualSelfDriftRatio > input.maxSelfDriftRatio
    || input.expectedSelfDriftRatio > input.maxSelfDriftRatio
  ) {
    return 'unstable';
  }
  if (input.comparison.exactDiffPixels === 0) return 'exact';
  if (input.comparison.perceptualDiffRatio <= input.maxPerceptualDiffRatio) {
    return 'perceptually-equivalent';
  }
  return 'different';
}

const PARITY_CLASSIFICATION_SEVERITY: Record<ParityClassification, number> = {
  exact: 0,
  'perceptually-equivalent': 1,
  unstable: 2,
  different: 3,
};

export function combinePixelParityClassifications(
  ...classifications: [ParityClassification, ...ParityClassification[]]
): ParityClassification {
  return classifications.reduce((worst, classification) => (
    PARITY_CLASSIFICATION_SEVERITY[classification] > PARITY_CLASSIFICATION_SEVERITY[worst]
      ? classification
      : worst
  ));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
