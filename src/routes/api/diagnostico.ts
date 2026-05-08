import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const Route = createFileRoute("/api/diagnostico")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admin = getAdmin();
        const body  = await request.json();
        const { acao, payload } = body;

        // ── 1. Testar conexão WhatsApp ─────────────────────
        if (acao === "test-whatsapp") {
          const { instanceId, numero } = payload;
          const { data: inst } = await admin.from("whatsapp_instances")
            .select("*").eq("id", instanceId).single();
          if (!inst) return Response.json({ ok: false, erro: "Instância não encontrada" });
          if (!inst.api_url) return Response.json({ ok: false, erro: "api_url não configurada na instância" });

          // Status da instância
          const statusRes = await fetch(
            `${inst.api_url.replace(/\/$/, "")}/instance/connectionState/${inst.instance_name}`,
            { headers: { apikey: inst.api_key } }
          ).catch(e => null);
          const status = statusRes?.ok ? await statusRes.json() : null;

          if (!numero) return Response.json({ ok: true, status, etapas: ["✅ Instância encontrada", `✅ Evolution API respondeu: ${status?.instance?.state || "?"}`, "⏭ Número não informado — envio pulado"] });

          // Enviar mensagem de teste
          const sendRes = await fetch(
            `${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`,
            { method: "POST", headers: { "Content-Type": "application/json", apikey: inst.api_key },
              body: JSON.stringify({ number: numero.replace(/\D/g, ""), text: "✅ Lex CRM — teste de envio funcionando!", options: { delay: 500 } }) }
          ).catch(() => null);
          const sendData = sendRes ? await sendRes.json().catch(() => ({})) : null;
          return Response.json({ ok: sendRes?.ok ?? false, status, sendData,
            etapas: [
              `${status?.instance?.state === "open" ? "✅" : "❌"} Status: ${status?.instance?.state || "desconectado"}`,
              `${sendRes?.ok ? "✅" : "❌"} Envio para ${numero}: ${sendRes?.ok ? "OK" : sendData?.message || "falhou"}`,
            ]
          });
        }

        // ── 2. Criar grupo de teste ────────────────────────
        if (acao === "test-grupo") {
          const { instanceId, numeros, nomeGrupo } = payload;
          const { data: inst } = await admin.from("whatsapp_instances")
            .select("*").eq("id", instanceId).single();
          if (!inst?.api_url) return Response.json({ ok: false, erro: "Instância sem api_url" });

          // Evolution v2: participantes só com número limpo (sem @s.whatsapp.net)
          const participants = (numeros as string[])
            .map(n => n.replace(/\D/g, ""))
            .filter(n => n.length >= 10);

          if (participants.length === 0) return Response.json({ ok: false, erro: "Informe ao menos um número válido (mín. 10 dígitos)" });

          const base = inst.api_url.replace(/\/$/, "");
          const headers = { "Content-Type": "application/json", apikey: inst.api_key };

          // Tentar criar o grupo
          const res = await fetch(`${base}/group/create/${inst.instance_name}`,
            { method: "POST", headers,
              body: JSON.stringify({ subject: nomeGrupo || "Teste — Lex CRM", participants }) }
          ).catch(() => null);
          const data = res ? await res.json().catch(() => ({})) : null;
          const groupId = data?.id || data?.gid || data?.groupId || null;

          const etapas = [
            `${res?.ok ? "✅" : "❌"} Criar grupo (${res?.status}): ${groupId ? `ID ${groupId}` : JSON.stringify(data).slice(0, 120)}`,
            `📋 Participantes enviados: ${participants.join(", ")}`,
          ];

          // Se criou o grupo, verificar participantes
          if (groupId) {
            await new Promise(r => setTimeout(r, 2000));
            const membersRes = await fetch(`${base}/group/findParticipants/${inst.instance_name}?groupJid=${encodeURIComponent(groupId)}`,
              { headers }
            ).catch(() => null);
            const membersData = membersRes ? await membersRes.json().catch(() => null) : null;
            const members = membersData?.participants ?? membersData ?? [];
            etapas.push(`👥 Participantes no grupo: ${Array.isArray(members) ? members.length : "?"} ${Array.isArray(members) ? members.map((m: any) => m.id || m.jid || JSON.stringify(m)).join(", ") : JSON.stringify(members).slice(0, 80)}`);
          }

          // Enviar mensagem de boas-vindas
          if (groupId) {
            await new Promise(r => setTimeout(r, 1500));
            const msgRes = await fetch(
              `${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`,
              { method: "POST", headers: { "Content-Type": "application/json", apikey: inst.api_key },
                body: JSON.stringify({ number: groupId, text: "👋 Olá! Este é um grupo de teste do Lex CRM.", options: { delay: 500 } }) }
            ).catch(() => null);
            etapas.push(`${msgRes?.ok ? "✅" : "❌"} Mensagem de boas-vindas no grupo: ${msgRes?.ok ? "enviada" : "falhou"}`);
          }

          return Response.json({ ok: res?.ok ?? false, groupId, data, etapas });
        }

        // ── 3. Testar ZapSign ──────────────────────────────
        if (acao === "test-zapsign") {
          const { token, templateId } = payload;
          if (!token) return Response.json({ ok: false, erro: "Token ZapSign não informado" });

          // Verificar token
          const authRes = await fetch("https://api.zapsign.com.br/api/v1/templates/", {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => null);

          const etapas: string[] = [`${authRes?.ok ? "✅" : "❌"} Autenticação ZapSign: ${authRes?.status}`];

          if (authRes?.ok) {
            const templates = await authRes.json().catch(() => []);
            const count = Array.isArray(templates) ? templates.length : templates?.results?.length ?? 0;
            etapas.push(`✅ ${count} template(s) encontrado(s)`);

            if (templateId) {
              const tpl = (Array.isArray(templates) ? templates : templates?.results ?? []).find((t: any) => t.token === templateId || t.id === templateId);
              etapas.push(tpl ? `✅ Template "${tpl.name}" encontrado` : `⚠️ Template ID "${templateId}" não encontrado`);
            }
          } else {
            etapas.push("❌ Token inválido ou sem permissão");
          }

          return Response.json({ ok: authRes?.ok ?? false, etapas });
        }

        // ── 4. Testar Google Calendar ──────────────────────
        if (acao === "test-calendar") {
          const { calendarUrl } = payload;
          if (!calendarUrl) return Response.json({ ok: false, erro: "URL do calendário não informada" });
          const res = await fetch(calendarUrl).catch(() => null);
          return Response.json({
            ok: res?.ok ?? false,
            etapas: [`${res?.ok ? "✅" : "❌"} Google Calendar acessível: ${res?.status || "sem resposta"}`]
          });
        }

        // ── 5. Testar banco de dados ───────────────────────
        if (acao === "test-db") {
          const etapas: string[] = [];
          const tabelas = ["conversations", "messages", "funnels", "funnel_states", "whatsapp_instances", "quick_replies", "conversation_tags", "business_hours"];
          for (const tabela of tabelas) {
            const { error, count } = await admin.from(tabela).select("*", { count: "exact", head: true });
            etapas.push(error ? `❌ ${tabela}: ${error.message}` : `✅ ${tabela}: ${count ?? 0} registros`);
          }
          return Response.json({ ok: true, etapas });
        }

        // ── 6. Testar Anthropic (IA) ───────────────────────
        if (acao === "test-ia") {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01",
              "x-api-key": process.env.ANTHROPIC_API_KEY || "" },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 50,
              messages: [{ role: "user", content: "Responda apenas: OK" }]
            })
          }).catch(() => null);
          const data = res ? await res.json().catch(() => ({})) : null;
          const texto = data?.content?.[0]?.text || "";
          return Response.json({
            ok: res?.ok ?? false,
            etapas: [`${res?.ok ? "✅" : "❌"} Anthropic API: ${res?.status} — ${texto || data?.error?.message || "sem resposta"}`]
          });
        }

        return Response.json({ ok: false, erro: "Ação desconhecida: " + acao });
      },
    },
  },
});
