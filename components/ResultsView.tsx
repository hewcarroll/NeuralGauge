import React from 'react';
import { BenchmarkResult, AnalysisResult, ComponentType } from '../types';
import { COMPONENT_ICONS } from '../constants';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ComposedChart, Line, CartesianGrid, Legend } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { RefreshCw, Cpu, Brain, Download, AlertTriangle, Save, Layers, BrainCircuit, Timer } from 'lucide-react';

interface ResultsViewProps {
  results: BenchmarkResult[];
  analysis: AnalysisResult | null;
  onReset: () => void;
  loadingAnalysis: boolean;
}

const ResultsView: React.FC<ResultsViewProps> = ({ results, analysis, onReset, loadingAnalysis }) => {
  
  // Transform data for charts
  const generalChartData = results.map(r => ({
    subject: r.type,
    A: r.score,
    fullMark: 15000, 
  }));

  // Prepare specific data for VRAM chart if available
  const gpuMemResult = results.find(r => r.type === ComponentType.GPU_MEMORY);
  let vramChartData = [];
  if (gpuMemResult && !gpuMemResult.error) {
    const internalBw = gpuMemResult.metrics.find(m => m.name === 'Internal Bandwidth')?.value || 0;
    const writeBw = gpuMemResult.metrics.find(m => m.name === 'Write Bandwidth')?.value || 0;
    const readBw = gpuMemResult.metrics.find(m => m.name === 'Read Bandwidth')?.value || 0;
    
    // Legacy support for older metric name
    const legacyBw = gpuMemResult.metrics.find(m => m.name === 'VRAM Bandwidth')?.value || 0;
    const finalInternalBw = internalBw || legacyBw;

    const writeLatency = gpuMemResult.metrics.find(m => m.name === 'Write Latency')?.value || 0;
    const readLatency = gpuMemResult.metrics.find(m => m.name === 'Read Latency')?.value || 0;
    
    vramChartData = [
      { name: 'Bandwidth', internal: finalInternalBw, write: writeBw, read: readBw },
      { name: 'Latency', writeL: writeLatency, readL: readLatency }
    ];
  }

  // Prepare specific data for CPU Cache chart
  const cpuResult = results.find(r => r.type === ComponentType.CPU);
  let cpuCacheData = [];
  let cpuLatencyData = [];

  if (cpuResult && !cpuResult.error) {
    const seqRead = cpuResult.metrics.find(m => m.name === 'Seq. Read')?.value || 0;
    const rndRead = cpuResult.metrics.find(m => m.name === 'Rnd. Read')?.value || 0;
    cpuCacheData = [
      { name: 'Seq. Read', speed: seqRead, type: 'Sequential' },
      { name: 'Rnd. Read', speed: rndRead, type: 'Random' }
    ];

    const readLat = cpuResult.metrics.find(m => m.name === 'Mem Read Latency')?.value || 0;
    const writeLat = cpuResult.metrics.find(m => m.name === 'Mem Write Latency')?.value || 0;
    cpuLatencyData = [
       { name: 'Read', latency: readLat },
       { name: 'Write', latency: writeLat }
    ];
  }

  // Prepare specific data for NPU chart
  const npuResult = results.find(r => r.type === ComponentType.NPU);
  let npuChartData = [];
  if (npuResult && !npuResult.error) {
    // Determine backend
    const backendMetric = npuResult.metrics.find(m => m.name === 'Backend');
    const backendName = backendMetric?.value === 1 ? 'WebGPU' : 'WebGL';
    
    // Get TFLOPS
    const perfMetric = npuResult.metrics.find(m => m.name.includes('Performance'));
    const tflops = perfMetric?.value || 0;

    npuChartData = [
      { name: backendName, tflops: tflops }
    ];
  }

  const getScoreColor = (score: number) => {
    if (score > 80) return "text-green-400";
    if (score > 50) return "text-yellow-400";
    return "text-red-400";
  };

  const handleExport = () => {
    const data = {
      timestamp: new Date().toISOString(),
      results,
      analysis
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `neural-gauge-results-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in w-full max-w-6xl mx-auto space-y-8 pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-white">Benchmark Report</h2>
          <p className="text-gray-400 mt-1">Generated {new Date().toLocaleTimeString()}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm transition-colors border border-primary/20"
          >
            <Save size={16} />
            Export JSON
          </button>
          <button 
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors border border-white/10"
          >
            <RefreshCw size={16} />
            Start New
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Raw Scores */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-surface border border-white/10 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Cpu size={20} className="text-primary" /> Component Scores
            </h3>
            <div className="space-y-4">
              {results.map((res) => (
                <div key={res.type} className={`p-4 rounded-lg border ${res.error ? 'bg-red-900/10 border-red-500/30' : 'bg-dark/50 border-white/5'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="flex items-center gap-2 font-medium text-gray-200">
                      {COMPONENT_ICONS[res.type]} {res.type}
                    </span>
                    {res.error ? (
                      <AlertTriangle size={18} className="text-red-400" />
                    ) : (
                      <span className="text-2xl font-mono font-bold text-primary">{res.score}</span>
                    )}
                  </div>
                  
                  {res.error ? (
                    <div className="text-xs text-red-400 mt-2 bg-red-900/20 p-2 rounded">
                      {res.error}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {res.metrics.map(m => (
                        <div key={m.name} className="flex justify-between text-xs text-gray-500">
                          <span>{m.name}</span>
                          <span className="text-gray-300">{m.value} {m.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-white/10 rounded-xl p-6 h-64">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Overall Performance</h4>
             <ResponsiveContainer width="100%" height="80%">
                <BarChart data={generalChartData}>
                  <XAxis dataKey="subject" tick={{fill: '#666', fontSize: 10}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                    itemStyle={{ color: '#fff' }}
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  />
                  <Bar dataKey="A" radius={[4, 4, 0, 0]}>
                    {generalChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#00f2ea' : '#7000ff'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
          </div>
        </div>

        {/* Right Column: AI Analysis */}
        <div className="lg:col-span-2 space-y-6">
          
          {loadingAnalysis ? (
            <div className="bg-surface border border-white/10 rounded-xl p-12 flex flex-col items-center justify-center text-center h-full min-h-[400px]">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
              <h3 className="text-xl font-bold text-white mb-2">Analyzing Hardware Neural Matrix...</h3>
              <p className="text-gray-400 max-w-md">Gemini is evaluating your system's capability for LLM inference and diffusion generation.</p>
            </div>
          ) : analysis ? (
            <>
              {/* Readiness Score */}
              <div className="bg-surface border border-white/10 rounded-xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
                  <div className="text-center md:text-left">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">AI Readiness Score</h3>
                    <div className={`text-6xl font-black ${getScoreColor(analysis.aiReadinessScore)} tracking-tighter`}>
                      {analysis.aiReadinessScore}<span className="text-2xl text-gray-600">/100</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 bg-white/5 rounded-lg p-4">
                     <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                       <Brain size={16} /> Recommended Models
                     </h4>
                     <div className="flex flex-wrap gap-2">
                        {analysis.recommendedModels.length > 0 ? (
                          analysis.recommendedModels.map(model => (
                            <span key={model} className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-medium">
                              {model}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500 italic">No models recommended based on current hardware.</span>
                        )}
                     </div>
                  </div>
                </div>
              </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* VRAM Bandwidth Chart */}
                 {vramChartData.length > 0 && (
                  <div className="bg-surface border border-white/10 rounded-xl p-6">
                     <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                       <Layers size={16} className="text-orange-400" /> VRAM Performance
                     </h4>
                     <div className="h-48">
                       <ResponsiveContainer width="100%" height="100%">
                         <BarChart 
                           layout="vertical"
                           data={vramChartData.filter(d => d.name === 'Bandwidth')}
                         >
                           <CartesianGrid stroke="#333" strokeDasharray="3 3" horizontal={false} />
                           <XAxis type="number" tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} unit=" GB/s" />
                           <YAxis dataKey="name" type="category" hide width={10} />
                           <Tooltip 
                              contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                              itemStyle={{ color: '#fff' }}
                              cursor={{fill: 'rgba(255,255,255,0.05)'}}
                           />
                           <Legend verticalAlign="bottom" height={36} iconSize={10}/>
                           <Bar dataKey="internal" name="Internal (Copy)" fill="#f97316" radius={[0, 4, 4, 0]} barSize={12} />
                           <Bar dataKey="write" name="Write (Upload)" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={12} />
                           <Bar dataKey="read" name="Read (Download)" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} />
                         </BarChart>
                       </ResponsiveContainer>
                     </div>
                  </div>
                 )}

                 {/* VRAM Latency Chart if available */}
                 {vramChartData.length > 0 && (
                  <div className="bg-surface border border-white/10 rounded-xl p-6">
                     <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                       <Download size={16} className="text-orange-400" /> VRAM Latency
                     </h4>
                     <div className="h-48">
                       <ResponsiveContainer width="100%" height="100%">
                         <ComposedChart data={vramChartData.filter(d => d.name === 'Latency')} layout="vertical">
                           <CartesianGrid stroke="#333" strokeDasharray="3 3" horizontal={false} />
                           <XAxis type="number" hide />
                           <YAxis dataKey="name" type="category" hide />
                           <Tooltip 
                              contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                              itemStyle={{ color: '#fff' }}
                              cursor={{fill: 'rgba(255,255,255,0.05)'}}
                           />
                           <Legend verticalAlign="bottom" height={36} iconSize={10}/>
                           <Bar dataKey="writeL" name="Write Latency" fill="#fb923c" barSize={20} radius={[4, 0, 0, 4]} />
                           <Bar dataKey="readL" name="Read Latency" fill="#ef4444" barSize={20} radius={[0, 4, 4, 0]} />
                         </ComposedChart>
                       </ResponsiveContainer>
                     </div>
                  </div>
                 )}

                 {/* CPU Cache Throughput */}
                 {cpuCacheData.length > 0 && (
                   <div className="bg-surface border border-white/10 rounded-xl p-6">
                      <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <Cpu size={16} className="text-blue-400" /> CPU Cache Throughput
                      </h4>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={cpuCacheData}>
                            <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} />
                            <YAxis tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} unit=" MB/s" />
                            <Tooltip 
                               contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                               itemStyle={{ color: '#fff' }}
                               cursor={{fill: 'rgba(255,255,255,0.05)'}}
                               formatter={(value: number) => [`${value} MB/s`, 'Throughput']}
                            />
                            <Bar dataKey="speed" name="MB/s" radius={[4, 4, 0, 0]} barSize={40}>
                               {cpuCacheData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.type === 'Sequential' ? '#60a5fa' : '#3b82f6'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                   </div>
                 )}

                 {/* CPU Memory Latency Chart */}
                 {cpuLatencyData.length > 0 && (
                   <div className="bg-surface border border-white/10 rounded-xl p-6">
                      <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <Timer size={16} className="text-blue-400" /> CPU Memory Latency
                      </h4>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={cpuLatencyData}>
                            <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} />
                            <YAxis tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} unit=" ns" />
                            <Tooltip 
                               contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                               itemStyle={{ color: '#fff' }}
                               cursor={{fill: 'rgba(255,255,255,0.05)'}}
                               formatter={(value: number) => [`${value} ns`, 'Latency']}
                            />
                            <Bar dataKey="latency" name="Nanoseconds" radius={[4, 4, 0, 0]} barSize={40} fill="#3b82f6" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                   </div>
                 )}

                 {/* NPU Chart if available */}
                 {npuChartData.length > 0 && (
                    <div className="bg-surface border border-white/10 rounded-xl p-6">
                      <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <BrainCircuit size={16} className="text-pink-500" /> NPU Tensor Ops
                      </h4>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={npuChartData} layout="vertical">
                            <CartesianGrid stroke="#333" strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} />
                            <YAxis dataKey="name" type="category" tick={{fill: '#fff', fontSize: 12, fontWeight: 'bold'}} axisLine={false} tickLine={false} width={60} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                                itemStyle={{ color: '#fff' }}
                                cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                formatter={(value: number) => [`${value} TFLOPS`, 'Performance']}
                            />
                            <Bar dataKey="tflops" fill="#ec4899" radius={[0, 4, 4, 0]} barSize={30} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                 )}

               </div>

              {/* Detailed Markdown */}
              <div className="bg-surface border border-white/10 rounded-xl p-8 min-h-[300px]">
                <h3 className="text-xl font-bold text-white mb-4">Engineer's Verdict</h3>
                <div className="prose prose-invert prose-sm max-w-none prose-p:text-gray-300 prose-headings:text-white prose-strong:text-primary">
                  <ReactMarkdown>{analysis.markdown}</ReactMarkdown>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-surface border border-red-500/20 rounded-xl p-8 text-center text-red-400">
              Analysis failed to load.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsView;
