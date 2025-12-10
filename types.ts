
export enum ComponentType {
  CPU = 'CPU',
  GPU = 'GPU',
  GPU_MEMORY = 'GPU_MEMORY',
  NPU = 'NPU',
  RAM = 'RAM',
  FULL_SUITE = 'FULL_SUITE'
}

export interface BenchmarkMetric {
  name: string;
  value: number;
  unit: string;
  description: string;
}

export interface BenchmarkResult {
  type: ComponentType;
  score: number;
  metrics: BenchmarkMetric[];
  timestamp: number;
  durationMs: number;
  error?: string;
}

export interface AnalysisResult {
  markdown: string;
  aiReadinessScore: number; // 0-100
  recommendedModels: string[];
}

export interface SavedSession {
  id: string;
  name: string;
  timestamp: number;
  results: BenchmarkResult[];
  analysis: AnalysisResult | null;
}

export interface BenchmarkConfig {
  cpuMatrixSize: number;
  cpuLatencyIterations: number;
  gpuResolution: number;
  gpuIterations: number;
  npuMatrixSize: number;
  ramChunkSizeMb: number;
  vramTextureSize: number;
  gpuLatencyIterations: number;
}

export interface ConfigPreset {
  id: string;
  name: string;
  config: BenchmarkConfig;
}

export const DEFAULT_CONFIG: BenchmarkConfig = {
  cpuMatrixSize: 512,
  cpuLatencyIterations: 5000000, // 5 Million ops
  gpuResolution: 1024,
  gpuIterations: 2000,
  npuMatrixSize: 1024,
  ramChunkSizeMb: 16,
  vramTextureSize: 2048,
  gpuLatencyIterations: 20,
};
