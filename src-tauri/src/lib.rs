//! CH-PIB's Tauri command layer.
//!
//! The benchmark engine (CPU/GPU/RAM/VRAM/NPU measurement + system detection)
//! lives in the `rust-hwbench` crate. This file is the thin desktop shell on top:
//! it exposes the engine to the UI as Tauri commands and applies the opt-in,
//! calibrated 0–10000 `score` (rust-hwbench returns raw measurements with
//! `score: None`; the opinionated score is CH-PIB's layer).
use rust_hwbench::{
    apply_score, benchmarks, BenchmarkResultPayload, CpuConfig, GpuConfig, NpuConfig, RamConfig,
    SystemInfo, VramConfig,
};

#[tauri::command]
async fn get_system_info() -> Result<SystemInfo, String> {
    rust_hwbench::system::detect().await
}

#[tauri::command]
async fn run_cpu_benchmark(config: CpuConfig) -> Result<BenchmarkResultPayload, String> {
    let mut r = benchmarks::cpu::run(config).map_err(|e| e.to_string())?;
    apply_score(&mut r);
    Ok(r)
}

#[tauri::command]
async fn run_gpu_benchmark(config: GpuConfig) -> Result<BenchmarkResultPayload, String> {
    let mut r = benchmarks::gpu::run(config).await.map_err(|e| e.to_string())?;
    apply_score(&mut r);
    Ok(r)
}

#[tauri::command]
async fn run_vram_benchmark(config: VramConfig) -> Result<BenchmarkResultPayload, String> {
    let mut r = benchmarks::vram::run(config).await.map_err(|e| e.to_string())?;
    apply_score(&mut r);
    Ok(r)
}

#[tauri::command]
async fn run_npu_benchmark(config: NpuConfig) -> Result<BenchmarkResultPayload, String> {
    // NPU has no calibrated scale, so its score stays None (the UI renders 0).
    let mut r = benchmarks::npu::run(config).map_err(|e| e.to_string())?;
    apply_score(&mut r);
    Ok(r)
}

#[tauri::command]
async fn run_ram_benchmark(config: RamConfig) -> Result<BenchmarkResultPayload, String> {
    let mut r = benchmarks::ram::run(config).map_err(|e| e.to_string())?;
    apply_score(&mut r);
    Ok(r)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            run_cpu_benchmark,
            run_gpu_benchmark,
            run_vram_benchmark,
            run_npu_benchmark,
            run_ram_benchmark,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
