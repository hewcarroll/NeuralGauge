mod system;
mod benchmarks;

use benchmarks::{BenchmarkResultPayload, CpuConfig, GpuConfig, VramConfig, NpuConfig, RamConfig};
use system::SystemInfo;

#[tauri::command]
async fn get_system_info() -> Result<SystemInfo, String> {
    system::detect().await
}

#[tauri::command]
async fn run_cpu_benchmark(config: CpuConfig) -> Result<BenchmarkResultPayload, String> {
    benchmarks::cpu::run(config).map_err(|e| e.to_string())
}

#[tauri::command]
async fn run_gpu_benchmark(config: GpuConfig) -> Result<BenchmarkResultPayload, String> {
    benchmarks::gpu::run(config).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn run_vram_benchmark(config: VramConfig) -> Result<BenchmarkResultPayload, String> {
    benchmarks::vram::run(config).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn run_npu_benchmark(config: NpuConfig) -> Result<BenchmarkResultPayload, String> {
    benchmarks::npu::run(config).map_err(|e| e.to_string())
}

#[tauri::command]
async fn run_ram_benchmark(config: RamConfig) -> Result<BenchmarkResultPayload, String> {
    benchmarks::ram::run(config).map_err(|e| e.to_string())
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
