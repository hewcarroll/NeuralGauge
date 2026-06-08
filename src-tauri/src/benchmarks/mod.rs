pub mod cpu;
pub mod gpu;
pub mod vram;
pub mod npu;
pub mod ram;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkMetric {
    pub name: String,
    pub value: f64,
    pub unit: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkResultPayload {
    pub component_type: String,
    pub score: u64,
    pub metrics: Vec<BenchmarkMetric>,
    pub run_count: usize,
    pub warmup_count: usize,
    pub median_raw: f64,
    pub variance: f64,
    pub confidence_interval: [f64; 2],
    pub error: Option<String>,
}

// Config types from the frontend
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuConfig {
    pub matrix_size: Option<usize>,
    pub thread_count: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuConfig {
    pub iterations: Option<u32>,
    pub workgroup_size: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VramConfig {
    pub buffer_size_mb: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct NpuConfig {
    pub iterations: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RamConfig {
    pub buffer_size_mb: Option<usize>,
    pub thread_count: Option<usize>,
}

/// Run a closure `warmup + runs` times, discard warmup, return sorted measured values.
pub fn warmup_and_measure<F: FnMut() -> f64>(mut f: F, warmup: usize, runs: usize) -> MeasurementStats {
    // Warmup
    for _ in 0..warmup {
        let _ = f();
    }

    // Measured runs
    let mut values: Vec<f64> = (0..runs).map(|_| f()).collect();
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let n = values.len() as f64;
    let mean = values.iter().sum::<f64>() / n;
    let variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
    let std_dev = variance.sqrt();
    let median = values[values.len() / 2];

    MeasurementStats {
        median,
        mean,
        std_dev,
        min: values[0],
        max: values[values.len() - 1],
        values,
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct MeasurementStats {
    pub median: f64,
    pub mean: f64,
    pub std_dev: f64,
    pub min: f64,
    pub max: f64,
    pub values: Vec<f64>,
}

impl MeasurementStats {
    pub fn confidence_95(&self) -> [f64; 2] {
        let n = self.values.len() as f64;
        let margin = 1.96 * self.std_dev / n.sqrt();
        [self.mean - margin, self.mean + margin]
    }
}

/// Map a raw measurement to the 0-10000 calibrated scale.
/// `anchors` are (raw_value, score) pairs sorted by raw_value ascending.
pub fn calibrate(raw: f64, anchors: &[(f64, f64)]) -> u64 {
    if anchors.is_empty() {
        return 0;
    }
    if raw <= anchors[0].0 {
        return (anchors[0].1 * (raw / anchors[0].0)).max(0.0) as u64;
    }
    if raw >= anchors[anchors.len() - 1].0 {
        return anchors[anchors.len() - 1].1 as u64;
    }
    for window in anchors.windows(2) {
        let (r0, s0) = window[0];
        let (r1, s1) = window[1];
        if raw >= r0 && raw <= r1 {
            let t = (raw - r0) / (r1 - r0);
            return (s0 + t * (s1 - s0)) as u64;
        }
    }
    0
}
