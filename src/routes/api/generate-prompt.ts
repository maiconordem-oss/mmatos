import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate-prompt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { systemPrompt, userMsg } = body;

          if (!systemPrompt || !userMsg) {
            return Response.json({ error: "Missing prompts" }, { status: 400 });
          }

          const apiKey = process.env.LOVABLE_API_KEY ?? "lovable-internal";

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user",   content: userMsg },
              ],
              max_tokens: 4000,
            }),
          });

          if (!res.ok) {
            const err = await res.text();
            return Response.json({ error: err }, { status: res.status });
          }

          const data = await res.json();
          const prompt = data.choices?.[0]?.message?.content ?? "";
          return Response.json({ prompt });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500 });
        }
      },
    },
  },
});
