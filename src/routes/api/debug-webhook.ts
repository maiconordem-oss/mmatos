import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/debug-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url    = new URL(request.url);
        const id     = url.searchParams.get("id");
        const action = url.searchParams.get("action") ?? "status";

        if (!id) {
          return Response.json({ error: "Passe ?id=ID_DA_INSTANCIA" }, { status: 400 });
        }

        const { data: inst } = await supabaseAdmin
          .from("whatsapp_instances").select("*").eq("id", id).single();

        if (!inst) return Response.json({ error: "Instância não encontrada" }, { status: 404 });

        // ── 1. Verificar status atual ──────────────────────────
        if (action === "status") {
          let evoStatus: any = null;
          let evoError: string | null = null;

          try {
            const res = await fetch(
              `${inst.api_url?.replace(/\/$/, "")}/instance/connectionState/${inst.instance_name}`,
              { headers: { apikey: inst.api_key ?? "" } }
            );
            evoStatus = await res.json();
          } catch (e: any) {
            evoError = e.message;
          }

          return Response.json({
            db: {
              id:            inst.id,
              name:          inst.instance_name,
              status:        inst.status,
              phone:         inst.phone_number,
              api_url:       inst.api_url,
              funnel_id:     inst.funnel_id,
              webhook_secret: inst.webhook_secret,
            },
            evolution_api: evoStatus ?? { error: evoError },
            webhook_url: `${new URL(request.url).origin}/api/public/whatsapp-webhook?id=${inst.id}&secret=${inst.webhook_secret}`,
          });
        }

        // ── 2. Configurar webhook automaticamente ──────────────
        if (action === "set-webhook") {
          const webhookUrl = `${new URL(request.url).origin}/api/public/whatsapp-webhook?id=${inst.id}&secret=${inst.webhook_secret}`;

          try {
            const res = await fetch(
              `${inst.api_url?.replace(/\/$/, "")}/webhook/set/${inst.instance_name}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: inst.api_key ?? "" },
                body: JSON.stringify({
                  webhook: {
                    enabled: true,
                    url: webhookUrl,
                    webhookByEvents: false,
                    webhookBase64: false,
                    events: [
                      "MESSAGES_UPSERT",
                      "MESSAGES_UPDATE",
                      "CONNECTION_UPDATE",
                      "QRCODE_UPDATED",
                    ],
                  },
                }),
              }
            );
            const data = await res.json();
            return Response.json({ ok: res.ok, webhook_url: webhookUrl, response: data });
          } catch (e: any) {
            return Response.json({ error: e.message }, { status: 500 });
          }
        }

        // ── 3. Verificar webhook atual na Evolution ────────────
        if (action === "get-webhook") {
          try {
            const res = await fetch(
              `${inst.api_url?.replace(/\/$/, "")}/webhook/find/${inst.instance_name}`,
              { headers: { apikey: inst.api_key ?? "" } }
            );
            const data = await res.json();
            return Response.json({ evolution_webhook: data });
          } catch (e: any) {
            return Response.json({ error: e.message }, { status: 500 });
          }
        }

        // ── 4. Enviar mensagem de teste ───────────────────────
        if (action === "send-test") {
          const to = url.searchParams.get("to");
          if (!to) return Response.json({ error: "Passe &to=NUMERO" });
          try {
            const res = await fetch(
              `${inst.api_url?.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: inst.api_key ?? "" },
                body: JSON.stringify({
                  number: to.replace(/\D/g, ""),
                  text: "✅ Lex CRM — teste de conexão funcionando!",
                  options: { delay: 500 },
                }),
              }
            );
            const data = await res.json();
            return Response.json({ ok: res.ok, status: res.status, response: data });
          } catch (e: any) {
            return Response.json({ error: e.message }, { status: 500 });
          }
        }

        return Response.json({ actions: ["status", "set-webhook", "get-webhook", "send-test"] });
      },

      // Aceitar qualquer POST (para testar se o webhook chega)
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        console.log("DEBUG WEBHOOK RECEIVED:", JSON.stringify(body, null, 2));
        return Response.json({ received: true, body });
      },
    },
  },
});
