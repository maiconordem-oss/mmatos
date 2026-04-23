/**
 * Workflow Executor - runs steps for an execution.
 * Called from the WhatsApp webhook (after each inbound message) and from the cron endpoint (for waits).
 * Uses supabaseAdmin since it runs in trusted server contexts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = {
  admin: SupabaseClient<any, any, any>;
  userId: string;
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function interpolate(text: string, vars: Record<string, any>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ""));
}

async function sendWhatsAppText(adminParam: SupabaseClient<any, any, any>, userId: string, conversationId: string, text: string) {
  // Get conversation phone + first instance for the user
  const { data: conv } = await adminParam.from("conversations").select("phone").eq("id", conversationId).single();
  const { data: inst } = await adminParam.from("whatsapp_instances")
    .select("*").eq("user_id", userId).eq("status", "connected").limit(1).maybeSingle();
  if (!conv || !inst?.api_url || !inst?.api_key) {
    // fallback: just save outbound message with status pending
    await adminParam.from("messages").insert({
      user_id: userId, conversation_id: conversationId, direction: "outbound",
      content: text, status: "pending",
    });
    return;
  }

  try {
    await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body: JSON.stringify({ number: conv.phone, text }),
    });
  } catch {/* non-fatal */}

  await adminParam.from("messages").insert({
    user_id: userId, conversation_id: conversationId, direction: "outbound", content: text, status: "sent",
  });
  await adminParam.from("conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: text.slice(0, 80),
    ai_handled: true,
  }).eq("id", conversationId);
}

async function sendWhatsAppMedia(adminParam: SupabaseClient<any, any, any>, userId: string, conversationId: string, kind: "video" | "audio", url: string, caption?: string) {
  const { data: conv } = await adminParam.from("conversations").select("phone").eq("id", conversationId).single();
  const { data: inst } = await adminParam.from("whatsapp_instances")
    .select("*").eq("user_id", userId).eq("status", "connected").limit(1).maybeSingle();

  if (conv && inst?.api_url && inst?.api_key) {
    try {
      await fetch(`${inst.api_url.replace(/\/$/, "")}/message/sendMedia/${inst.instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: inst.api_key },
        body: JSON.stringify({
          number: conv.phone,
          mediatype: kind,
          media: url,
          caption: caption ?? "",
        }),
      });
    } catch {/* non-fatal */}
  }

  await adminParam.from("messages").insert({
    user_id: userId, conversation_id: conversationId, direction: "outbound",
    content: caption ?? `[${kind}] ${url}`, media_url: url, status: "sent",
  });
  await adminParam.from("conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: caption?.slice(0, 80) ?? `[${kind}]`,
    ai_handled: true,
  }).eq("id", conversationId);
}

async function callAI(messages: any[], tools?: any[]) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const body: any = { model: "google/gemini-3-flash-preview", messages };
  if (tools) {
    body.tools = tools;
    body.tool_choice = { type: "function", function: { name: tools[0].function.name } };
  }
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI ${res.status}`);
  return res.json();
}

async function getNextNodes(admin: SupabaseClient<any, any, any>, currentNodeId: string, label?: string | null) {
  const q = admin.from("workflow_edges").select("*").eq("source_node_id", currentNodeId);
  const { data: edges } = await q;
  if (!edges || edges.length === 0) return [];
  if (label) {
    const matched = edges.filter((e) => (e.label ?? "").toLowerCase() === label.toLowerCase());
    if (matched.length) return matched;
  }
  return edges;
}

/**
 * Run as many steps as possible until we hit a wait, a question (need user input), or end.
 */
export async function runExecution(ctx: Ctx, executionId: string) {
  const { admin, userId } = ctx;

  for (let safety = 0; safety < 50; safety++) {
    const { data: exec } = await admin.from("workflow_executions").select("*").eq("id", executionId).single();
    if (!exec || exec.status !== "running" || !exec.current_node_id) return;

    // honor next_run_at
    if (exec.next_run_at && new Date(exec.next_run_at).getTime() > Date.now()) return;

    const { data: node } = await admin.from("workflow_nodes").select("*").eq("id", exec.current_node_id).single();
    if (!node) {
      await admin.from("workflow_executions").update({ status: "failed", last_error: "node missing" }).eq("id", executionId);
      return;
    }

    const cfg = (node.config ?? {}) as any;
    const convId = exec.conversation_id as string;
    let advanceLabel: string | null = null;
    let pause = false;

    try {
      switch (node.type) {
        case "start": break;

        case "message": {
          const ctxVars = (exec.context as any) ?? {};
          await sendWhatsAppText(admin, userId, convId, interpolate(cfg.text ?? "", ctxVars));
          break;
        }

        case "video":
        case "audio": {
          if (cfg.url) await sendWhatsAppMedia(admin, userId, convId, node.type as any, cfg.url, cfg.caption);
          break;
        }

        case "wait": {
          const minutes = Number(cfg.minutes ?? 5);
          const nextRun = new Date(Date.now() + minutes * 60_000).toISOString();
          // Move to next node but schedule it
          const next = await getNextNodes(admin, node.id);
          if (next.length === 0) {
            await admin.from("workflow_executions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", executionId);
          } else {
            await admin.from("workflow_executions").update({ current_node_id: next[0].target_node_id, next_run_at: nextRun }).eq("id", executionId);
          }
          return; // stop loop, wait for cron
        }

        case "question": {
          const ctxVars = (exec.context as any) ?? {};
          await sendWhatsAppText(admin, userId, convId, interpolate(cfg.text ?? "", ctxVars));
          // Move pointer to next node, but pause until user replies
          const next = await getNextNodes(admin, node.id);
          if (next.length === 0) {
            await admin.from("workflow_executions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", executionId);
          } else {
            await admin.from("workflow_executions").update({ current_node_id: next[0].target_node_id, status: "paused" }).eq("id", executionId);
          }
          return;
        }

        case "qualify": {
          const { data: msgs } = await admin.from("messages").select("direction, content")
            .eq("conversation_id", convId).order("created_at").limit(40);
          const transcript = (msgs ?? []).map((m: any) => `${m.direction === "inbound" ? "Lead" : "Atendente"}: ${m.content ?? ""}`).join("\n");
          const r = await callAI(
            [{ role: "system", content: "Extraia dados de qualificação jurídica." }, { role: "user", content: transcript }],
            [{ type: "function", function: {
              name: "extract_lead", description: "Dados do lead",
              parameters: { type: "object", properties: {
                legal_area: { type: "string" }, urgency: { type: "string" },
                description: { type: "string" }, score: { type: "integer" }, qualified: { type: "boolean" },
              }, required: ["legal_area", "urgency", "description", "score", "qualified"] },
            }}],
          );
          const args = JSON.parse(r.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
          const { data: conv } = await admin.from("conversations").select("client_id").eq("id", convId).single();
          await admin.from("lead_qualifications").insert({
            user_id: userId, conversation_id: convId, client_id: conv?.client_id ?? null,
            legal_area: args.legal_area, urgency: args.urgency, description: args.description,
            score: args.score ?? 0, qualified: !!args.qualified, raw_data: args,
          });
          await admin.from("workflow_executions").update({
            context: { ...(exec.context as any ?? {}), ...args },
          }).eq("id", executionId);
          break;
        }

        case "condition": {
          const { data: msgs } = await admin.from("messages").select("content").eq("conversation_id", convId)
            .eq("direction", "inbound").order("created_at", { ascending: false }).limit(1);
          const last = msgs?.[0]?.content?.toLowerCase() ?? "";
          const ctxVars = (exec.context as any) ?? {};
          let matched = false;
          if (cfg.kind === "contains") matched = last.includes((cfg.value ?? "").toLowerCase());
          else if (cfg.kind === "qualified") matched = !!ctxVars.qualified;
          else if (cfg.kind === "score_gte") matched = Number(ctxVars.score ?? 0) >= Number(cfg.value ?? 0);
          advanceLabel = matched ? "sim" : "não";
          break;
        }

        case "handoff": {
          await admin.from("conversations").update({ ai_handled: false, status: "open" }).eq("id", convId);
          await admin.from("workflow_executions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", executionId);
          return;
        }

        case "proposal":
        case "contract": {
          // Stub: mark as informational message for now; deeper integration uses ai-agent.functions.
          await admin.from("messages").insert({
            user_id: userId, conversation_id: convId, direction: "outbound",
            content: node.type === "proposal" ? "[etapa: gerar proposta]" : "[etapa: enviar contrato]",
            status: "pending",
          });
          break;
        }

        case "end": {
          await admin.from("workflow_executions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", executionId);
          return;
        }
      }
    } catch (e: any) {
      await admin.from("workflow_executions").update({ status: "failed", last_error: e.message ?? String(e) }).eq("id", executionId);
      return;
    }

    if (pause) return;

    const next = await getNextNodes(admin, node.id, advanceLabel);
    if (next.length === 0) {
      await admin.from("workflow_executions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", executionId);
      return;
    }
    await admin.from("workflow_executions").update({
      current_node_id: next[0].target_node_id, next_run_at: new Date().toISOString(),
    }).eq("id", executionId);
  }
}

/**
 * Triggered after an inbound WhatsApp message: resume any paused execution for the conversation,
 * or auto-start a workflow if none exists yet (using legal_area detection from a quick AI call).
 */
export async function onInboundMessage(admin: SupabaseClient<any, any, any>, userId: string, conversationId: string, text: string) {
  // Resume paused execution
  const { data: paused } = await admin.from("workflow_executions")
    .select("*").eq("conversation_id", conversationId).eq("status", "paused")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();

  if (paused) {
    await admin.from("workflow_executions").update({ status: "running", next_run_at: new Date().toISOString() }).eq("id", paused.id);
    await runExecution({ admin, userId }, paused.id);
    return;
  }

  // Already has any execution? do nothing more (running or completed)
  const { data: any_exec } = await admin.from("workflow_executions")
    .select("id").eq("conversation_id", conversationId).limit(1).maybeSingle();
  if (any_exec) return;

  // Detect area quickly to pick workflow
  let area: string | null = null;
  try {
    const r = await callAI(
      [{ role: "system", content: "Classifique a área jurídica desta mensagem inicial de um lead em UMA palavra entre: trabalhista, civil, criminal, familia, tributario, empresarial, previdenciario, consumidor, outro." },
       { role: "user", content: text }],
    );
    area = (r.choices?.[0]?.message?.content ?? "").toLowerCase().trim().replace(/[^a-z]/g, "") || null;
  } catch {/* ignore */}

  // Find workflow: by area, then default
  let { data: wf } = await admin.from("workflows").select("id")
    .eq("user_id", userId).eq("is_active", true).eq("legal_area", area ?? "").limit(1).maybeSingle();
  if (!wf) {
    const r = await admin.from("workflows").select("id")
      .eq("user_id", userId).eq("is_active", true).eq("is_default", true).limit(1).maybeSingle();
    wf = r.data ?? null;
  }
  if (!wf) return;

  const { data: startNode } = await admin.from("workflow_nodes")
    .select("id").eq("workflow_id", wf.id).eq("type", "start").limit(1).maybeSingle();
  if (!startNode) return;

  const { data: exec } = await admin.from("workflow_executions").insert({
    user_id: userId, workflow_id: wf.id, conversation_id: conversationId,
    current_node_id: startNode.id, status: "running",
    next_run_at: new Date().toISOString(),
    context: { detected_area: area },
  }).select().single();

  if (exec) await runExecution({ admin, userId }, exec.id);
}
