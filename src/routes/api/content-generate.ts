import { createFileRoute } from "@tanstack/react-router";

type ContentRequest = {
  area?: string;
  pilar?: string;
  tema?: string;
  formato?: string;
  duracao?: string;
  tom?: string;
};

function extractJson(text: string) {
  const clean = text.replace(/```json|```/g, "").trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first >= 0 && last > first) return clean.slice(first, last + 1);
  return clean;
}

export const Route = createFileRoute("/api/content-generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = (await request.json()) as ContentRequest;
          const area = payload.area || "Previdenciário / INSS";
          const pilar = payload.pilar || "Direito desconhecido";
          const tema = payload.tema?.trim();
          const formato = payload.formato || "Reel";
          const duracao = payload.duracao || "30-60s";
          const tom = payload.tom || "humano, direto, acessível e sem juridiquês";

          if (!tema) {
            return Response.json({ error: "Informe o tema do conteúdo." }, { status: 400 });
          }

          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            return Response.json({ error: "ANTHROPIC_API_KEY não configurada no servidor." }, { status: 500 });
          }

          const prompt = `Você é estrategista de conteúdo para advogado brasileiro.

Crie um conteúdo para Instagram com estes dados:
- Área: ${area}
- Pilar: ${pilar}
- Formato: ${formato}
- Tema: ${tema}
- Duração alvo: ${duracao}
- Tom: ${tom}

Regras:
- Linguagem simples, sem juridiquês.
- Não prometa resultado.
- Não use emojis.
- Faça conteúdo útil, com gancho forte e CTA de comentário, salvamento ou compartilhamento.
- Se citar direito, fale em termos práticos e cuidadosos.

Retorne APENAS JSON válido, sem markdown, neste formato:
{
  "titulo": "string",
  "hook": "string",
  "roteiro": [
    { "tempo": "0-3s", "fala": "string", "textoTela": "string", "direcao": "string" }
  ],
  "legenda": "string com mais de 300 caracteres",
  "hashtags": ["string"],
  "hooksAlternativos": ["string"],
  "carrossel": [
    { "slide": 1, "titulo": "string", "texto": "string" }
  ],
  "checklist": ["string"],
  "observacaoJuridica": "string"
}`;

          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "anthropic-version": "2023-06-01",
              "x-api-key": apiKey,
            },
            body: JSON.stringify({
              model: process.env.ANTHROPIC_CONTENT_MODEL || "claude-sonnet-4-20250514",
              max_tokens: 2200,
              temperature: 0.7,
              messages: [{ role: "user", content: prompt }],
            }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return Response.json({ error: data?.error?.message || `Claude API ${res.status}` }, { status: res.status });
          }

          const text = data?.content?.find((part: any) => part.type === "text")?.text || "";
          try {
            return Response.json({ content: JSON.parse(extractJson(text)), raw: text });
          } catch {
            return Response.json({ content: null, raw: text });
          }
        } catch (e: any) {
          return Response.json({ error: e.message || "Erro ao gerar conteúdo." }, { status: 500 });
        }
      },
    },
  },
});
