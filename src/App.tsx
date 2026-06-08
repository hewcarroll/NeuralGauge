
import React, { useState, useEffect } from 'react';
import { ComponentType, BenchmarkResult, AnalysisResult, BenchmarkConfig, ConfigPreset, DEFAULT_CONFIG, SavedSession, AIProviderType, AIProviderConfig } from './types';
import { runBenchmark } from './services/benchmarks';
import { analyzeResults } from './services/analysisService';
import BenchmarkCard from './components/BenchmarkCard';
import ResultsView from './components/ResultsView';
import ConfigModal from './components/ConfigModal';
import ProgressBar from './components/ProgressBar';
import SessionHistory from './components/SessionHistory';
import AISettingsModal from './components/AISettingsModal';
import { Activity, Terminal, Settings } from 'lucide-react';

enum AppState {
  IDLE,
  RUNNING,
  ANALYZING,
  RESULTS
}

const CONFIG_STORAGE_KEY = 'neuralgaugeConfig';
const PRESETS_STORAGE_KEY = 'neuralgaugePresets';
const SESSIONS_STORAGE_KEY = 'neuralgaugeSessions';
const AI_PROVIDER_STORAGE_KEY = 'neuralgaugeAIProvider';

const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: AIProviderType.NONE,
  apiKey: '',
  model: '',
  localEndpoint: 'http://localhost:11434/v1',
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [progressValue, setProgressValue] = useState<number>(0);
  
  // Config State
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedBenchmark, setSelectedBenchmark] = useState<ComponentType | null>(null);
  const [config, setConfig] = useState<BenchmarkConfig>(DEFAULT_CONFIG);
  const [presets, setPresets] = useState<ConfigPreset[]>([]);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>(DEFAULT_AI_CONFIG);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

  // Load config, presets & sessions from local storage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (savedConfig) {
      try {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) });
      } catch (e) {
        console.error("Failed to parse saved config", e);
      }
    }
    const savedPresets = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (savedPresets) {
      try {
        setPresets(JSON.parse(savedPresets));
      } catch(e) { console.error(e); }
    }
    const savedSessionsData = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (savedSessionsData) {
      try {
        setSavedSessions(JSON.parse(savedSessionsData));
      } catch(e) { console.error(e); }
    }
    const savedAiConfig = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    if (savedAiConfig) {
      try {
        setAiConfig({ ...DEFAULT_AI_CONFIG, ...JSON.parse(savedAiConfig) });
      } catch(e) { console.error(e); }
    }
  }, []);

  const savePreset = (name: string, cfg: BenchmarkConfig) => {
    const newPreset: ConfigPreset = { id: Date.now().toString(), name, config: cfg };
    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
  };

  const deletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
  };

  // Session Management
  const handleSaveSession = (name: string) => {
    const newSession: SavedSession = {
      id: Date.now().toString(),
      name,
      timestamp: Date.now(),
      results,
      analysis
    };
    const updated = [...savedSessions, newSession];
    setSavedSessions(updated);
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleDeleteSession = (id: string) => {
    const updated = savedSessions.filter(s => s.id !== id);
    setSavedSessions(updated);
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleLoadSession = (session: SavedSession) => {
    setResults(session.results);
    setAnalysis(session.analysis);
    setAppState(AppState.RESULTS);
  };

  const handleSaveAiConfig = (cfg: AIProviderConfig) => {
    setAiConfig(cfg);
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, JSON.stringify(cfg));
  };

  const handleBenchmarkClick = (type: ComponentType) => {
    setSelectedBenchmark(type);
    setConfigModalOpen(true);
  };

  const executeBenchmark = async (runConfig: BenchmarkConfig) => {
    if (!selectedBenchmark) return;
    
    // Save config
    setConfig(runConfig);
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(runConfig));
    setConfigModalOpen(false);
    
    setAppState(AppState.RUNNING);
    setResults([]);
    setProgressValue(0);

    // Determine which tests to run
    const benchmarksToRun = selectedBenchmark === ComponentType.FULL_SUITE 
      ? [ComponentType.CPU, ComponentType.GPU, ComponentType.NPU, ComponentType.GPU_MEMORY, ComponentType.RAM]
      : [selectedBenchmark];

    const totalSteps = benchmarksToRun.length + 1; // +1 for analysis
    let currentStep = 0;
    const accumulatedResults: BenchmarkResult[] = [];

    try {
      // Execute tests sequentially to allow UI updates and prevent freezing all at once
      for (const type of benchmarksToRun) {
        setProgressLabel(`Running ${type} Benchmark...`);
        // Force a tiny delay to allow React to render the progress update before blocking the thread
        await new Promise(r => setTimeout(r, 100));

        const result = await runBenchmark(type, runConfig);
        // Result is an array because the service supports multiple, but we run one by one here
        accumulatedResults.push(...result);
        
        currentStep++;
        setProgressValue((currentStep / totalSteps) * 100);
      }

      setResults(accumulatedResults);

      if (aiConfig.provider === AIProviderType.NONE) {
        setAnalysis(null);
      } else {
        setAppState(AppState.ANALYZING);
        setProgressLabel("Processing Neural Analysis...");
        const analysisResult = await analyzeResults(accumulatedResults, aiConfig);
        setAnalysis(analysisResult);
      }
      
      setProgressValue(100);
      // Short delay to show 100%
      await new Promise(r => setTimeout(r, 500));
      
      setAppState(AppState.RESULTS);
    } catch (e) {
      console.error(e);
      setAppState(AppState.IDLE);
      alert("Benchmark execution failed.");
    }
  };

  const handleReset = () => {
    setResults([]);
    setAnalysis(null);
    setAppState(AppState.IDLE);
  };

  return (
    <div className="min-h-screen bg-dark text-gray-200 font-sans selection:bg-primary/30">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full animate-pulse-fast" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-secondary/5 blur-[120px] rounded-full animate-pulse-fast" style={{animationDelay: '1s'}} />
      </div>

      <header className="relative z-10 border-b border-white/5 bg-dark/80 backdrop-blur-md sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-tr from-primary to-accent rounded flex items-center justify-center">
                <Activity className="text-black w-5 h-5" />
             </div>
             <span className="font-bold text-xl tracking-tight text-white">Vel<span className="text-primary">mur</span></span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
            <button
              onClick={() => setAiSettingsOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded border border-white/10 hover:border-primary/40 hover:text-primary transition text-gray-400"
              title="AI Provider Settings"
            >
              <Settings size={12} />
              <span className="hidden sm:inline">
                {aiConfig.provider === AIProviderType.NONE ? 'No AI' : aiConfig.provider.charAt(0).toUpperCase() + aiConfig.provider.slice(1)}
              </span>
            </button>
            <span className="flex items-center gap-1"><Terminal size={12}/> V1.0.5 BUILD</span>
            <span className="hidden sm:inline text-green-500">READY</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        
        {appState === AppState.IDLE && (
          <div className="space-y-12 animate-fade-in-up">
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                Benchmark Your AI <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Hardware Capabilities</span>
              </h1>
              <p className="text-gray-400 text-lg">
                Run native hardware benchmarks on your GPU, CPU, and RAM to determine AI model compatibility.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <BenchmarkCard
                type={ComponentType.CPU}
                label="CPU Compute"
                description="Multi-threaded SIMD matrix multiplication and cache latency measurement."
                onRun={handleBenchmarkClick}
                disabled={false}
              />
              <BenchmarkCard
                type={ComponentType.GPU}
                label="GPU Compute"
                description="Native GPU compute shader TFLOPS via wgpu (Vulkan/DX12/Metal)."
                onRun={handleBenchmarkClick}
                disabled={false}
              />
              <BenchmarkCard
                type={ComponentType.NPU}
                label="AI Accelerator"
                description="Detects dedicated NPU and benchmarks ONNX inference throughput."
                onRun={handleBenchmarkClick}
                disabled={false}
              />
              <BenchmarkCard
                type={ComponentType.GPU_MEMORY}
                label="VRAM Bandwidth"
                description="GPU memory bandwidth: upload, download, and internal transfer rates."
                onRun={handleBenchmarkClick}
                disabled={false}
              />
              <BenchmarkCard
                type={ComponentType.RAM}
                label="RAM Bandwidth"
                description="STREAM-style DRAM bandwidth: Copy, Scale, Add, Triad."
                onRun={handleBenchmarkClick}
                disabled={false}
              />
              <BenchmarkCard
                type={ComponentType.FULL_SUITE}
                label="Full System Suite"
                description="Run all benchmarks sequentially for a comprehensive system diagnostic."
                onRun={handleBenchmarkClick}
                disabled={false}
              />
            </div>

            <SessionHistory 
              sessions={savedSessions} 
              onLoad={handleLoadSession}
              onDelete={handleDeleteSession}
            />

          </div>
        )}

        {(appState === AppState.RUNNING || appState === AppState.ANALYZING) && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-fade-in">
            <div className="relative w-24 h-24 mb-4">
              <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Activity className="text-primary animate-pulse" />
              </div>
            </div>
            
            <ProgressBar progress={progressValue} label={progressLabel} />
            
            <p className="text-gray-500 text-xs mt-4">Benchmarks running natively. This may take a moment.</p>
          </div>
        )}

        {appState === AppState.RESULTS && (
          <ResultsView 
            results={results} 
            analysis={analysis}
            onReset={handleReset}
            loadingAnalysis={false}
            onSave={handleSaveSession}
          />
        )}

      </main>

      <ConfigModal 
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onRun={executeBenchmark}
        type={selectedBenchmark}
        currentConfig={config}
        presets={presets}
        onSavePreset={savePreset}
        onDeletePreset={deletePreset}
        onLoadPreset={setConfig}
      />

      <AISettingsModal
        isOpen={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
        config={aiConfig}
        onSave={handleSaveAiConfig}
      />

      <footer className="py-8 text-center text-gray-600 text-sm border-t border-white/5 mt-auto">
        <p>NeuralGauge runs native hardware benchmarks on your system.</p>
        <p className="mt-2 text-xs opacity-50">Open source &mdash; <a href="https://www.saelix.org/neuralgauge" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">saelix.org/neuralgauge</a></p>
      </footer>

    </div>
  );
};

export default App;
