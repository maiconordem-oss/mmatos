/**
 * Google AI (Gemini) gateway provider helper (AI SDK).
 *
 * Usado por todas as novas chamadas de IA do app (texto, JSON estruturado, tools).
 * Servidor-only: lê GOOGLE_AI_KEY do ambiente do worker.
 *
 * Uso típico:
 *   import { getGeminiModel } from "@/lib/ai-gateway.server";
 *   const model = getGeminiModel();
 *   const { text } = await generateText({ model, prompt: "..." });
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

/** @deprecated use DEFAULT_GEMINI_MODEL */
export const DEFAULT_LOVABLE_MODEL = DEFAULT_GEMINI_MODEL;

export function createGeminiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "google-ai",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

/** @deprecated use createGeminiProvider */
export const createLovableAiGatewayProvider = createGeminiProvider;

/**
 * Atalho: devolve o LanguageModel pronto para uso, lendo a chave do env.
 * Lança erro descritivo se a chave não estiver configurada.
 */
export function getGeminiModel(modelId: string = DEFAULT_GEMINI_MODEL) {
  const key = process.env.GOOGLE_AI_KEY;
  if (!key) throw new Error("GOOGLE_AI_KEY não configurada no ambiente do servidor");
  return createGeminiProvider(key)(modelId);
}

/** @deprecated use getGeminiModel */
export const getLovableAiModel = getGeminiModel;

/**
 * Mapeia erros da API para mensagens úteis para o usuário final.
 */
export function describeAiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b429\b/.test(msg)) return "Limite de requisições da IA excedido. Aguarde alguns segundos.";
  if (/\b402\b/.test(msg)) return "Cota de IA esgotada. Verifique sua chave no Google AI Studio.";
  return msg.replace(/^Error:\s*/, "");
}
