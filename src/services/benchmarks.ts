import { invoke } from '@tauri-apps/api/core';
import { ComponentType, BenchmarkResult, BenchmarkConfig } from '../types';

interface RustBenchmarkResult {
  componentType: string;
  score: number;
  metrics: { name: string; value: number; unit: string; description: string }[];
  runCount: number;
  warmupCount: number;
  medianRaw: number;
  variance: number;
  confidenceInterval: [number, number];
  error?: string;
}

function mapResult(raw: RustBenchmarkResult, type: ComponentType, startTime: number): BenchmarkResult {
  return {
    type,
    score: raw.score,
    metrics: raw.metrics,
    timestamp: Date.now(),
    durationMs: Date.now() - startTime,
    runCount: raw.runCount,
    warmupCount: raw.warmupCount,
    medianRaw: raw.medianRaw,
    variance: raw.variance,
    confidenceInterval: raw.confidenceInterval,
    error: raw.error,
  };
}

export async function runBenchmark(
  type: ComponentType,
  config: BenchmarkConfig
): Promise<BenchmarkResult[]> {
  if (type === ComponentType.FULL_SUITE) {
    const types = [ComponentType.CPU, ComponentType.GPU, ComponentType.NPU, ComponentType.GPU_MEMORY, ComponentType.RAM];
    const results: BenchmarkResult[] = [];
    for (const t of types) {
      const r = await runSingleBenchmark(t, config);
      results.push(r);
    }
    return results;
  }
  return [await runSingleBenchmark(type, config)];
}

async function runSingleBenchmark(
  type: ComponentType,
  config: BenchmarkConfig
): Promise<BenchmarkResult> {
  const startTime = Date.now();

  try {
    let raw: RustBenchmarkResult;

    switch (type) {
      case ComponentType.CPU:
        raw = await invoke('run_cpu_benchmark', {
          config: {
            matrixSize: config.cpuMatrixSize,
            threadCount: config.cpuThreadCount,
          },
        });
        break;

      case ComponentType.GPU:
        raw = await invoke('run_gpu_benchmark', {
          config: {
            iterations: config.gpuIterations,
            workgroupSize: config.gpuWorkgroupSize,
          },
        });
        break;

      case ComponentType.GPU_MEMORY:
        raw = await invoke('run_vram_benchmark', {
          config: {
            bufferSizeMb: config.vramBufferSizeMb,
          },
        });
        break;

      case ComponentType.NPU:
        raw = await invoke('run_npu_benchmark', {
          config: {
            iterations: config.npuIterations,
          },
        });
        break;

      case ComponentType.RAM:
        raw = await invoke('run_ram_benchmark', {
          config: {
            bufferSizeMb: config.ramBufferSizeMb,
            threadCount: null,
          },
        });
        break;

      default:
        throw new Error(`Unknown benchmark type: ${type}`);
    }

    return mapResult(raw, type, startTime);
  } catch (err) {
    return {
      type,
      score: 0,
      metrics: [],
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      runCount: 0,
      warmupCount: 0,
      medianRaw: 0,
      variance: 0,
      confidenceInterval: [0, 0],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
