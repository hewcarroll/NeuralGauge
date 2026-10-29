import { BenchmarkResult, SavedSession } from '../types';

/**
 * Sessions saved by NeuralGauge 1.0.x hold rust-hwbench 0.1 statistics: `variance` was
 * really a standard deviation and `confidenceInterval` was the interval of the mean, not
 * the median. Map them onto the current fields and mark them, so the UI can label them.
 */
export function upgradeResult(r: BenchmarkResult & { variance?: number; confidenceInterval?: [number, number] }): BenchmarkResult {
  if (r.medianCi95 !== undefined) return r;
  const { variance, confidenceInterval, ...rest } = r;
  return {
    ...rest,
    stdDev: variance ?? 0,
    cvPercent: Number.NaN,
    medianCi95: confidenceInterval ?? [0, 0],
    medianCiValid: false,
    scoreCi95: null,
    legacyStats: true,
  };
}

export function upgradeSession(s: SavedSession): SavedSession {
  return { ...s, results: s.results.map(upgradeResult) };
}
