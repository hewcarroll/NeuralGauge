
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
  runCount: number;
  warmupCount: number;
  /** Median of the primary metric's per-run values, in that metric's unit. */
  medianRaw: number;
  /** Sample standard deviation of the same per-run values. */
  stdDev: number;
  /** stdDev as a percentage of the mean; NaN for legacy sessions. */
  cvPercent: number;
  /** Distribution-free 95% interval for medianRaw; it always contains it. */
  medianCi95: [number, number];
  /** False when there were too few runs for a 95% interval (then it's min–max). */
  medianCiValid: boolean;
  /** The score at each end of medianCi95, on the score's own scale. */
  scoreCi95: [number, number] | null;
  /** Saved by NeuralGauge 1.0.x on rust-hwbench 0.1: its interval was for the mean
   *  and its "variance" was a standard deviation. Shown, but labeled as such. */
  legacyStats?: boolean;
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

export interface SystemInfo {
  cpuModel: string;
  cpuCoresPhysical: number;
  cpuCoresLogical: number;
  cpuFrequencyMhz: number;
  ramTotalGb: number;
  gpuName: string;
  gpuBackend: string;
  gpuIsDiscrete: boolean;
  os: string;
}

export interface BenchmarkConfig {
  cpuMatrixSize: number;
  cpuThreadCount: number | null;
  gpuIterations: number;
  gpuWorkgroupSize: number;
  npuIterations: number;
  ramBufferSizeMb: number;
  vramBufferSizeMb: number;
}

export interface ConfigPreset {
  id: string;
  name: string;
  config: BenchmarkConfig;
}

export enum AIProviderType {
  NONE = 'none',
  GEMINI = 'gemini',
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  LOCAL = 'local',
}

export interface AIProviderConfig {
  provider: AIProviderType;
  apiKey: string;
  model: string;
  localEndpoint: string; // For local models (Ollama, LM Studio, etc.)
}

export const DEFAULT_CONFIG: BenchmarkConfig = {
  cpuMatrixSize: 512,
  cpuThreadCount: null, // auto-detect
  gpuIterations: 4096,
  gpuWorkgroupSize: 256,
  npuIterations: 100,
  ramBufferSizeMb: 128,
  vramBufferSizeMb: 128,
};
