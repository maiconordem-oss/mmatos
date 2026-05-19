import { createFileRoute } from "@tanstack/react-router";
import { createServiceClient, requireUserFromRequest } from "@/server/security.server";

export const Route = createFileRoute("/api/debug-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { userId } = await requireUserFromRequest(request);
        const url    = new URL(request.url);
        const id     = url.searchParams.get("id");
        const action = url.searchParams.get("action") ?? "status";

        if (!id) {
          return Response.json({ error: "Passe ?id=ID_DA_INSTANCIA" }, { status: 400 });
        }

        const admin = createServiceClient();
        const { data: inst } = await admin
          .from("whatsapp_instances").select("*").eq("id", id).eq("user_id", userId).single();

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
              funnel_id:     inst.funnel_id,
            },
            evolution_api: evoStatus ?? { error: evoError },
            webhook_configured: Boolean(inst.webhook_secret),
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
            return Response.json({ ok: res.ok, webhook_configured: res.ok, response: data });
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

        // ── 5. Buscar fotos de todos os contatos ─────────────
        if (action === "fetch-photos") {
          const { data: convs } = await admin
            .from("conversations")
            .select("id, phone, instance_id")
            .is("photo_url", null)
            .not("phone", "like", "SIM_%")
            .limit(50);

          let updated = 0;
          for (const conv of convs ?? []) {
            if (!conv.instance_id) continue;
            const { data: inst } = await admin
              .from("whatsapp_instances")
              .select("api_url, api_key, instance_name")
              .eq("id", conv.instance_id).single();
            if (!inst?.api_url) continue;

            let photoUrl: string | null = null;
            const base = inst.api_url.replace(/\/$/, "");
            const headers = { "Content-Type": "application/json", apikey: inst.api_key ?? "" };

            for (const endpoint of [
              `${base}/chat/fetchProfilePictureUrl/${inst.instance_name}`,
              `${base}/misc/profilePicture/${inst.instance_name}`,
            ]) {
              try {
                const res = await fetch(endpoint, {
                  method: "POST", headers,
                  body: JSON.stringify({ number: conv.phone }),
                });
                if (res.ok) {
                  const data = await res.json();
                  photoUrl = data?.profilePictureUrl ?? data?.picture ?? data?.url ?? null;
                  if (photoUrl) break;
                }
              } catch {}
            }

            if (photoUrl) {
              await admin.from("conversations").update({ photo_url: photoUrl }).eq("id", conv.id);
              updated++;
            }
          }
          return Response.json({ ok: true, updated, total: convs?.length ?? 0 });
        }

        return Response.json({ actions: ["status", "set-webhook", "get-webhook", "send-test", "fetch-photos"] });
      },

      // Aceitar qualquer POST (para testar se o webhook chega)
      POST: async ({ request }) => {
        await requireUserFromRequest(request);
        const body = await request.json().catch(() => ({}));
        return Response.json({ received: true, event: body?.event || body?.type || null });
      },
    },
  },
});
