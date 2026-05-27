/**
 * Lovable AI Gateway provider helper (AI SDK).
 *
 * Usado por todas as novas chamadas de IA do app (texto, JSON estruturado, tools).
 * Servidor-only: lê LOVABLE_API_KEY do ambiente do worker.
 *
 * Uso típico:
 *   import { getLovableAiModel } from "@/lib/ai-gateway.server";
 *   const model = getLovableAiModel();
 *   const { text } = await generateText({ model, prompt: "..." });
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const DEFAULT_LOVABLE_MODEL = "google/gemini-3-flash-preview";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

/**
 * Atalho: devolve o LanguageModel pronto para uso, lendo a chave do env.
 * Lança erro descritivo se a chave não estiver configurada.
 */
export function getLovableAiModel(modelId: string = DEFAULT_LOVABLE_MODEL) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY não configurada no ambiente do servidor");
  return createLovableAiGatewayProvider(key)(modelId);
}

/**
 * Mapeia erros do gateway para mensagens úteis para o usuário final.
 * Use em volta de generateText/streamText para padronizar a UX de erro.
 */
export function describeAiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b429\b/.test(msg)) return "Limite de requisições da IA excedido. Aguarde alguns segundos.";
  if (/\b402\b/.test(msg)) return "Créditos de IA esgotados. Adicione créditos em Workspace → Usage.";
  return msg.replace(/^Error:\s*/, "");
}
