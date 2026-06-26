<!-- TODO: capture docs/screenshot.png from the running app and embed it here -->

# NeuralGauge

**A native desktop hardware benchmark for AI workloads** — CPU, GPU, RAM, VRAM, and NPU, with an optional AI-written read on your results. Free and open source.

NeuralGauge measures the throughput and latency that matter for running models locally — FP32/FP16/INT32 compute, memory bandwidth, and access latency — and presents them as raw, comparable numbers plus an optional 0–10000 score. It runs natively (Tauri + Rust), not in a browser sandbox.

A [Saelix](https://www.saelix.org) project · home: <https://www.saelix.org/neuralgauge>

## Features

- **Five benchmarks**
  - **CPU** — FP32/FP64/INT32 single- and multi-core GEMM throughput, multi-thread scaling, and L1/L2/L3/main-memory random-access latency.
  - **GPU** — FP32/FP16/INT32 compute throughput via `wgpu` compute shaders (the FP16 path is hardened against driver hangs).
  - **RAM** — STREAM Copy/Scale/Add/Triad memory bandwidth.
  - **VRAM** — internal, host→device, and device→host GPU memory bandwidth.
  - **NPU** — honest detection (reports "no NPU detected" rather than faking it with GPU compute).
- **System detection** — CPU, RAM, and GPU adapter, ranked so a real GPU is preferred over a software fallback.
- **Session history & comparison** — save runs, name them, compare side by side.
- **Optional AI analysis** — a plain-language read on your results, using your own API key (see below).
- **Cross-platform** — Windows, macOS, Linux.

## AI analysis (optional, bring-your-own-key)

The AI write-up is entirely optional and uses **your own API key**, entered in the app's settings. Supported providers:

- Google Gemini
- OpenAI (and OpenAI-compatible endpoints)
- Anthropic
- A local model via an OpenAI-compatible server (e.g. Ollama at `http://localhost:11434/v1`)

Your results are sent only to the provider you choose. NeuralGauge has no backend and collects nothing; skip the AI step entirely and the benchmarks run fully offline.

## Install

Pre-built installers will be published on the [Releases](https://github.com/hewcarroll/NeuralGauge/releases) page once the first release is cut (see [ROADMAP.md](ROADMAP.md)). Until then, build from source.

## Build from source

**Prerequisites:** [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 18+, and the [Tauri v2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

The benchmark engine, [`rust-hwbench`](https://github.com/hewcarroll/rust-hwbench), is consumed via a local path dependency, so clone both repos **side by side**:

```bash
git clone https://github.com/hewcarroll/NeuralGauge.git
git clone https://github.com/hewcarroll/rust-hwbench.git   # sibling of NeuralGauge
cd NeuralGauge
npm install
npm run tauri:dev      # run in development
npm run tauri:build    # produce a native installer under src-tauri/target/release/bundle/
```

## Architecture

The benchmark **engine** lives in a separate crate, [`rust-hwbench`](https://github.com/hewcarroll/rust-hwbench) — raw measurements with opt-in scoring, usable as a library or CLI on its own. NeuralGauge is the desktop **UI + scoring shell** on top of it. Keeping the engine standalone means the measurement code is tested and reusable independently of the app.

## License

[Apache-2.0](LICENSE).
