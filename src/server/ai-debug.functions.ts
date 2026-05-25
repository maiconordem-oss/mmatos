import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listAIDebugLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      conversationId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    let q = supabase
      .from("ai_debug_logs")
      .select("id, conversation_id, kind, model, variant, latency_ms, error, response, prompt, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.conversationId) q = q.eq("conversation_id", data.conversationId);
    const { data: logs, error } = await q;
    if (error) throw new Error(error.message);
    return { logs: logs ?? [] };
  });

export const aiMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      days: z.number().int().min(1).max(180).default(30),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const [convsRes, msgsRes, logsRes] = await Promise.all([
      supabase.from("conversations")
        .select("id, created_at, ai_handled, needs_human, sentiment, follow_up_required")
        .eq("user_id", userId).gte("created_at", since),
      supabase.from("messages")
        .select("conversation_id, direction, created_at")
        .eq("user_id", userId).gte("created_at", since)
        .order("created_at", { ascending: true }).limit(5000),
      supabase.from("ai_debug_logs")
        .select("conversation_id, kind, variant, latency_ms, error, created_at")
        .eq("user_id", userId).gte("created_at", since).limit(5000),
    ]);

    const convs = convsRes.data ?? [];
    const msgs = msgsRes.data ?? [];
    const logs = logsRes.data ?? [];
    const aiReplyConversations = new Set(
      (logs as any[])
        .filter((l) => l.kind === "reply" && l.conversation_id)
        .map((l) => l.conversation_id),
    );

    // Tempo até a primeira resposta (outbound) por conversa
    const firstInbound: Record<string, number> = {};
    const firstOutbound: Record<string, number> = {};
    const firstAiReply: Record<string, number> = {};
    for (const m of msgs as any[]) {
      const t = new Date(m.created_at).getTime();
      if (m.direction === "inbound" && firstInbound[m.conversation_id] === undefined) {
        firstInbound[m.conversation_id] = t;
      } else if (m.direction === "outbound" && firstOutbound[m.conversation_id] === undefined) {
        firstOutbound[m.conversation_id] = t;
      }
    }
    for (const l of logs as any[]) {
      if (l.kind !== "reply" || !l.conversation_id || firstAiReply[l.conversation_id] !== undefined) continue;
      firstAiReply[l.conversation_id] = new Date(l.created_at).getTime();
    }
    const responseTimes: number[] = [];
    for (const cid of Object.keys(firstInbound)) {
      const out = firstAiReply[cid] ?? firstOutbound[cid];
      if (aiReplyConversations.has(cid) && out && out > firstInbound[cid]) responseTimes.push(out - firstInbound[cid]);
    }
    responseTimes.sort((a, b) => a - b);
    const avgMs = responseTimes.length ? Math.round(responseTimes.reduce((s, n) => s + n, 0) / responseTimes.length) : 0;
    const medianMs = responseTimes.length ? responseTimes[Math.floor(responseTimes.length / 2)] : 0;

    const totalConvs = convs.length;
    const aiConvs = convs.filter((c: any) => c.ai_handled).length;
    const needsHuman = convs.filter((c: any) => c.needs_human).length;
    const followUps = convs.filter((c: any) => c.follow_up_required).length;

    const sentimentCounts: Record<string, number> = {};
    for (const c of convs as any[]) {
      const s = c.sentiment ?? "neutro";
      sentimentCounts[s] = (sentimentCounts[s] ?? 0) + 1;
    }

    // Métricas IA
    const aiLogs = logs as any[];
    const replies = aiLogs.filter(l => l.kind === "reply");
    const errors = replies.filter(l => l.error);
    const lat = replies.map(l => l.latency_ms).filter((x): x is number => typeof x === "number");
    const avgLatency = lat.length ? Math.round(lat.reduce((s, n) => s + n, 0) / lat.length) : 0;

    const variantA = replies.filter(l => l.variant === "A").length;
    const variantB = replies.filter(l => l.variant === "B").length;

    return {
      totals: {
        conversations: totalConvs,
        ai_handled: aiConvs,
        ai_pct: totalConvs ? Math.round((aiConvs / totalConvs) * 100) : 0,
        needs_human: needsHuman,
        follow_ups: followUps,
      },
      response: {
        avg_ms: avgMs,
        median_ms: medianMs,
        sample: responseTimes.length,
      },
      ai: {
        replies: replies.length,
        errors: errors.length,
        avg_latency_ms: avgLatency,
        variant_a: variantA,
        variant_b: variantB,
      },
      sentiment: sentimentCounts,
    };
  });
