
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
  medianRaw: number;
  variance: number;
  confidenceInterval: [number, number];
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
