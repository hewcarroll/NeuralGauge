import { Cpu, Zap, Database, Activity, Layers, BrainCircuit } from 'lucide-react';
import { ComponentType } from './types';

export const COMPONENT_ICONS = {
  [ComponentType.CPU]: <Cpu className="w-6 h-6" />,
  [ComponentType.GPU]: <Zap className="w-6 h-6" />,
  [ComponentType.GPU_MEMORY]: <Layers className="w-6 h-6" />,
  [ComponentType.NPU]: <BrainCircuit className="w-6 h-6" />,
  [ComponentType.RAM]: <Database className="w-6 h-6" />,
  [ComponentType.FULL_SUITE]: <Activity className="w-6 h-6" />,
};

export const COMPONENT_COLORS = {
  [ComponentType.CPU]: "text-blue-400 border-blue-400 shadow-blue-500/20",
  [ComponentType.GPU]: "text-purple-400 border-purple-400 shadow-purple-500/20",
  [ComponentType.GPU_MEMORY]: "text-orange-400 border-orange-400 shadow-orange-500/20",
  [ComponentType.NPU]: "text-pink-500 border-pink-500 shadow-pink-500/20",
  [ComponentType.RAM]: "text-green-400 border-green-400 shadow-green-500/20",
  [ComponentType.FULL_SUITE]: "text-primary border-primary shadow-primary/20",
};

// Calibrated global averages for native benchmarks (0-10000 scale)
export const GLOBAL_AVERAGES = {
  [ComponentType.CPU]: 4000,        // Mid-range desktop (i5-12400 class)
  [ComponentType.GPU]: 4000,        // Mid-range discrete (RTX 3060 class)
  [ComponentType.GPU_MEMORY]: 3500, // Mid-range VRAM bandwidth
  [ComponentType.NPU]: 0,          // Most systems don't have NPU
  [ComponentType.RAM]: 3500,        // DDR4-3200 dual-channel
};
