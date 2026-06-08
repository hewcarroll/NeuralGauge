use std::time::Instant;
use super::{GpuConfig, BenchmarkResultPayload, BenchmarkMetric, calibrate};

const WARMUP: usize = 2;
const RUNS: usize = 5;

// Calibration anchors: (TFLOPS, score)
const GPU_ANCHORS: &[(f64, f64)] = &[
    (0.5,   1000.0),   // Intel UHD 730
    (5.0,   3000.0),   // RTX 3050
    (15.0,  5000.0),   // RTX 3070
    (35.0,  7500.0),   // RTX 4080
    (80.0, 10000.0),   // RTX 4090
];

const SHADER_SOURCE: &str = r#"
@group(0) @binding(0) var<storage, read> a : array<f32>;
@group(0) @binding(1) var<storage, read> b : array<f32>;
@group(0) @binding(2) var<storage, read_write> c : array<f32>;

struct Params {
    n: u32,
    iterations: u32,
}
@group(0) @binding(3) var<uniform> params : Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let idx = gid.x;
    let n = params.n;
    if idx >= n {
        return;
    }
    var acc = 0.0f;
    for (var it = 0u; it < params.iterations; it++) {
        acc = fma(a[idx], b[idx], acc);
    }
    c[idx] = acc;
}
"#;

pub async fn run(config: GpuConfig) -> Result<BenchmarkResultPayload, String> {
    let iterations = config.iterations.unwrap_or(4096);
    let workgroup_size: u32 = config.workgroup_size.unwrap_or(256);
    let n: u32 = 1024 * 1024; // 1M elements

    // Initialize wgpu
    let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..Default::default()
    });

    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            ..Default::default()
        })
        .await
        .ok_or("No GPU adapter found")?;

    let adapter_info = adapter.get_info();
    let gpu_name = adapter_info.name.clone();
    let backend = format!("{:?}", adapter_info.backend);

    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: Some("NeuralGauge GPU Benchmark"),
            ..Default::default()
        }, None)
        .await
        .map_err(|e| format!("Failed to create device: {e}"))?;

    // Create buffers
    let buf_size = (n as u64) * 4;
    let a_data: Vec<f32> = (0..n).map(|i| (i as f32 * 0.001) % 1.0).collect();
    let b_data: Vec<f32> = (0..n).map(|i| ((i + 7) as f32 * 0.0013) % 1.0).collect();

    let buf_a = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("A"),
        size: buf_size,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let buf_b = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("B"),
        size: buf_size,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let buf_c = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("C"),
        size: buf_size,
        usage: wgpu::BufferUsages::STORAGE,
        mapped_at_creation: false,
    });
    let params_data = [n, iterations];
    let buf_params = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Params"),
        size: 8,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    queue.write_buffer(&buf_a, 0, bytemuck_cast_slice(&a_data));
    queue.write_buffer(&buf_b, 0, bytemuck_cast_slice(&b_data));
    queue.write_buffer(&buf_params, 0, bytemuck_cast_slice(&params_data));

    // Create pipeline
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("GPU Bench Shader"),
        source: wgpu::ShaderSource::Wgsl(SHADER_SOURCE.into()),
    });

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[
            bgl_entry(0, true),  // a: read
            bgl_entry(1, true),  // b: read
            bgl_entry(2, false), // c: read_write
            wgpu::BindGroupLayoutEntry {
                binding: 3,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });

    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("GPU Benchmark Pipeline"),
        layout: Some(&pipeline_layout),
        module: &shader,
        entry_point: Some("main"),
        compilation_options: Default::default(),
        cache: None,
    });

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: buf_a.as_entire_binding() },
            wgpu::BindGroupEntry { binding: 1, resource: buf_b.as_entire_binding() },
            wgpu::BindGroupEntry { binding: 2, resource: buf_c.as_entire_binding() },
            wgpu::BindGroupEntry { binding: 3, resource: buf_params.as_entire_binding() },
        ],
    });

    let dispatch_count = (n + workgroup_size - 1) / workgroup_size;

    // Warmup + measured runs
    let mut durations: Vec<f64> = Vec::new();

    for run_idx in 0..(WARMUP + RUNS) {
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Bench Encoder"),
        });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Bench Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.dispatch_workgroups(dispatch_count, 1, 1);
        }

        let start = Instant::now();
        queue.submit(std::iter::once(encoder.finish()));
        device.poll(wgpu::Maintain::Wait);
        let elapsed = start.elapsed().as_secs_f64();

        if run_idx >= WARMUP {
            durations.push(elapsed);
        }
    }

    durations.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median_duration = durations[durations.len() / 2];

    // Each of the N elements does `iterations` FMA ops (2 flops each)
    let total_flops = (n as f64) * (iterations as f64) * 2.0;
    let tflops = total_flops / median_duration / 1e12;

    let mean = durations.iter().sum::<f64>() / durations.len() as f64;
    let variance = durations.iter().map(|d| (d - mean).powi(2)).sum::<f64>() / durations.len() as f64;
    let std_dev = variance.sqrt();
    let _margin = 1.96 * std_dev / (durations.len() as f64).sqrt();

    let tflops_values: Vec<f64> = durations.iter().map(|d| total_flops / d / 1e12).collect();
    let mean_tflops = tflops_values.iter().sum::<f64>() / tflops_values.len() as f64;
    let tflops_std = tflops_values.iter().map(|t| (t - mean_tflops).powi(2)).sum::<f64>().sqrt() / tflops_values.len() as f64;
    let tflops_margin = 1.96 * tflops_std / (tflops_values.len() as f64).sqrt();

    let score = calibrate(tflops, GPU_ANCHORS);

    Ok(BenchmarkResultPayload {
        component_type: "GPU".to_string(),
        score,
        metrics: vec![
            BenchmarkMetric {
                name: "Compute Speed".to_string(),
                value: round2(tflops),
                unit: "TFLOPS".to_string(),
                description: "FP32 FMA throughput via compute shader".to_string(),
            },
            BenchmarkMetric {
                name: "GPU".to_string(),
                value: 0.0,
                unit: gpu_name,
                description: format!("Backend: {backend}"),
            },
            BenchmarkMetric {
                name: "Elements".to_string(),
                value: n as f64,
                unit: "".to_string(),
                description: format!("{iterations} FMA iterations per element"),
            },
        ],
        run_count: RUNS,
        warmup_count: WARMUP,
        median_raw: round2(tflops),
        variance: round2(tflops_std),
        confidence_interval: [round2(mean_tflops - tflops_margin), round2(mean_tflops + tflops_margin)],
        error: None,
    })
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn bytemuck_cast_slice<T: Copy>(data: &[T]) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(
            data.as_ptr() as *const u8,
            data.len() * std::mem::size_of::<T>(),
        )
    }
}

fn bgl_entry(binding: u32, read_only: bool) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Storage { read_only },
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}
