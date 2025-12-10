import React from 'react';
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

export const GLOBAL_AVERAGES = {
  [ComponentType.CPU]: 8500,        // Mid-range Desktop CPU
  [ComponentType.GPU]: 90000,       // Integrated/Mid GPU
  [ComponentType.GPU_MEMORY]: 4000, // DDR4/DDR5 shared memory speeds
  [ComponentType.NPU]: 6000,        // Software/WebGL fallback average
  [ComponentType.RAM]: 5000,        // Standard DDR4
};

export const SHADERS = {
  GPU_COMPUTE: {
    vertex: `#version 300 es
in vec4 position;
void main() {
  gl_Position = position;
}`,
    fragment: (iterations: number) => `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float val = 0.0;
  // Heavy arithmetic loop
  for(int i = 0; i < ${iterations}; i++) {
    val += sin(uv.x * float(i) + val) * cos(uv.y * float(i) + val);
  }
  outColor = vec4(val, val, val, 1.0);
}`
  },
  GPU_MEMORY: {
    vertex: `#version 300 es
in vec4 position;
in vec2 texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = position;
  v_texCoord = texCoord;
}`,
    fragment: `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_texCoord);
}`
  }
};
