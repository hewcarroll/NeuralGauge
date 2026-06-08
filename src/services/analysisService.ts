import { BenchmarkResult, AnalysisResult, AIProviderType, AIProviderConfig } from '../types';

const SYSTEM_PROMPT = `You are a hardware analysis expert. You will receive benchmark results from a desktop system evaluated for AI workload readiness. Benchmarks use Rust with real SIMD, wgpu compute shaders, and STREAM-style memory tests. Scores are calibrated on a 0-10000 scale against reference hardware.

You must respond with ONLY valid JSON matching this exact schema:
{
  "markdown": "string (markdown formatted detailed analysis)",
  "aiReadinessScore": number (0-100),
  "recommendedModels": ["string array of model names"]
}

Do not include any text outside the JSON object.`;

function buildPrompt(results: BenchmarkResult[]): string {
  const validResults = results.filter(r => !r.error);
  const erroredResults = results.filter(r => r.error);

  const promptData = validResults.map(r =>
    `${r.type}: Score ${r.score} (${r.metrics.map(m => `${m.name}: ${m.value}${m.unit}`).join(', ')})`
  ).join('\n');

  const errorContext = erroredResults.length > 0
    ? `\nCRITICAL ERRORS ENCOUNTERED:\n${erroredResults.map(r => {
        const failureType = r.error?.split(':')[0] || 'Unknown';
        const details = r.error?.split(':')[1] || 'No details';
        return `- ${r.type} Failed (${failureType}): ${details}`;
      }).join('\n')}\n\nPlease explain why these specific hardware tests might have failed based on the error types provided.`
    : '';

  return `I have run native hardware benchmarks on a desktop system for AI workload readiness.

Here are the results:
${promptData}
${errorContext}

1. Provide an "AI Readiness Score" from 0 to 100 based on the combined capabilities.
2. Suggest what kind of AI models (e.g., MobileNet, Llama-3-8B-Quantized, SDXL-Turbo, Stable Diffusion XL, Whisper Large, Llama-3-70B-Q4) might be runnable locally on this machine.
3. Write a short technical analysis identifying the bottleneck (CPU vs GPU vs VRAM vs RAM).`;
}

function parseResponse(text: string): AnalysisResult {
  // Try to extract JSON from the response, handling markdown code blocks
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  const parsed = JSON.parse(jsonStr);
  return {
    markdown: parsed.markdown || '',
    aiReadinessScore: typeof parsed.aiReadinessScore === 'number' ? parsed.aiReadinessScore : 0,
    recommendedModels: Array.isArray(parsed.recommendedModels) ? parsed.recommendedModels : [],
  };
}

function makeErrorResult(msg: string): AnalysisResult {
  return {
    markdown: `### Analysis Unavailable\n\n${msg}`,
    aiReadinessScore: 0,
    recommendedModels: [],
  };
}

// --- Provider implementations ---

async function analyzeWithGemini(prompt: string, config: AIProviderConfig): Promise<AnalysisResult> {
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  const response = await ai.models.generateContent({
    model: config.model || 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          markdown: { type: Type.STRING },
          aiReadinessScore: { type: Type.NUMBER },
          recommendedModels: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      }
    }
  });

  const text = response.text;
  if (!text) {
    if (response.candidates?.[0]?.finishReason) {
      throw new Error(`AI blocked content: ${response.candidates[0].finishReason}`);
    }
    throw new Error('Empty response from AI');
  }
  return JSON.parse(text) as AnalysisResult;
}

async function analyzeWithOpenAICompatible(
  prompt: string,
  config: AIProviderConfig,
  baseUrl: string
): Promise<AnalysisResult> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from AI');
  return parseResponse(text);
}

async function analyzeWithAnthropic(prompt: string, config: AIProviderConfig): Promise<AnalysisResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Anthropic');
  return parseResponse(text);
}

async function analyzeWithOpenAI(prompt: string, config: AIProviderConfig): Promise<AnalysisResult> {
  return analyzeWithOpenAICompatible(prompt, config, 'https://api.openai.com/v1');
}

async function analyzeWithLocal(prompt: string, config: AIProviderConfig): Promise<AnalysisResult> {
  const endpoint = config.localEndpoint || 'http://localhost:11434/v1';
  return analyzeWithOpenAICompatible(prompt, config, endpoint);
}

// --- Main entry point ---

export const analyzeResults = async (
  results: BenchmarkResult[],
  providerConfig: AIProviderConfig
): Promise<AnalysisResult> => {
  if (providerConfig.provider === AIProviderType.NONE) {
    return makeErrorResult(
      'AI analysis is disabled. Configure an AI provider in Settings to enable hardware analysis.'
    );
  }

  const validResults = results.filter(r => !r.error);
  if (validResults.length === 0) {
    return makeErrorResult(
      'All benchmarks failed to run. Please check your hardware compatibility.'
    );
  }

  if (providerConfig.provider !== AIProviderType.LOCAL && !providerConfig.apiKey) {
    return makeErrorResult(
      `No API key configured for ${providerConfig.provider}. Open Settings to add your API key.`
    );
  }

  const prompt = buildPrompt(results);

  try {
    switch (providerConfig.provider) {
      case AIProviderType.GEMINI:
        return await analyzeWithGemini(prompt, providerConfig);
      case AIProviderType.ANTHROPIC:
        return await analyzeWithAnthropic(prompt, providerConfig);
      case AIProviderType.OPENAI:
        return await analyzeWithOpenAI(prompt, providerConfig);
      case AIProviderType.LOCAL:
        return await analyzeWithLocal(prompt, providerConfig);
      default:
        return makeErrorResult('Unknown AI provider selected.');
    }
  } catch (error: any) {
    console.error('AI Analysis Failed:', error);
    let msg = error.message || 'Unknown Error';

    if (msg.includes('401')) msg = 'Unauthorized (401). Invalid or expired API key.';
    else if (msg.includes('403')) msg = 'Forbidden (403). API key does not have permission.';
    else if (msg.includes('429')) msg = 'Rate limit exceeded (429). Try again later.';
    else if (msg.includes('fetch failed') || msg.includes('Failed to fetch'))
      msg = 'Network error. Could not connect to the AI service. Check your connection and endpoint URL.';

    return makeErrorResult(
      `An error occurred while communicating with ${providerConfig.provider}:\n\n**${msg}**\n\n*Check the console for technical details.*`
    );
  }
};
