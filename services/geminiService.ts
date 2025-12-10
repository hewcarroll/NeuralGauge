import { GoogleGenAI, Type } from '@google/genai';
import { BenchmarkResult, AnalysisResult } from '../types';

export const analyzeResults = async (results: BenchmarkResult[]): Promise<AnalysisResult> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return {
        markdown: "### API Key Missing\n\nCannot perform AI analysis because the API key is not configured.",
        aiReadinessScore: 0,
        recommendedModels: []
      };
    }

    const ai = new GoogleGenAI({ apiKey });

    // Filter out errored results
    const validResults = results.filter(r => !r.error);
    const erroredResults = results.filter(r => r.error);

    if (validResults.length === 0) {
      return {
        markdown: "### Benchmark Failure\n\nAll benchmarks failed to run. Please check your browser compatibility and hardware settings.",
        aiReadinessScore: 0,
        recommendedModels: []
      };
    }

    const promptData = validResults.map(r => 
      `${r.type}: Score ${r.score} (${r.metrics.map(m => `${m.name}: ${m.value}${m.unit}`).join(', ')})`
    ).join('\n');

    // Enhanced Error Reporting for Context
    const errorContext = erroredResults.length > 0 
      ? `\nCRITICAL ERRORS ENCOUNTERED:\n${erroredResults.map(r => {
          const failureType = r.error?.split(':')[0] || 'Unknown';
          const details = r.error?.split(':')[1] || 'No details';
          return `- ${r.type} Failed (${failureType}): ${details}`;
        }).join('\n')}\n\nPlease explain why these specific hardware tests might have failed based on the error types provided (e.g. OOM means not enough VRAM/RAM, Shader Error means GPU driver incompatibility, DeviceLost means GPU reset).` 
      : '';

    const prompt = `
      I have run a browser-based hardware benchmark for AI capabilities. 
      Here are the raw results:
      ${promptData}
      ${errorContext}

      Please analyze these scores. Consider that these are running in a browser environment (WebGL/JS) so they are lower than native bare-metal scores, but relative performance still applies.
      
      1. Provide a "AI Readiness Score" from 0 to 100 based on the combined capabilities.
      2. Suggest what kind of AI models (e.g., MobileNet, Llama-3-8B-Quantized, SDXL-Turbo) might be runnable locally on this machine given these approximated specs.
      3. Write a short technical analysis of the bottleneck (CPU vs GPU vs RAM).
      
      Return ONLY valid JSON with this schema:
      {
        "markdown": "string (markdown formatted detailed analysis)",
        "aiReadinessScore": number (0-100),
        "recommendedModels": string[] (list of model names)
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
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
      // Check for prompt feedback block
      if (response.candidates?.[0]?.finishReason) {
         throw new Error(`AI blocked content: ${response.candidates[0].finishReason}`);
      }
      throw new Error("Empty response from AI");
    }
    
    return JSON.parse(text) as AnalysisResult;

  } catch (error: any) {
    console.error("Gemini Analysis Failed:", error);
    let msg = error.message || "Unknown Error";
    
    // More granular error mapping for common API issues
    if (msg.includes('400')) msg = "Invalid API Request (400). Please check data format or prompt length.";
    else if (msg.includes('401')) msg = "Unauthorized (401). Invalid or expired API Key.";
    else if (msg.includes('403')) msg = "Forbidden (403). API Key does not have permission for this project.";
    else if (msg.includes('404')) msg = "Not Found (404). The requested model was not found.";
    else if (msg.includes('429')) msg = "Rate Limit Exceeded (429). The API is being called too frequently.";
    else if (msg.includes('500')) msg = "Internal Server Error (500). Google's servers encountered an error.";
    else if (msg.includes('503')) msg = "Service Unavailable (503). The service is temporarily overloaded.";
    else if (msg.includes('fetch failed')) msg = "Network Error. Failed to connect to Gemini API.";

    return {
      markdown: `### Analysis Unavailable\n\nAn error occurred while communicating with the analysis engine:\n\n**${msg}**\n\n*Check the console for technical details.*`,
      aiReadinessScore: 0,
      recommendedModels: ["Analysis Unavailable"]
    };
  }
};
