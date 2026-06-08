import React, { useState, useEffect } from 'react';
import { AIProviderType, AIProviderConfig } from '../types';
import { Settings, X, Eye, EyeOff } from 'lucide-react';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIProviderConfig;
  onSave: (config: AIProviderConfig) => void;
}

const PROVIDER_INFO: Record<AIProviderType, { label: string; description: string; defaultModel: string; models: string[] }> = {
  [AIProviderType.NONE]: {
    label: 'None (Skip Analysis)',
    description: 'Benchmarks will run without AI analysis.',
    defaultModel: '',
    models: [],
  },
  [AIProviderType.GEMINI]: {
    label: 'Google Gemini',
    description: 'Uses the Google Generative AI API. Requires a Gemini API key from Google AI Studio.',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  },
  [AIProviderType.ANTHROPIC]: {
    label: 'Anthropic Claude',
    description: 'Uses the Anthropic Messages API. Requires an Anthropic API key.',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-20250514'],
  },
  [AIProviderType.OPENAI]: {
    label: 'OpenAI',
    description: 'Uses the OpenAI Chat Completions API. Requires an OpenAI API key.',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
  },
  [AIProviderType.LOCAL]: {
    label: 'Local Model',
    description: 'Connect to a local OpenAI-compatible server (Ollama, LM Studio, vLLM, etc.).',
    defaultModel: 'llama3',
    models: [],
  },
};

const AISettingsModal: React.FC<AISettingsModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [draft, setDraft] = useState<AIProviderConfig>(config);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(config);
      setShowKey(false);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const info = PROVIDER_INFO[draft.provider];
  const needsApiKey = draft.provider !== AIProviderType.NONE && draft.provider !== AIProviderType.LOCAL;
  const needsEndpoint = draft.provider === AIProviderType.LOCAL;

  const handleProviderChange = (provider: AIProviderType) => {
    const providerInfo = PROVIDER_INFO[provider];
    setDraft(prev => ({
      ...prev,
      provider,
      model: providerInfo.defaultModel,
      localEndpoint: provider === AIProviderType.LOCAL ? (prev.localEndpoint || 'http://localhost:11434/v1') : prev.localEndpoint,
    }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-surface border border-white/20 rounded-xl p-6 max-w-lg w-full shadow-2xl animate-fade-in-up flex flex-col max-h-[90vh]">

        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="text-primary w-5 h-5" />
            <h2 className="text-xl font-bold text-white">AI Provider Settings</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto pr-2 flex-1 space-y-6">

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Provider</label>
            <div className="grid grid-cols-1 gap-2">
              {Object.values(AIProviderType).map(ptype => {
                const pinfo = PROVIDER_INFO[ptype];
                const isActive = draft.provider === ptype;
                return (
                  <button
                    key={ptype}
                    onClick={() => handleProviderChange(ptype)}
                    className={`text-left px-4 py-3 rounded-lg border transition-all ${
                      isActive
                        ? 'border-primary/50 bg-primary/10 text-white'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'
                    }`}
                  >
                    <div className="font-medium text-sm">{pinfo.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">{pinfo.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* API Key */}
          {needsApiKey && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">API Key</label>
              <div className="flex gap-2 items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={draft.apiKey}
                  onChange={e => setDraft(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={`Enter your ${info.label} API key`}
                  className="bg-black/40 border border-white/10 rounded px-3 py-2 text-white w-full focus:border-primary focus:outline-none text-sm font-mono"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="p-2 text-gray-400 hover:text-white border border-white/10 rounded"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Your key is stored locally on this device only.</p>
            </div>
          )}

          {/* Local Endpoint */}
          {needsEndpoint && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Server Endpoint</label>
              <input
                type="text"
                value={draft.localEndpoint}
                onChange={e => setDraft(prev => ({ ...prev, localEndpoint: e.target.value }))}
                placeholder="http://localhost:11434/v1"
                className="bg-black/40 border border-white/10 rounded px-3 py-2 text-white w-full focus:border-primary focus:outline-none text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                OpenAI-compatible endpoint. Ollama: http://localhost:11434/v1 &middot; LM Studio: http://localhost:1234/v1
              </p>
            </div>
          )}

          {/* Model Selection */}
          {draft.provider !== AIProviderType.NONE && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Model</label>
              {info.models.length > 0 ? (
                <select
                  value={draft.model}
                  onChange={e => setDraft(prev => ({ ...prev, model: e.target.value }))}
                  className="bg-black/40 border border-white/10 rounded px-3 py-2 text-white w-full focus:outline-none text-sm"
                >
                  {info.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={draft.model}
                  onChange={e => setDraft(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="Model name (e.g., llama3, mistral, phi3)"
                  className="bg-black/40 border border-white/10 rounded px-3 py-2 text-white w-full focus:border-primary focus:outline-none text-sm font-mono"
                />
              )}
            </div>
          )}

        </div>

        <div className="flex gap-3 mt-4 pt-4 border-t border-white/10 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 transition">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-3 bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 rounded-lg font-bold transition">
            Save Settings
          </button>
        </div>

      </div>
    </div>
  );
};

export default AISettingsModal;
