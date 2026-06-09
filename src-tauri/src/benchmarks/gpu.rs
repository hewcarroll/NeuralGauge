use std::time::Instant;
use super::{GpuConfig, BenchmarkResultPayload, BenchmarkMetric, calibrate};

const WARMUP: usize = 2;
const MIN_RUNS: usize = 5;
const MAX_RUNS: usize = 100_000;
const TARGET_SECS: f64 = 2.0; // per kernel; the battery runs two kernels

// Calibration anchors: (FP32 TFLOPS, score)
const GPU_ANCHORS: &[(f64, f64)] = &[
    (0.5,   1000.0),   // basic iGPU
    (5.0,   3000.0),   // RTX 3050 class
    (15.0,  5000.0),   // RTX 3070 / Arc A770 class
    (35.0,  7500.0),   // RTX 4080 class
    (80.0, 10000.0),   // RTX 4090 class
];

// Each shader loads its two operands once and does `iterations` multiply-adds
// (2 ops each) in a tight ALU loop, so the test is compute-bound.
const SHADER_F32: &str = r#"
@group(0) @binding(0) var<storage, read> a : array<f32>;
@group(0) @binding(1) var<storage, read> b : array<f32>;
@group(0) @binding(2) var<storage, read_write> c : array<f32>;
struct Params { n: u32, iterations: u32 }
@group(0) @binding(3) var<uniform> params : Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let idx = gid.x;
    if idx >= params.n { return; }
    let av = a[idx];
    let bv = b[idx];
    var acc = 0.0;
    for (var it = 0u; it < params.iterations; it++) {
        acc = acc + av * bv;
    }
    c[idx] = acc;
}
"#;

const SHADER_I32: &str = r#"
@group(0) @binding(0) var<storage, read> a : array<i32>;
@group(0) @binding(1) var<storage, read> b : array<i32>;
@group(0) @binding(2) var<storage, read_write> c : array<i32>;
struct Params { n: u32, iterations: u32 }
@group(0) @binding(3) var<uniform> params : Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let idx = gid.x;
    if idx >= params.n { return; }
    let av = a[idx];
    let bv = b[idx];
    var acc : i32 = 0;
    for (var it = 0u; it < params.iterations; it++) {
        acc = acc + av * bv;
    }
    c[idx] = acc;
}
"#;

struct KernelStats {
    median: f64,
    std_dev: f64,
    ci: [f64; 2],
    runs: usize,
}

pub async fn run(config: GpuConfig) -> Result<BenchmarkResultPayload, String> {
    let iterations = config.iterations.unwrap_or(4096);
    let workgroup_size: u32 = config.workgroup_size.unwrap_or(256);
    let n: u32 = 1024 * 1024; // 1M elements (proven stable)

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

    let (device, queue) = adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                label: Some("NeuralGauge GPU Benchmark"),
                ..Default::default()
            },
            None,
        )
        .await
        .map_err(|e| format!("Failed to create device: {e}"))?;

    let a_f32: Vec<f32> = (0..n).map(|i| (i as f32 * 0.001) % 1.0 + 0.5).collect();
    let b_f32: Vec<f32> = (0..n).map(|i| ((i + 7) as f32 * 0.0013) % 1.0 + 0.5).collect();
    let a_i32: Vec<i32> = (0..n).map(|i| (i as i32 % 7) + 1).collect();
    let b_i32: Vec<i32> = (0..n).map(|i| (i as i32 % 13) + 1).collect();

    let fp32 = run_kernel(&device, &queue, SHADER_F32, n, iterations, workgroup_size, cast(&a_f32), cast(&b_f32), 4);
    let int32 = run_kernel(&device, &queue, SHADER_I32, n, iterations, workgroup_size, cast(&a_i32), cast(&b_i32), 4);

    let score = calibrate(fp32.median, GPU_ANCHORS);

    let metrics = vec![
        metric("FP32 Compute", round2(fp32.median), "TFLOPS", "FP32 multiply-add throughput via compute shader"),
        metric("INT32 Compute", round2(int32.median), "TOPS", "INT32 multiply-add throughput"),
    ];

    Ok(BenchmarkResultPayload {
        component_type: "GPU".to_string(),
        score,
        metrics,
        run_count: fp32.runs,
        warmup_count: WARMUP,
        median_raw: round2(fp32.median),
        variance: round2(fp32.std_dev),
        confidence_interval: [round2(fp32.ci[0]), round2(fp32.ci[1])],
        error: None,
    })
}

#[allow(clippy::too_many_arguments)]
fn run_kernel(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    shader_src: &str,
    n: u32,
    iterations: u32,
    workgroup_size: u32,
    a_bytes: &[u8],
    b_bytes: &[u8],
    elem_bytes: u64,
) -> KernelStats {
    let buf_size = (n as u64) * elem_bytes;

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

    queue.write_buffer(&buf_a, 0, a_bytes);
    queue.write_buffer(&buf_b, 0, b_bytes);
    queue.write_buffer(&buf_params, 0, bytemuck_cast_slice(&params_data));

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("GPU Bench Shader"),
        source: wgpu::ShaderSource::Wgsl(shader_src.into()),
    });

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[
            bgl_entry(0, true),
            bgl_entry(1, true),
            bgl_entry(2, false),
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

    let mut durations: Vec<f64> = Vec::new();
    let bench_start = Instant::now();
    let mut run_idx = 0usize;

    loop {
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
        run_idx += 1;

        let done = durations.len() >= MIN_RUNS && bench_start.elapsed().as_secs_f64() >= TARGET_SECS;
        if done || durations.len() >= MAX_RUNS {
            break;
        }
    }

    // ops/sec in tera-ops (2 ops per multiply-add iteration, per element)
    let total_ops = (n as f64) * (iterations as f64) * 2.0;
    let mut tput: Vec<f64> = durations.iter().map(|d| total_ops / d / 1e12).collect();
    tput.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let nf = tput.len() as f64;
    let median = tput[tput.len() / 2];
    let mean = tput.iter().sum::<f64>() / nf;
    let std_dev = (tput.iter().map(|t| (t - mean).powi(2)).sum::<f64>() / nf).sqrt();
    let margin = 1.96 * std_dev / nf.sqrt();

    KernelStats {
        median,
        std_dev,
        ci: [mean - margin, mean + margin],
        runs: tput.len(),
    }
}

fn metric(name: &str, value: f64, unit: &str, description: &str) -> BenchmarkMetric {
    BenchmarkMetric {
        name: name.to_string(),
        value,
        unit: unit.to_string(),
        description: description.to_string(),
    }
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn cast<T: Copy>(data: &[T]) -> &[u8] {
    bytemuck_cast_slice(data)
}

fn bytemuck_cast_slice<T: Copy>(data: &[T]) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data))
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
