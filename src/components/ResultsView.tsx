import React, { useState, useEffect } from 'react';
import { BenchmarkResult, AnalysisResult, ComponentType, SavedSession } from '../types';
import { COMPONENT_ICONS, GLOBAL_AVERAGES } from '../constants';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, Legend, ErrorBar } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { RefreshCw, Cpu, Brain, Download, AlertTriangle, Save, Layers, BrainCircuit, Timer, Check, X, ArrowUpRight, ArrowDownRight, Scale, Zap } from 'lucide-react';

interface ResultsViewProps {
  results: BenchmarkResult[];
  analysis: AnalysisResult | null;
  onReset: () => void;
  loadingAnalysis: boolean;
  onSave?: (name: string) => void;
}

/** How to label a result's interval: current runs report the median's interval;
 *  sessions saved by 1.0.x carry the old interval of the mean. */
function ciLabel(res: BenchmarkResult): string {
  if (res.legacyStats) return '95% CI (mean, legacy)';
  return res.medianCiValid ? '95% CI (median)' : 'Range (too few runs for 95%)';
}

const ResultsView: React.FC<ResultsViewProps> = ({ results, analysis, onReset, loadingAnalysis, onSave }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [compareId, setCompareId] = useState<string>('none');
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);

  // Load sessions for comparison dropdown
  useEffect(() => {
    const sessions = localStorage.getItem('neuralgaugeSessions');
    if (sessions) {
      try {
        setSavedSessions(JSON.parse(sessions));
      } catch (e) { console.error(e); }
    }
  }, []);

  // Determine comparison dataset
  let comparisonData: Record<string, number> | null = null;
  let comparisonLabel = 'Comparison';

  if (compareId === 'avg') {
    comparisonData = GLOBAL_AVERAGES;
    comparisonLabel = 'Global Avg';
  } else if (compareId !== 'none') {
    const session = savedSessions.find(s => s.id === compareId);
    if (session) {
      comparisonLabel = session.name;
      comparisonData = session.results.reduce((acc, curr) => ({
        ...acc,
        [curr.type]: curr.score
      }), {});
    }
  }

  // Transform data for charts with comparison
  const generalChartData = results.map(r => ({
    subject: r.type,
    current: r.score,
    compare: comparisonData ? (comparisonData[r.type] || 0) : null,
    fullMark: 15000, 
  }));

  // Prepare specific data for VRAM chart if available
  const gpuMemResult = results.find(r => r.type === ComponentType.GPU_MEMORY);
  let vramChartData: any[] = [];
  let vramLatencyData: any[] = [];
  
  if (gpuMemResult && !gpuMemResult.error) {
    const internalBw = gpuMemResult.metrics.find(m => m.name === 'Internal Bandwidth')?.value || 0;
    const writeBw = gpuMemResult.metrics.find(m => m.name === 'Write Bandwidth')?.value || 0;
    const readBw = gpuMemResult.metrics.find(m => m.name === 'Read Bandwidth')?.value || 0;
    const writeLat = gpuMemResult.metrics.find(m => m.name === 'Write Latency')?.value || 0;
    const readLat = gpuMemResult.metrics.find(m => m.name === 'Read Latency')?.value || 0;

    const legacyBw = gpuMemResult.metrics.find(m => m.name === 'VRAM Bandwidth')?.value || 0;
    const finalInternalBw = internalBw || legacyBw;

    vramChartData = [
      { name: 'Internal', value: finalInternalBw },
      { name: 'Write', value: writeBw },
      { name: 'Read', value: readBw },
    ];
    
    vramLatencyData = [
       { name: 'Write', value: writeLat, fill: '#ef4444' }, // Red
       { name: 'Read', value: readLat, fill: '#3b82f6' }    // Blue
    ];
  }

  // Prepare specific data for NPU chart
  const npuResult = results.find(r => r.type === ComponentType.NPU);
  let npuChartData: any[] = [];
  if (npuResult && !npuResult.error) {
    const backendMetric = npuResult.metrics.find(m => m.name === 'Backend');
    const backendName = backendMetric?.value === 1 ? 'WebGPU' : 'WebGL';
    const perfMetric = npuResult.metrics.find(m => m.name.includes('Performance'));
    const tflops = perfMetric?.value || 0;

    npuChartData = [
      { name: backendName, tflops: tflops }
    ];
  }

  // Prepare specific data for CPU Cache Latency chart
  const cpuResult = results.find(r => r.type === ComponentType.CPU);
  let cpuCacheData: any[] = [];
  if (cpuResult && !cpuResult.error) {
    const l1 = cpuResult.metrics.find(m => m.name === 'L1 R-Lat')?.value || 0;
    const l2 = cpuResult.metrics.find(m => m.name === 'L2 R-Lat')?.value || 0;
    const l3 = cpuResult.metrics.find(m => m.name === 'L3 R-Lat')?.value || 0;
    
    cpuCacheData = [
      { name: 'L1 Cache', value: l1, fill: '#60a5fa' }, // Blue
      { name: 'L2 Cache', value: l2, fill: '#a78bfa' }, // Purple
      { name: 'L3/RAM', value: l3, fill: '#f472b6' }    // Pink
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

  const handleSaveClick = () => {
    setIsSaving(true);
    setSessionName(`Benchmark ${new Date().toLocaleDateString()}`);
  };

  const confirmSave = () => {
    if (onSave && sessionName.trim()) {
      onSave(sessionName);
      setIsSaving(false);
    }
  };

  return (
    <div className="animate-fade-in w-full max-w-6xl mx-auto space-y-8 pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-white">Benchmark Report</h2>
          <p className="text-gray-400 mt-1">Generated {new Date().toLocaleTimeString()}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          
          {isSaving ? (
             <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/10 animate-fade-in">
               <input 
                 type="text" 
                 value={sessionName}
                 onChange={(e) => setSessionName(e.target.value)}
                 className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary w-40"
                 placeholder="Session Name"
                 autoFocus
               />
               <button onClick={confirmSave} className="p-1.5 bg-primary/20 text-primary hover:bg-primary/30 rounded">
                 <Check size={16} />
               </button>
               <button onClick={() => setIsSaving(false)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded">
                 <X size={16} />
               </button>
             </div>
          ) : (
            <>
              {onSave && (
                <button 
                  onClick={handleSaveClick}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors border border-white/10 text-gray-200"
                >
                  <Save size={16} />
                  Save Session
                </button>
              )}
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm transition-colors border border-primary/20"
              >
                <Download size={16} />
                Export JSON
              </button>
            </>
          )}

          <div className="w-px h-8 bg-white/10 mx-2 hidden md:block"></div>

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
                      <div className="flex items-center gap-2">
                        {comparisonData && (
                          <span className={`text-xs font-bold flex items-center ${res.score >= (comparisonData[res.type] || 0) ? 'text-green-500' : 'text-red-500'}`}>
                            {res.score >= (comparisonData[res.type] || 0) ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                            {Math.round(((res.score - (comparisonData[res.type] || 0)) / (comparisonData[res.type] || 1)) * 100)}%
                          </span>
                        )}
                        <span className="text-2xl font-mono font-bold text-primary">{res.score}</span>
                      </div>
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
                      <div className="mt-2 pt-2 border-t border-white/5 space-y-0.5">
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Median</span>
                          <span className="text-gray-400 font-mono">{res.medianRaw.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Std dev</span>
                          <span className="text-gray-400 font-mono">{Number.isFinite(res.stdDev) ? res.stdDev.toFixed(4) : 'n/a'}{Number.isFinite(res.cvPercent) ? ` (${res.cvPercent.toFixed(1)}%)` : ''}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>{ciLabel(res)}</span>
                          <span className="text-gray-400 font-mono">[{res.medianCi95[0].toFixed(4)}, {res.medianCi95[1].toFixed(4)}]</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Runs</span>
                          <span className="text-gray-400">{res.runCount} (+{res.warmupCount} warmup)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-white/10 rounded-xl p-6 h-80">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase">Performance Compare</h4>
              <div className="flex items-center gap-2">
                <Scale size={14} className="text-gray-400"/>
                <select 
                  value={compareId} 
                  onChange={(e) => setCompareId(e.target.value)}
                  className="bg-black/30 text-xs text-gray-300 border border-white/10 rounded px-2 py-1 outline-none focus:border-primary"
                >
                  <option value="none">No Comparison</option>
                  <option value="avg">Global Average</option>
                  <optgroup label="Saved Sessions">
                    {savedSessions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
             <ResponsiveContainer width="100%" height="85%">
                <BarChart data={generalChartData}>
                  <XAxis dataKey="subject" tick={{fill: '#666', fontSize: 10}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                    itemStyle={{ color: '#fff' }}
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  />
                  <Legend verticalAlign="bottom" height={36} iconSize={10}/>
                  <Bar dataKey="current" name="This Run" fill="#00f2ea" radius={[4, 4, 0, 0]} />
                  {comparisonData && (
                     <Bar dataKey="compare" name={comparisonLabel} fill="#4b5563" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
          </div>
        </div>

        {/* Statistics Table - Full Width Row */}
        <div className="lg:col-span-3">
          <div className="bg-surface border border-white/10 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Cpu size={20} className="text-primary" /> Statistical Summary
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Component</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Score</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Median</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Std dev</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">CV</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Median 95% CI</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Runs</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(res => (
                    <tr key={res.type} className={`border-b border-white/5 ${res.error ? 'text-red-400/70' : ''}`}>
                      <td className="py-2 px-3 flex items-center gap-2 text-gray-200">
                        {COMPONENT_ICONS[res.type]} {res.type}
                      </td>
                      <td className="text-right py-2 px-3 font-mono font-bold text-primary">
                        {res.error ? '—' : res.score}
                      </td>
                      <td className="text-right py-2 px-3 font-mono text-gray-300">
                        {res.error ? '—' : res.medianRaw.toFixed(4)}
                      </td>
                      <td className="text-right py-2 px-3 font-mono text-gray-300">
                        {res.error || !Number.isFinite(res.stdDev) ? '—' : res.stdDev.toFixed(4)}
                      </td>
                      <td className="text-right py-2 px-3 font-mono text-gray-300">
                        {res.error || !Number.isFinite(res.cvPercent) ? '—' : `${res.cvPercent.toFixed(1)}%`}
                      </td>
                      <td className="text-right py-2 px-3 font-mono text-gray-300" title={ciLabel(res)}>
                        {res.error ? '—' : `${res.medianCi95[0].toFixed(4)} – ${res.medianCi95[1].toFixed(4)}${res.legacyStats ? ' *' : !res.medianCiValid ? ' (range)' : ''}`}
                      </td>
                      <td className="text-right py-2 px-3 text-gray-400">
                        {res.runCount}
                      </td>
                      <td className="text-right py-2 px-3 text-gray-400">
                        {(res.durationMs / 1000).toFixed(1)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results.some(r => r.legacyStats) && (
              <p className="text-xs text-gray-500 mt-3">* Saved by NeuralGauge 1.0.x: this interval is for the mean, not the median, and its spread figure was a standard deviation (for VRAM, of durations in seconds, so it isn't shown).</p>
            )}
          </div>
        </div>

        {/* Confidence Interval Chart - Full Width Row */}
        {results.filter(r => !r.error).length > 0 && (
          <div className="lg:col-span-3">
            <div className="bg-surface border border-white/10 rounded-xl p-6">
              <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Scale size={16} className="text-primary" /> Scores with 95% Intervals
              </h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.filter(r => !r.error).map(r => ({
                    name: r.type,
                    score: r.score,
                    // The engine maps the median's interval through the same calibration as the
                    // score, so the whiskers are the score's own 95% interval.
                    // Only a valid median interval becomes 95% whiskers; a min–max range from too few runs doesn't.
                    ci: r.medianCiValid && r.scoreCi95 ? [r.score - r.scoreCi95[0], r.scoreCi95[1] - r.score] : undefined,
                  }))}>
                    <CartesianGrid stroke="#333" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{fill: '#999', fontSize: 11}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                      itemStyle={{ color: '#fff' }}
                      cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      formatter={(value, name) => [Number(value), String(name)]}
                    />
                    <Legend verticalAlign="bottom" height={36} iconSize={10} />
                    <Bar dataKey="score" name="Score" fill="#00f2ea" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="ci" width={6} strokeWidth={1.5} stroke="#ffffff" direction="y" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Right Column: AI Analysis */}
        <div className="lg:col-span-2 space-y-6">
          
          {loadingAnalysis ? (
            <div className="bg-surface border border-white/10 rounded-xl p-12 flex flex-col items-center justify-center text-center h-full min-h-[400px]">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
              <h3 className="text-xl font-bold text-white mb-2">Analyzing Hardware Neural Matrix...</h3>
              <p className="text-gray-400 max-w-md">AI is evaluating your system's capability for LLM inference and diffusion generation.</p>
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
                       <Layers size={16} className="text-orange-400" /> VRAM Bandwidth
                     </h4>
                     <div className="h-48">
                       <ResponsiveContainer width="100%" height="100%">
                         <BarChart 
                           layout="vertical"
                           data={vramChartData}
                         >
                           <CartesianGrid stroke="#333" strokeDasharray="3 3" horizontal={false} />
                           <XAxis type="number" tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} unit=" GB/s" />
                           <YAxis dataKey="name" type="category" tick={{fill: '#fff', fontSize: 11}} axisLine={false} tickLine={false} width={80} />
                           <Tooltip 
                              contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                              itemStyle={{ color: '#fff' }}
                              cursor={{fill: 'rgba(255,255,255,0.05)'}}
                           />
                           <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} barSize={20}>
                              {vramChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={
                                  entry.name === 'Internal' ? '#f97316' : 
                                  entry.name === 'Write' ? '#22c55e' : '#3b82f6'
                                } />
                              ))}
                           </Bar>
                         </BarChart>
                       </ResponsiveContainer>
                     </div>
                  </div>
                 )}

                 {/* GPU Latency Chart */}
                 {vramLatencyData.length > 0 && (
                  <div className="bg-surface border border-white/10 rounded-xl p-6">
                     <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                       <Timer size={16} className="text-red-400" /> VRAM Latency
                     </h4>
                     <div className="h-48">
                       <ResponsiveContainer width="100%" height="100%">
                         <BarChart 
                           layout="vertical"
                           data={vramLatencyData}
                         >
                           <CartesianGrid stroke="#333" strokeDasharray="3 3" horizontal={false} />
                           <XAxis type="number" tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} unit=" ms" />
                           <YAxis dataKey="name" type="category" tick={{fill: '#fff', fontSize: 11}} axisLine={false} tickLine={false} width={80} />
                           <Tooltip 
                              contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                              itemStyle={{ color: '#fff' }}
                              cursor={{fill: 'rgba(255,255,255,0.05)'}}
                           />
                           <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                              {vramLatencyData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                           </Bar>
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
                                formatter={(value) => [`${value} TFLOPS`, 'Performance']}
                            />
                            <Bar dataKey="tflops" fill="#ec4899" radius={[0, 4, 4, 0]} barSize={30} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                 )}

                 {/* CPU Cache Latency Chart */}
                 {cpuCacheData.length > 0 && (
                    <div className="bg-surface border border-white/10 rounded-xl p-6">
                      <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <Zap size={16} className="text-blue-400" /> CPU Cache Latency
                      </h4>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={cpuCacheData} layout="vertical">
                            <CartesianGrid stroke="#333" strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tick={{fill: '#999', fontSize: 10}} axisLine={false} tickLine={false} unit=" ns" />
                            <YAxis dataKey="name" type="category" tick={{fill: '#fff', fontSize: 11}} axisLine={false} tickLine={false} width={80} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#121212', borderColor: '#333' }}
                                itemStyle={{ color: '#fff' }}
                                cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                formatter={(value) => [`${value} ns`, 'Random Latency']}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                {cpuCacheData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Bar>
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
            <div className="bg-surface border border-white/10 rounded-xl p-8 text-center text-gray-400">
              <p className="font-semibold text-gray-300 mb-1">No AI analysis</p>
              <p className="text-sm">Connect an AI provider in Settings (top-right) to get model recommendations and an engineer's verdict based on these results.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsView;
