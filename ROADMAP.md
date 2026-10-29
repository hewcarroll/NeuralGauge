# NeuralGauge Roadmap

NeuralGauge is a **free, open-source** desktop hardware benchmark. There is no
paid tier and no monetization — the goal is a polished, downloadable v1.

**Definition of done (v1):** documented installers for Linux / Windows / macOS on
GitHub Releases, a real README, optional bring-your-own-key AI analysis, validated
on all three platforms.

---

## Phase 0 — Cleanup & honesty ✅ (in progress)
- [x] Delete the dead `src/services/geminiService.ts` (unused AI Studio scaffold;
      referenced an undefined `process.env.API_KEY`). The real path is the
      multi-provider, BYO-key `analysisService.ts`.
- [x] Replace the Google AI Studio boilerplate README with a real product README.
- [x] Add an Apache-2.0 `LICENSE`.
- [ ] Add a `docs/screenshot.png` from the running app and embed it in the README.

## Phase 1 — Correctness in the built app (~1–2 days)
- [ ] `npm run tauri:build` on Linux and exercise the real binary (not just
      `tauri:dev`): all five benchmarks, system detection, AI analysis, session
      history, comparison.
- [ ] Confirm settings persistence (tauri-plugin-store: AI keys + presets survive
      restart).
- [ ] Verify graceful states: NPU-absent (honest stub), unsupported GPU, benchmark
      errors, `score: null` rendering as 0.

## Phase 2 — Distribution pipeline (~1–2 days)
- [ ] Add `.github/workflows/release.yml` using `tauri-apps/tauri-action`: on a
      `v*` tag, build + upload Linux (AppImage/deb), Windows (nsis/msi), and macOS
      (dmg) artifacts to a GitHub Release. (Bundle config already targets `all`.)
- [ ] Signing decision (free path): ship **unsigned** v1 with a documented
      click-through (Windows "More info → Run anyway"; macOS right-click → Open).
      Real code-signing certs are an optional later spend.
- [ ] Tag `v1.0.0`; cut the first Release.

## Phase 3 — Cross-platform validation (gated on hardware)
- [ ] Run the built installers on an actual **Windows** box and a **Mac**; confirm
      the benchmarks produce sane numbers and the UI renders. CI can *build* all
      three but cannot *validate* GPU/CPU benchmark correctness — this needs real
      machines (VM, borrowed, or a friend). This is the real gate to a confident
      release.

## Phase 4 — Optional, post-v1
- [ ] Tauri auto-updater (free, minisign-based; separate from code signing).
- [ ] Download buttons on `hewcarroll.com/neuralgauge` → Releases.
- [ ] Real NPU benchmark (`ort` / ONNX Runtime + DirectML / CoreML) — currently an
      honest stub.
- [ ] A real ML-inference benchmark (tokens/sec on a tiny model) to back the
      "for AI workloads" tagline.
- [ ] Tuning Advisor (suggestions-only system/BIOS advisor) — a separate feature.

---

**Minimum to ship v1:** Phases 0–2 plus at least a Windows validation ≈ 3–5 focused
days of work, plus cross-platform access. Everything in Phase 4 is genuinely optional.

The benchmark engine lives in [`rust-hwbench`](https://github.com/hewcarroll/rust-hwbench);
NeuralGauge is the UI + scoring shell on top of it.
