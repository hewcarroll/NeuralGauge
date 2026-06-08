import React, { useState, useEffect } from 'react';
import { ComponentType, BenchmarkConfig, ConfigPreset } from '../types';
import { Settings, Play, X, Save, FolderOpen, Trash2 } from 'lucide-react';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (config: BenchmarkConfig) => void;
  type: ComponentType | null;
  currentConfig: BenchmarkConfig;
  presets: ConfigPreset[];
  onSavePreset: (name: string, config: BenchmarkConfig) => void;
  onDeletePreset: (id: string) => void;
  onLoadPreset: (config: BenchmarkConfig) => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen, onClose, onRun, type, currentConfig,
  presets, onSavePreset, onDeletePreset, onLoadPreset
}) => {
  const [config, setConfig] = useState<BenchmarkConfig>(currentConfig);
  const [newPresetName, setNewPresetName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfig(currentConfig);
    }
  }, [isOpen, currentConfig]);

  if (!isOpen || !type) return null;

  const handleChange = (key: keyof BenchmarkConfig, value: number | null) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!newPresetName.trim()) return;
    onSavePreset(newPresetName, config);
    setNewPresetName('');
  };

  const handleLoad = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = presets.find(p => p.id === e.target.value);
    if (preset) {
      setConfig(preset.config);
      onLoadPreset(preset.config);
    }
  };

  const isFull = type === ComponentType.FULL_SUITE;

  const InputField = ({ label, prop, min, max, unit, desc }: { label: string, prop: keyof BenchmarkConfig, min: number, max: number, unit?: string, desc?: string }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="number"
          value={config[prop] ?? ''}
          onChange={(e) => handleChange(prop, e.target.value ? parseInt(e.target.value) || min : null)}
          className="bg-black/40 border border-white/10 rounded px-3 py-2 text-white w-full focus:border-primary focus:outline-none"
          min={min}
          max={max}
        />
        {unit && <span className="text-gray-500 text-sm">{unit}</span>}
      </div>
      {desc && <p className="text-xs text-gray-500 mt-1">{desc}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-surface border border-white/20 rounded-xl p-6 max-w-lg w-full shadow-2xl animate-fade-in-up flex flex-col max-h-[90vh]">

        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="text-primary w-5 h-5" />
            <h2 className="text-xl font-bold text-white">Configure {type === ComponentType.FULL_SUITE ? 'Full Suite' : type}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* Presets Section */}
        <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/5 flex-shrink-0">
          <h3 className="text-gray-400 text-xs font-bold uppercase mb-3 flex items-center gap-2">
            <FolderOpen size={12} /> Config Presets
          </h3>
          <div className="flex gap-2 mb-3">
             <select
              onChange={handleLoad}
              className="bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm w-full focus:outline-none"
              defaultValue=""
             >
               <option value="" disabled>Load Saved Preset...</option>
               {presets.map(p => (
                 <option key={p.id} value={p.id}>{p.name}</option>
               ))}
             </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New Preset Name"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm flex-1 focus:border-primary focus:outline-none"
            />
            <button
              onClick={handleSave}
              disabled={!newPresetName.trim()}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded border border-white/10 disabled:opacity-50"
            >
              <Save size={16} />
            </button>
          </div>
          {presets.length > 0 && (
             <div className="flex flex-wrap gap-2 mt-3">
               {presets.map(p => (
                 <div key={p.id} className="flex items-center gap-1 text-xs bg-black/40 px-2 py-1 rounded border border-white/5 text-gray-400">
                    <span>{p.name}</span>
                    <button onClick={() => onDeletePreset(p.id)} className="hover:text-red-400 ml-1"><Trash2 size={10} /></button>
                 </div>
               ))}
             </div>
          )}
        </div>

        <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
          {(isFull || type === ComponentType.CPU) && (
            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/5">
              <h3 className="text-blue-400 font-semibold mb-3 border-b border-white/5 pb-2">CPU Settings</h3>
              <InputField label="Matrix Size" prop="cpuMatrixSize" min={128} max={2048} unit="N" desc="Size of the matrix (N x N) for SIMD FP32 multiply." />
            </div>
          )}

          {(isFull || type === ComponentType.GPU) && (
            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/5">
              <h3 className="text-purple-400 font-semibold mb-3 border-b border-white/5 pb-2">GPU Settings</h3>
              <InputField label="FMA Iterations" prop="gpuIterations" min={1024} max={16384} desc="FMA iterations per element in compute shader." />
              <InputField label="Workgroup Size" prop="gpuWorkgroupSize" min={64} max={1024} desc="GPU workgroup size for compute dispatch." />
            </div>
          )}

          {(isFull || type === ComponentType.NPU) && (
            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/5">
              <h3 className="text-pink-500 font-semibold mb-3 border-b border-white/5 pb-2">AI Accelerator Settings</h3>
              <InputField label="Inference Iterations" prop="npuIterations" min={10} max={1000} desc="Number of inference runs (if NPU detected)." />
            </div>
          )}

          {(isFull || type === ComponentType.GPU_MEMORY) && (
            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/5">
              <h3 className="text-orange-400 font-semibold mb-3 border-b border-white/5 pb-2">VRAM Settings</h3>
              <InputField label="Buffer Size" prop="vramBufferSizeMb" min={32} max={512} unit="MB" desc="GPU buffer size for bandwidth test." />
            </div>
          )}

          {(isFull || type === ComponentType.RAM) && (
            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/5">
              <h3 className="text-green-400 font-semibold mb-3 border-b border-white/5 pb-2">RAM Settings</h3>
              <InputField label="Buffer Size" prop="ramBufferSizeMb" min={32} max={512} unit="MB" desc="Per-array buffer size for STREAM benchmark." />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-4 pt-4 border-t border-white/10 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 transition">Cancel</button>
          <button onClick={() => onRun(config)} className="flex-1 py-3 bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 rounded-lg font-bold flex items-center justify-center gap-2 transition">
            <Play size={18} fill="currentColor" /> Start Benchmark
          </button>
        </div>

      </div>
    </div>
  );
};

export default ConfigModal;
