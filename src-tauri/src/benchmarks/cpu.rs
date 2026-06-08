use std::time::Instant;
use rayon::prelude::*;
use super::{CpuConfig, BenchmarkResultPayload, BenchmarkMetric, warmup_and_measure, calibrate};

const WARMUP: usize = 2;
const RUNS: usize = 5;

// Calibration anchors: (GFLOPS, score)
// Single-core approximate GFLOPS for reference CPUs
const CPU_ANCHORS: &[(f64, f64)] = &[
    (15.0,   1000.0),   // i3-12100 class
    (30.0,   3000.0),   // i5-12400 class
    (50.0,   5000.0),   // i7-12700K class
    (70.0,   7500.0),   // i9-13900K class
    (100.0, 10000.0),   // i9-14900KS class
];

fn matmul_single_core(n: usize) -> f64 {
    let mut a = vec![0.0f32; n * n];
    let mut b = vec![0.0f32; n * n];
    let mut c = vec![0.0f32; n * n];

    // Initialize
    for i in 0..a.len() {
        a[i] = (i as f32 * 0.001) % 1.0;
        b[i] = ((i + 7) as f32 * 0.0013) % 1.0;
    }

    let start = Instant::now();
    for i in 0..n {
        for k in 0..n {
            let a_ik = a[i * n + k];
            for j in 0..n {
                c[i * n + j] += a_ik * b[k * n + j];
            }
        }
    }
    let elapsed = start.elapsed().as_secs_f64();

    // Prevent dead-code elimination
    std::hint::black_box(&c);

    let ops = 2.0 * (n as f64).powi(3);
    ops / elapsed / 1e9 // GFLOPS
}

fn matmul_multi_core(n: usize, thread_count: Option<usize>) -> f64 {
    let mut c = vec![0.0f32; n * n];
    let a: Vec<f32> = (0..n * n).map(|i| (i as f32 * 0.001) % 1.0).collect();
    let b: Vec<f32> = (0..n * n).map(|i| ((i + 7) as f32 * 0.0013) % 1.0).collect();

    // Build thread pool if specific count requested
    let pool = if let Some(tc) = thread_count {
        Some(
            rayon::ThreadPoolBuilder::new()
                .num_threads(tc)
                .build()
                .unwrap(),
        )
    } else {
        None
    };

    let mut compute = || {
        let start = Instant::now();
        c.par_chunks_mut(n)
            .enumerate()
            .for_each(|(i, row)| {
                for k in 0..n {
                    let a_ik = a[i * n + k];
                    for j in 0..n {
                        row[j] += a_ik * b[k * n + j];
                    }
                }
            });
        start.elapsed().as_secs_f64()
    };

    let elapsed = if let Some(ref pool) = pool {
        pool.install(compute)
    } else {
        compute()
    };

    std::hint::black_box(&c);

    let ops = 2.0 * (n as f64).powi(3);
    ops / elapsed / 1e9 // GFLOPS
}

fn cache_latency_ns(buffer_size: usize) -> f64 {
    let count = buffer_size / std::mem::size_of::<usize>();
    if count < 2 {
        return 0.0;
    }

    // Build pointer-chase chain (random permutation)
    let mut indices: Vec<usize> = (0..count).collect();
    // Fisher-Yates shuffle with deterministic seed
    let mut seed: u64 = 0xDEADBEEF;
    for i in (1..count).rev() {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let j = (seed >> 33) as usize % (i + 1);
        indices.swap(i, j);
    }

    let mut chain = vec![0usize; count];
    for i in 0..count {
        chain[i] = indices[(i + 1) % count];
    }

    // Chase pointers
    let iterations = 1_000_000.min(count * 100);
    let mut idx = 0usize;

    let start = Instant::now();
    for _ in 0..iterations {
        idx = chain[idx];
    }
    let elapsed = start.elapsed().as_nanos() as f64;

    std::hint::black_box(idx);

    elapsed / iterations as f64
}

pub fn run(config: CpuConfig) -> Result<BenchmarkResultPayload, String> {
    let n = config.matrix_size.unwrap_or(512);

    // Single-core GFLOPS (warmup + median)
    let single_stats = warmup_and_measure(|| matmul_single_core(n), WARMUP, RUNS);

    // Multi-core GFLOPS
    let multi_stats = warmup_and_measure(
        || matmul_multi_core(n, config.thread_count),
        WARMUP,
        RUNS,
    );

    // Cache latency tests
    let l1_latency = cache_latency_ns(32 * 1024);        // 32 KB
    let l2_latency = cache_latency_ns(256 * 1024);       // 256 KB
    let l3_latency = cache_latency_ns(8 * 1024 * 1024);  // 8 MB
    let mem_latency = cache_latency_ns(64 * 1024 * 1024); // 64 MB

    let score = calibrate(single_stats.median, CPU_ANCHORS);
    let ci = single_stats.confidence_95();

    Ok(BenchmarkResultPayload {
        component_type: "CPU".to_string(),
        score,
        metrics: vec![
            BenchmarkMetric {
                name: "Single-Core FP32".to_string(),
                value: round2(single_stats.median),
                unit: "GFLOPS".to_string(),
                description: "Single-threaded matrix multiply throughput".to_string(),
            },
            BenchmarkMetric {
                name: "Multi-Core FP32".to_string(),
                value: round2(multi_stats.median),
                unit: "GFLOPS".to_string(),
                description: "Multi-threaded matrix multiply throughput".to_string(),
            },
            BenchmarkMetric {
                name: "L1 R-Lat".to_string(),
                value: round2(l1_latency),
                unit: "ns".to_string(),
                description: "L1 cache random access latency".to_string(),
            },
            BenchmarkMetric {
                name: "L2 R-Lat".to_string(),
                value: round2(l2_latency),
                unit: "ns".to_string(),
                description: "L2 cache random access latency".to_string(),
            },
            BenchmarkMetric {
                name: "L3 R-Lat".to_string(),
                value: round2(l3_latency),
                unit: "ns".to_string(),
                description: "L3 cache random access latency".to_string(),
            },
            BenchmarkMetric {
                name: "Memory R-Lat".to_string(),
                value: round2(mem_latency),
                unit: "ns".to_string(),
                description: "Main memory random access latency".to_string(),
            },
        ],
        run_count: RUNS,
        warmup_count: WARMUP,
        median_raw: round2(single_stats.median),
        variance: round2(single_stats.std_dev),
        confidence_interval: [round2(ci[0]), round2(ci[1])],
        error: None,
    })
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
