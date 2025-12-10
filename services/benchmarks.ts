import { ComponentType, BenchmarkResult, BenchmarkConfig } from '../types';
import { SHADERS } from '../constants';

// WebGPU Type Definitions to satisfy TypeScript compiler
declare global {
  interface Navigator {
    gpu: any;
  }
  interface Performance {
    memory?: {
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
      usedJSHeapSize: number;
    };
  }
}
declare const GPUShaderStage: any;
declare const GPUBufferUsage: any;

// Helper to check WebGL errors with more granularity
const checkWebGLError = (gl: WebGL2RenderingContext, context: string) => {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    const errorMap: Record<number, string> = {
      [gl.INVALID_ENUM]: 'INVALID_ENUM',
      [gl.INVALID_VALUE]: 'INVALID_VALUE',
      [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
      [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
      [gl.CONTEXT_LOST_WEBGL]: 'CONTEXT_LOST_WEBGL',
      [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION'
    };
    
    // Attempt to get renderer info for context
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown Renderer';
    
    throw new Error(`WebGL Error in ${context}: ${errorMap[error] || error} (0x${error.toString(16)}). Hardware: ${renderer}`);
  }
};

// Helper to wrap execution with error handling and categorization
const safeRun = async <T>(
  type: ComponentType, 
  fn: () => Promise<BenchmarkResult>
): Promise<BenchmarkResult> => {
  try {
    return await fn();
  } catch (error: any) {
    console.error(`Benchmark failed for ${type}:`, error);
    
    let errorType = 'UnknownError';
    const msg = error.message?.toLowerCase() || '';
    
    if (msg.includes('shader') || msg.includes('program') || msg.includes('compile')) errorType = 'ShaderCompilationError';
    else if (msg.includes('context') || msg.includes('webgl') || msg.includes('extension')) errorType = 'WebGLContextError';
    else if (msg.includes('buffer') || msg.includes('allocation') || msg.includes('memory') || msg.includes('enough')) errorType = 'OutOfMemoryError';
    else if (msg.includes('gpu') || msg.includes('adapter') || msg.includes('device')) errorType = 'WebGPUError';
    else if (msg.includes('timeout') || msg.includes('lost')) errorType = 'DeviceLostError';

    return {
      type,
      score: 0,
      timestamp: Date.now(),
      durationMs: 0,
      metrics: [],
      error: `${errorType}: ${error.message}`
    };
  }
};

// --- RAM Benchmark ---
const runRamBenchmark = async (config: BenchmarkConfig): Promise<BenchmarkResult> => {
  return safeRun(ComponentType.RAM, async () => {
    const startTime = performance.now();
    const iterations = 50;
    const chunkSizeBytes = 1024 * 1024 * config.ramChunkSizeMb; 
    
    // Inline worker code
    const workerCode = `
      self.onmessage = function(e) {
        const { size, iterations } = e.data;
        try {
          // Track Memory (Chrome only, non-standard API)
          const getMem = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
          const startMem = getMem();
          
          const bufferA = new Uint8Array(size);
          const bufferB = new Uint8Array(size);
          
          const midMem = getMem();
          
          // Fallback if API not available: Estimate based on TypedArray size (size * 2 for A and B)
          const estimatedPeakMb = (size * 2) / (1024 * 1024);
          const measuredPeakMb = (midMem - startMem) > 0 ? (midMem / (1024 * 1024)) : estimatedPeakMb;
          
          // Fill
          for(let i=0; i<size; i++) bufferA[i] = i % 255;

          const copyStart = performance.now();
          for (let i = 0; i < iterations; i++) {
            bufferB.set(bufferA);
          }
          const copyEnd = performance.now();
          
          if (bufferB[size - 1] !== (size - 1) % 255) throw new Error("Memory integrity verification failed");
          
          // Average is approximated as the sustained usage during the test (Peak)
          const averageMemMb = measuredPeakMb; 

          self.postMessage({
            success: true,
            durationSeconds: (copyEnd - copyStart) / 1000,
            totalBytes: size * iterations,
            peakAllocMb: measuredPeakMb,
            avgAllocMb: averageMemMb
          });
        } catch (err) {
          self.postMessage({ success: false, error: err.toString() });
        }
      };
    `;

    return new Promise((resolve, reject) => {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        URL.revokeObjectURL(workerUrl);
        worker.terminate();

        const { success, durationSeconds, totalBytes, peakAllocMb, avgAllocMb, error } = e.data;

        if (!success) {
          reject(new Error(error || "Worker reported failure"));
          return;
        }

        const gbProcessed = totalBytes / (1024 * 1024 * 1024);
        const bandwidth = gbProcessed / durationSeconds; // GB/s
        const score = Math.min(10000, Math.floor(bandwidth * 200)); 

        resolve({
          type: ComponentType.RAM,
          score,
          timestamp: Date.now(),
          durationMs: performance.now() - startTime,
          metrics: [
            { name: 'Bandwidth', value: parseFloat(bandwidth.toFixed(2)), unit: 'GB/s', description: 'Estimated sequential memory copy speed' },
            { name: 'Peak Usage', value: parseFloat(peakAllocMb.toFixed(1)), unit: 'MB', description: 'Max JS Heap used during test' },
            { name: 'Avg Usage', value: parseFloat(avgAllocMb.toFixed(1)), unit: 'MB', description: 'Sustained memory footprint' }
          ]
        });
      };

      worker.onerror = (e) => {
        URL.revokeObjectURL(workerUrl);
        worker.terminate();
        reject(new Error(`Worker Error: ${e.message}`));
      };

      worker.postMessage({ size: chunkSizeBytes, iterations });
    });
  });
};

// --- CPU Benchmark ---
const runCpuBenchmark = async (config: BenchmarkConfig): Promise<BenchmarkResult> => {
  return safeRun(ComponentType.CPU, async () => {
    const startTime = performance.now();
    const matrixSize = config.cpuMatrixSize;
    
    // Part 1: Matrix Multiplication (Throughput)
    const mathStart = performance.now();
    const A = new Float32Array(matrixSize * matrixSize);
    const B = new Float32Array(matrixSize * matrixSize);
    const C = new Float32Array(matrixSize * matrixSize);

    for(let i=0; i<A.length; i++) {
      A[i] = Math.random();
      B[i] = Math.random();
    }

    const N = matrixSize;
    // We break the loop to measure "thread blockage" (Load proxy)
    const threadCheckStart = performance.now();
    let threadCheckEnd = 0;
    
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        let sum = 0;
        for (let k = 0; k < N; k++) {
          sum += A[i * N + k] * B[k * N + j];
        }
        C[i * N + j] = sum;
      }
    }
    threadCheckEnd = performance.now();
    const matDuration = (threadCheckEnd - mathStart) / 1000;
    
    // Calculate "Stability" / Load Proxy
    // If the system is under heavy load, performance.now() deltas variance increases.
    // Ideally we would use CPU usage API but it doesn't exist.
    // We simulate "Thread Congestion" by measuring the execution time consistency of small chunks.
    const chunks = 10;
    const chunkTimes = [];
    for(let c=0; c<chunks; c++) {
        const t0 = performance.now();
        // Small busy wait
        let v = 0;
        for(let z=0; z<100000; z++) v+=z;
        chunkTimes.push(performance.now() - t0);
    }
    // Calculate Variance
    const mean = chunkTimes.reduce((a,b) => a+b) / chunks;
    const variance = chunkTimes.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / chunks;
    const stabilityScore = 100 - (Math.min(variance * 100, 100));

    const ops = 2 * Math.pow(N, 3); 
    const flops = ops / matDuration;
    const gflops = flops / 1e9;

    // Part 2: ALU Latency
    const latencyIterations = config.cpuLatencyIterations;
    const latStart = performance.now();
    let val = 0;
    for(let i=0; i<latencyIterations; i++) {
      val = (val + i) ^ (i & 0xFFFFFF); 
    }
    const latEnd = performance.now();
    if (val === -1) console.log(val); 
    
    const latDurationMs = latEnd - latStart;
    const nsPerOp = (latDurationMs * 1_000_000) / latencyIterations; // ms -> ns

    // Part 3: Memory Bandwidth & Latency
    const largeSize = 1024 * 1024 * 16; // 16M ints = 64MB
    const memoryBuffer = new Int32Array(largeSize);
    for(let i=0; i<largeSize; i++) memoryBuffer[i] = i;

    // 3a. Sequential Read Bandwidth
    const seqStart = performance.now();
    let seqSum = 0;
    for(let i=0; i<largeSize; i++) {
      seqSum += memoryBuffer[i];
    }
    const seqEnd = performance.now();
    const seqDuration = seqEnd - seqStart;
    const seqBandwidth = ((largeSize * 4) / 1024 / 1024) / (seqDuration / 1000); // MB/s

    // 3b. Random Read Bandwidth & Latency (Pointer Chasing simulation via stride)
    for(let i=0; i<largeSize; i++) {
        memoryBuffer[i] = (i + 12345) % largeSize;
    }
    
    const latMemIterations = 1000000;
    let idx = 0;
    const memLatStart = performance.now();
    for(let i=0; i<latMemIterations; i++) {
        idx = memoryBuffer[idx];
    }
    const memLatEnd = performance.now();
    const memReadLatencyNs = ((memLatEnd - memLatStart) * 1_000_000) / latMemIterations;

    const writeStart = performance.now();
    for(let i=0; i<largeSize; i++) {
        memoryBuffer[i] = i;
    }
    const writeEnd = performance.now();
    const writeDuration = writeEnd - writeStart;
    const memWriteLatencyNs = (writeDuration * 1_000_000) / largeSize;

    const score = Math.floor(gflops * 1000);

    return {
      type: ComponentType.CPU,
      score,
      timestamp: Date.now(),
      durationMs: performance.now() - startTime,
      metrics: [
        { name: 'FP32 Speed', value: parseFloat(gflops.toFixed(2)), unit: 'GFLOPS', description: 'Single-core floating point operations' },
        { name: 'Stability', value: parseFloat(stabilityScore.toFixed(1)), unit: '%', description: 'Thread execution consistency (Load proxy)' },
        { name: 'Seq. Read', value: parseFloat(seqBandwidth.toFixed(2)), unit: 'MB/s', description: 'Linear memory access' },
        { name: 'Read Latency', value: parseFloat(memReadLatencyNs.toFixed(2)), unit: 'ns', description: 'Random pointer chase latency' },
        { name: 'Write Latency', value: parseFloat(memWriteLatencyNs.toFixed(2)), unit: 'ns', description: 'Sequential store latency' },
        { name: 'Matrix Size', value: matrixSize, unit: 'N', description: 'NxN Matrix Multiplication' }
      ]
    };
  });
};

// --- GPU Compute Benchmark ---
const runGpuBenchmark = async (config: BenchmarkConfig): Promise<BenchmarkResult> => {
  return safeRun(ComponentType.GPU, async () => {
    const startTime = performance.now();
    const canvas = document.createElement('canvas');
    const res = config.gpuResolution;
    canvas.width = res;
    canvas.height = res;
    const gl = canvas.getContext('webgl2');

    if (!gl) throw new Error("WebGL2 is not supported on this browser/device.");

    const vsSource = SHADERS.GPU_COMPUTE.vertex;
    const fsSource = SHADERS.GPU_COMPUTE.fragment(config.gpuIterations);

    const createShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if(!shader) throw new Error("Failed to create shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        // Add renderer info to shader error
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
        throw new Error(`Shader compile failed on ${renderer}: ${log}`);
      }
      return shader;
    };

    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create WebGL program");

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positions = new Float32Array([ -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1 ]);
    const positionAttributeLocation = gl.getAttribLocation(program, "position");
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    const resUniform = gl.getUniformLocation(program, "resolution");
    gl.uniform2f(resUniform, canvas.width, canvas.height);

    const glStart = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const pixels = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const glEnd = performance.now();
    const duration = (glEnd - glStart) / 1000;
    checkWebGLError(gl, "GPU Compute Draw");

    const totalOps = res * res * config.gpuIterations * 4;
    const tflops = (totalOps / duration) / 1e12;
    const score = Math.floor(tflops * 100000); 

    // Note: GPU Temperature is not accessible via WebGL/WebGPU APIs for security/fingerprinting reasons.
    
    return {
      type: ComponentType.GPU,
      score,
      timestamp: Date.now(),
      durationMs: performance.now() - startTime,
      metrics: [
        { name: 'Compute Speed', value: parseFloat(tflops.toFixed(4)), unit: 'TFLOPS', description: 'Simulated Shader TFLOPS (WebGL)' },
        { name: 'Resolution', value: res, unit: 'px', description: 'Render Target Size' },
        { name: 'Iterations', value: config.gpuIterations, unit: 'ops', description: 'Ops per pixel' }
      ]
    };
  });
};

// --- GPU Memory Benchmark (VRAM) ---
const runGpuMemoryBenchmark = async (config: BenchmarkConfig): Promise<BenchmarkResult> => {
  return safeRun(ComponentType.GPU_MEMORY, async () => {
    const startTime = performance.now();
    const canvas = document.createElement('canvas');
    const size = config.vramTextureSize;
    canvas.width = size;
    canvas.height = size;
    const gl = canvas.getContext('webgl2');

    if (!gl) throw new Error("WebGL2 not supported.");

    const vsSource = SHADERS.GPU_MEMORY.vertex;
    const fsSource = SHADERS.GPU_MEMORY.fragment;

    const createShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Shader creation failed");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader compile failed");
      return shader;
    };

    const program = gl.createProgram();
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    
    if (!program || !vs || !fs) throw new Error("Program creation failed");

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const vertices = new Float32Array([
      -1, -1, 0, 0,  1, -1, 1, 0, -1, 1, 0, 1,
      -1, 1, 0, 1,   1, -1, 1, 0,  1, 1, 1, 1,
    ]);
    
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "position");
    const texLoc = gl.getAttribLocation(program, "texCoord");
    
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0); 
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8); 

    // Helper to init texture
    const initTex = () => {
       const t = gl.createTexture();
       gl.bindTexture(gl.TEXTURE_2D, t);
       gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
       return t;
    };

    const texA = initTex();
    const texB = initTex();

    // Use a secondary FBO for texture-to-texture copies
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);
    
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
       throw new Error("Framebuffer incomplete");
    }

    gl.viewport(0, 0, size, size);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    
    // Warmup
    gl.drawArrays(gl.TRIANGLES, 0, 6); 
    checkWebGLError(gl, "VRAM Warmup");
    
    // --- Internal Bandwidth (Texture -> Texture) ---
    const internalIterations = 20;
    const ibwStart = performance.now();
    for(let i=0; i<internalIterations; i++) gl.drawArrays(gl.TRIANGLES, 0, 6);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); // Force sync
    const ibwEnd = performance.now();
    const internalGbps = ((size * size * 4 * 2 * internalIterations) / 1e9) / ((ibwEnd - ibwStart) / 1000);

    // --- Write Bandwidth (CPU -> GPU Upload) ---
    // Using PBO is generally the fastest way to stream data to GPU in WebGL2
    const rwIterations = 5;
    const uploadData = new Uint8Array(size * size * 4);
    
    // Create PBO
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_UNPACK_BUFFER, uploadData.byteLength, gl.STREAM_DRAW);
    
    const wbwStart = performance.now();
    for(let i=0; i<rwIterations; i++) {
        gl.bufferSubData(gl.PIXEL_UNPACK_BUFFER, 0, uploadData); 
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    }
    // We only sync once at the end of the batch
    gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); // Force sync to ensure uploads done
    const wbwEnd = performance.now();
    
    const writeGbps = ((size * size * 4 * rwIterations) / 1e9) / ((wbwEnd - wbwStart) / 1000);
    
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.deleteBuffer(pbo);

    // --- Read Bandwidth (GPU -> CPU Download) ---
    const downloadData = new Uint8Array(size * size * 4);
    
    // Create PBO for readback
    const readPbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, readPbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, downloadData.byteLength, gl.STREAM_READ);

    const rbwStart = performance.now();
    for(let i=0; i<rwIterations; i++) {
        // Asynchronous readback to PBO
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        // We simulate accessing the data by mapping/unmapping or just waiting
        // In WebGL2 we can use getBufferSubData but it's synchronous.
        // For a benchmark we essentially want to measure the transfer time.
        // A naive readPixels to a typed array is actually a good measure of "Blocking Read Bandwidth"
    }
    // Sync point
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, downloadData);
    
    const rbwEnd = performance.now();
    const readGbps = ((size * size * 4 * rwIterations) / 1e9) / ((rbwEnd - rbwStart) / 1000);

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteBuffer(readPbo);


    // Latency (Write vs Read Breakdown)
    const latIterations = config.gpuLatencyIterations || 20;
    gl.viewport(0, 0, 1, 1);
    
    let totalWriteTime = 0;
    let totalReadTime = 0;
    const singlePixel = new Uint8Array(4);

    for(let i=0; i<latIterations; i++) {
      // Write Latency (CPU -> GPU Upload)
      const t0 = performance.now();
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, singlePixel);
      gl.drawArrays(gl.TRIANGLES, 0, 6); 
      const t1 = performance.now();
      
      // Read Latency (GPU -> CPU Download)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const t2 = performance.now();
      
      totalWriteTime += (t1 - t0);
      totalReadTime += (t2 - t1);
    }

    const avgWriteLatency = totalWriteTime / latIterations;
    const avgReadLatency = totalReadTime / latIterations;
    const avgTotalLatency = avgWriteLatency + avgReadLatency;

    checkWebGLError(gl, "GPU Memory Benchmark Complete");

    const score = Math.min(10000, Math.floor(internalGbps * 50)); 

    return {
      type: ComponentType.GPU_MEMORY,
      score,
      timestamp: Date.now(),
      durationMs: performance.now() - startTime,
      metrics: [
        { name: 'Internal Bandwidth', value: parseFloat(internalGbps.toFixed(2)), unit: 'GB/s', description: 'VRAM to VRAM Copy' },
        { name: 'Write Bandwidth', value: parseFloat(writeGbps.toFixed(2)), unit: 'GB/s', description: 'System RAM to VRAM (PBO)' },
        { name: 'Read Bandwidth', value: parseFloat(readGbps.toFixed(2)), unit: 'GB/s', description: 'VRAM to System RAM' },
        { name: 'Total Latency', value: parseFloat(avgTotalLatency.toFixed(2)), unit: 'ms', description: 'Roundtrip Bus Latency' },
        { name: 'Write Latency', value: parseFloat(avgWriteLatency.toFixed(2)), unit: 'ms', description: 'Upload + Draw Dispatch' },
        { name: 'Read Latency', value: parseFloat(avgReadLatency.toFixed(2)), unit: 'ms', description: 'Readback Sync' },
        { name: 'Texture Size', value: size, unit: 'px', description: 'VRAM Alloc Size' }
      ]
    };
  });
};

// --- NPU / Tensor Benchmark ---
const runNpuBenchmark = async (config: BenchmarkConfig): Promise<BenchmarkResult> => {
  return safeRun(ComponentType.NPU, async () => {
    const startTime = performance.now();
    const matrixSize = config.npuMatrixSize;

    // WebGPU Attempt
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No WebGPU adapter found.");
        
        const device = await adapter.requestDevice();
        if (!device) throw new Error("Failed to request WebGPU device.");
        
        device.lost.then((info: any) => {
          console.warn(`WebGPU device lost: ${info.message}`);
        });

        // Use error scope to catch validation errors
        device.pushErrorScope('validation');

        const shaderModule = device.createShaderModule({
          code: `
            struct Matrix { size : vec2<f32>, numbers : array<f32> }
            @group(0) @binding(0) var<storage, read> firstMatrix : array<f32>;
            @group(0) @binding(1) var<storage, read> secondMatrix : array<f32>;
            @group(0) @binding(2) var<storage, read_write> resultMatrix : array<f32>;
            @compute @workgroup_size(8, 8)
            fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
              let size = ${matrixSize}u;
              if (global_id.x >= size || global_id.y >= size) { return; }
              let index = global_id.y * size + global_id.x;
              var sum = 0.0;
              for (var i = 0u; i < size; i = i + 1u) {
                sum = sum + firstMatrix[global_id.y * size + i] * secondMatrix[i * size + global_id.x];
              }
              resultMatrix[index] = sum;
            }
          `
        });
        const bindGroupLayout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
          ]
        });
        const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
        const computePipeline = device.createComputePipeline({
          layout: pipelineLayout,
          compute: { module: shaderModule, entryPoint: "main" },
        });
        const bufferSize = matrixSize * matrixSize * 4;
        const gpuBufferFirst = device.createBuffer({ size: bufferSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        const gpuBufferSecond = device.createBuffer({ size: bufferSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        const gpuBufferResult = device.createBuffer({ size: bufferSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        const data = new Float32Array(matrixSize * matrixSize);
        // Fill with random data
        for(let i=0; i<data.length; i++) data[i] = Math.random();
        
        device.queue.writeBuffer(gpuBufferFirst, 0, data);
        device.queue.writeBuffer(gpuBufferSecond, 0, data);
        
        const bindGroup = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: gpuBufferFirst } },
            { binding: 1, resource: { buffer: gpuBufferSecond } },
            { binding: 2, resource: { buffer: gpuBufferResult } },
          ]
        });
        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(computePipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(matrixSize / 8), Math.ceil(matrixSize / 8));
        passEncoder.end();
        
        const gpuStart = performance.now();
        device.queue.submit([commandEncoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        const gpuEnd = performance.now();

        // Check for WebGPU specific validation errors
        const error = await device.popErrorScope();
        if (error) {
           throw new Error(`WebGPU Validation Error: ${error.message}`);
        }
        
        const duration = (gpuEnd - gpuStart) / 1000;
        const ops = 2 * Math.pow(matrixSize, 3);
        const tflops = (ops / duration) / 1e12;
        
        return {
          type: ComponentType.NPU,
          score: Math.min(15000, Math.floor(tflops * 1000)),
          timestamp: Date.now(),
          durationMs: performance.now() - startTime,
          metrics: [
            { name: 'Tensor Performance', value: parseFloat(tflops.toFixed(2)), unit: 'TFLOPS', description: 'WebGPU Compute' },
            { name: 'Matrix Size', value: matrixSize, unit: 'N', description: 'NxN Matrix' },
            { name: 'Backend', value: 1, unit: 'WebGPU', description: 'Next-Gen API' }
          ]
        };
      } catch (e) {
        console.warn("WebGPU init failed, falling back to WebGL.", e);
      }
    }

    // Fallback: WebGL2 Simulation with Float FBO
    const canvas = document.createElement('canvas');
    canvas.width = matrixSize;
    canvas.height = matrixSize;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error("WebGL2 not supported");
    const ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) throw new Error("Floating point textures (EXT_color_buffer_float) not supported");
    
    // Shader to perform heavy dot product to mimic matrix row multiplication
    // Optimized for tensor operation simulation:
    // 1. Uses texelFetch for precise texel access from NxN textures
    // 2. Uses gl_FragCoord to simulate true 2D matrix multiplication (every pixel computes a unique dot product)
    // 3. Unrolled loop to minimize branching overhead and maximize ALU saturation
    const vsSource = `#version 300 es
       in vec4 position;
       void main() { gl_Position = position; }
     `;
     
     // Highly optimized dot product shader loop
     const fsSource = `#version 300 es
       precision highp float;
       uniform sampler2D u_texA;
       uniform sampler2D u_texB;
       out vec4 outColor;
       void main() {
         ivec2 pos = ivec2(gl_FragCoord.xy);
         float sum = 0.0;
         int size = ${matrixSize};
         
         // Unroll factor 16 for maximum instruction density per loop
         for(int k=0; k<size; k+=16) {
           sum += texelFetch(u_texA, ivec2(k, pos.y), 0).r * texelFetch(u_texB, ivec2(k, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+1, pos.y), 0).r * texelFetch(u_texB, ivec2(k+1, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+2, pos.y), 0).r * texelFetch(u_texB, ivec2(k+2, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+3, pos.y), 0).r * texelFetch(u_texB, ivec2(k+3, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+4, pos.y), 0).r * texelFetch(u_texB, ivec2(k+4, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+5, pos.y), 0).r * texelFetch(u_texB, ivec2(k+5, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+6, pos.y), 0).r * texelFetch(u_texB, ivec2(k+6, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+7, pos.y), 0).r * texelFetch(u_texB, ivec2(k+7, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+8, pos.y), 0).r * texelFetch(u_texB, ivec2(k+8, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+9, pos.y), 0).r * texelFetch(u_texB, ivec2(k+9, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+10, pos.y), 0).r * texelFetch(u_texB, ivec2(k+10, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+11, pos.y), 0).r * texelFetch(u_texB, ivec2(k+11, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+12, pos.y), 0).r * texelFetch(u_texB, ivec2(k+12, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+13, pos.y), 0).r * texelFetch(u_texB, ivec2(k+13, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+14, pos.y), 0).r * texelFetch(u_texB, ivec2(k+14, pos.x), 0).r;
           sum += texelFetch(u_texA, ivec2(k+15, pos.y), 0).r * texelFetch(u_texB, ivec2(k+15, pos.x), 0).r;
         }
         
         outColor = vec4(sum, 0.0, 0.0, 1.0);
       }
     `;
     
     const createShader = (gl: WebGL2RenderingContext, type: number, src: string) => {
        const s = gl.createShader(type);
        if(!s) return null;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
        return s;
     };

     const program = gl.createProgram();
     const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
     const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
     if (!program || !vs || !fs) throw new Error("Fallback Shader Compile Error");
     
     gl.attachShader(program, vs);
     gl.attachShader(program, fs);
     gl.linkProgram(program);
     gl.useProgram(program);

     const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
     const buf = gl.createBuffer();
     gl.bindBuffer(gl.ARRAY_BUFFER, buf);
     gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
     const posLoc = gl.getAttribLocation(program, "position");
     gl.enableVertexAttribArray(posLoc);
     gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

     const createTexture = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        const data = new Float32Array(matrixSize * matrixSize);
        // Fill with some data to avoid sparse optimizations
        for(let i=0; i<data.length; i++) data[i] = Math.random();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, matrixSize, matrixSize, 0, gl.RED, gl.FLOAT, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        return tex;
     };

     const texA = createTexture();
     const texB = createTexture();

     gl.activeTexture(gl.TEXTURE0);
     gl.bindTexture(gl.TEXTURE_2D, texA);
     gl.uniform1i(gl.getUniformLocation(program, "u_texA"), 0);

     gl.activeTexture(gl.TEXTURE1);
     gl.bindTexture(gl.TEXTURE_2D, texB);
     gl.uniform1i(gl.getUniformLocation(program, "u_texB"), 1);

     const fbo = gl.createFramebuffer();
     gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
     const outTex = gl.createTexture();
     gl.bindTexture(gl.TEXTURE_2D, outTex);
     gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, matrixSize, matrixSize, 0, gl.RED, gl.FLOAT, null);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
     gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);

     if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Float Framebuffer incomplete");

     gl.viewport(0, 0, matrixSize, matrixSize);

     const glStart = performance.now();
     gl.drawArrays(gl.TRIANGLES, 0, 6);
     
     // Read one pixel to force sync
     const pixel = new Float32Array(4);
     gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
     
     const glEnd = performance.now();

     checkWebGLError(gl, "NPU WebGL Fallback");

     const duration = (glEnd - glStart) / 1000;
     
     // 2 * N^3 operations
     const totalOps = (matrixSize * matrixSize) * matrixSize * 2;
     const tflops = (totalOps / duration) / 1e12;

     return {
        type: ComponentType.NPU,
        score: Math.floor(tflops * 10000), 
        timestamp: Date.now(),
        durationMs: performance.now() - startTime,
        metrics: [
          { name: 'Simulated Performance', value: parseFloat(tflops.toFixed(2)), unit: 'TFLOPS', description: 'WebGL Float FBO Fallback' },
          { name: 'Matrix Size', value: matrixSize, unit: 'N', description: 'NxN Matrix' },
          { name: 'Backend', value: 0, unit: 'WebGL', description: 'Legacy GPGPU Mode' }
        ]
     };
  });
};

export const runBenchmark = async (type: ComponentType, config: BenchmarkConfig): Promise<BenchmarkResult[]> => {
  const results: BenchmarkResult[] = [];
  
  if (type === ComponentType.CPU || type === ComponentType.FULL_SUITE) {
    results.push(await runCpuBenchmark(config));
  }
  if (type === ComponentType.GPU || type === ComponentType.FULL_SUITE) {
    results.push(await runGpuBenchmark(config));
  }
  if (type === ComponentType.GPU_MEMORY || type === ComponentType.FULL_SUITE) {
    results.push(await runGpuMemoryBenchmark(config));
  }
  if (type === ComponentType.NPU || type === ComponentType.FULL_SUITE) {
    results.push(await runNpuBenchmark(config));
  }
  if (type === ComponentType.RAM || type === ComponentType.FULL_SUITE) {
    results.push(await runRamBenchmark(config));
  }
  
  return results;
};
