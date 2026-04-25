import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const NodeTypeEnum = z.enum([
  "start", "message", "video", "audio", "wait",
  "question", "condition", "qualify", "proposal", "contract", "handoff", "end",
]);

/* ---------- Workflows CRUD ---------- */

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("workflows")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { workflows: data ?? [] };
  });

export const createWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    legal_area: z.string().max(40).optional(),
    is_default: z.boolean().optional(),
    persona_prompt: z.string().max(4000).optional(),
    proposal_value: z.number().nullable().optional(),
    proposal_is_free: z.boolean().optional(),
    video_url: z.string().max(500).nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: wf, error } = await supabase
      .from("workflows")
      .insert({
        user_id: userId,
        name: data.name,
        description: data.description ?? null,
        legal_area: data.legal_area ?? null,
        is_default: data.is_default ?? false,
        persona_prompt: data.persona_prompt ?? "Você é o Dr. Maicon Matos, advogado inscrito na OAB/RS 136.221. Atenda o cliente com cordialidade, segurança jurídica e clareza. Fale sempre em primeira pessoa, como se fosse o próprio advogado.",
        proposal_value: data.proposal_value ?? null,
        proposal_is_free: data.proposal_is_free ?? false,
        video_url: data.video_url ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Auto-create a Start node
    await supabase.from("workflow_nodes").insert({
      user_id: userId,
      workflow_id: wf.id,
      type: "start",
      label: "Início",
      position_x: 100,
      position_y: 100,
      config: {},
    });

    return { workflow: wf };
  });

export const updateWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    legal_area: z.string().max(40).nullable().optional(),
    is_active: z.boolean().optional(),
    is_default: z.boolean().optional(),
    persona_prompt: z.string().max(4000).nullable().optional(),
    proposal_value: z.number().nullable().optional(),
    proposal_is_free: z.boolean().optional(),
    video_url: z.string().max(500).nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { error } = await supabase.from("workflows").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workflows").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Canvas: load + save graph ---------- */

export const getWorkflowGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: wf }, { data: nodes }, { data: edges }] = await Promise.all([
      supabase.from("workflows").select("*").eq("id", data.id).single(),
      supabase.from("workflow_nodes").select("*").eq("workflow_id", data.id),
      supabase.from("workflow_edges").select("*").eq("workflow_id", data.id),
    ]);
    return { workflow: wf, nodes: nodes ?? [], edges: edges ?? [] };
  });

const NodeSchema = z.object({
  id: z.string(),
  type: NodeTypeEnum,
  label: z.string().nullable().optional(),
  position_x: z.number(),
  position_y: z.number(),
  config: z.record(z.string(), z.any()).default({}),
});

const EdgeSchema = z.object({
  id: z.string(),
  source_node_id: z.string(),
  target_node_id: z.string(),
  label: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
});

export const saveWorkflowGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    workflow_id: z.string().uuid(),
    nodes: z.array(NodeSchema).max(200),
    edges: z.array(EdgeSchema).max(400),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Replace strategy: delete edges first (FK), then nodes, then re-insert.
    await supabase.from("workflow_edges").delete().eq("workflow_id", data.workflow_id);
    await supabase.from("workflow_nodes").delete().eq("workflow_id", data.workflow_id);

    if (data.nodes.length) {
      const { error: nErr } = await supabase.from("workflow_nodes").insert(
        data.nodes.map((n) => ({
          id: n.id,
          user_id: userId,
          workflow_id: data.workflow_id,
          type: n.type,
          label: n.label ?? null,
          position_x: n.position_x,
          position_y: n.position_y,
          config: n.config ?? {},
        })),
      );
      if (nErr) throw new Error(nErr.message);
    }

    if (data.edges.length) {
      const { error: eErr } = await supabase.from("workflow_edges").insert(
        data.edges.map((e) => ({
          id: e.id,
          user_id: userId,
          workflow_id: data.workflow_id,
          source_node_id: e.source_node_id,
          target_node_id: e.target_node_id,
          label: e.label ?? null,
          condition: e.condition ?? null,
        })),
      );
      if (eErr) throw new Error(eErr.message);
    }

    await supabase.from("workflows").update({ updated_at: new Date().toISOString() }).eq("id", data.workflow_id);
    return { ok: true };
  });

/* ---------- Executions ---------- */

export const startWorkflowForConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversation_id: z.string().uuid(),
    workflow_id: z.string().uuid().optional(),
    legal_area: z.string().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let workflowId = data.workflow_id;
    if (!workflowId) {
      // pick by area, fallback to default
      const { data: byArea } = await supabase
        .from("workflows").select("id")
        .eq("user_id", userId).eq("is_active", true)
        .eq("legal_area", data.legal_area ?? "")
        .limit(1).maybeSingle();
      if (byArea) workflowId = byArea.id;
      if (!workflowId) {
        const { data: def } = await supabase
          .from("workflows").select("id")
          .eq("user_id", userId).eq("is_active", true).eq("is_default", true)
          .limit(1).maybeSingle();
        workflowId = def?.id;
      }
    }
    if (!workflowId) throw new Error("Nenhum workflow ativo encontrado");

    const { data: startNode } = await supabase
      .from("workflow_nodes").select("id")
      .eq("workflow_id", workflowId).eq("type", "start").limit(1).maybeSingle();

    const { data: exec, error } = await supabase.from("workflow_executions").insert({
      user_id: userId,
      workflow_id: workflowId,
      conversation_id: data.conversation_id,
      current_node_id: startNode?.id ?? null,
      status: "running",
      next_run_at: new Date().toISOString(),
    }).select().single();

    if (error) throw new Error(error.message);
    return { execution: exec };
  });

export const listExecutions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workflow_id: z.string().uuid().optional() }).parse)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("workflow_executions")
      .select("*, workflows(name, legal_area), conversations(contact_name, phone)")
      .order("started_at", { ascending: false })
      .limit(50);
    if (data.workflow_id) q = q.eq("workflow_id", data.workflow_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { executions: rows ?? [] };
  });

export const duplicateWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src } = await supabase.from("workflows").select("*").eq("id", data.id).single();
    if (!src) throw new Error("Workflow não encontrado");

    const { data: newWf, error } = await supabase.from("workflows").insert({
      user_id: userId,
      name: `${src.name} (cópia)`,
      description: src.description,
      legal_area: src.legal_area,
      is_active: false,
      is_default: false,
    }).select().single();
    if (error) throw new Error(error.message);

    const { data: nodes } = await supabase.from("workflow_nodes").select("*").eq("workflow_id", data.id);
    const { data: edges } = await supabase.from("workflow_edges").select("*").eq("workflow_id", data.id);

    const idMap = new Map<string, string>();
    if (nodes?.length) {
      const newNodes = nodes.map((n: any) => {
        const newId = crypto.randomUUID();
        idMap.set(n.id, newId);
        return {
          id: newId, user_id: userId, workflow_id: newWf.id,
          type: n.type, label: n.label,
          position_x: n.position_x, position_y: n.position_y, config: n.config,
        };
      });
      await supabase.from("workflow_nodes").insert(newNodes);
    }
    if (edges?.length) {
      const newEdges = edges
        .filter((e: any) => idMap.has(e.source_node_id) && idMap.has(e.target_node_id))
        .map((e: any) => ({
          id: crypto.randomUUID(), user_id: userId, workflow_id: newWf.id,
          source_node_id: idMap.get(e.source_node_id)!,
          target_node_id: idMap.get(e.target_node_id)!,
          label: e.label, condition: e.condition,
        }));
      if (newEdges.length) await supabase.from("workflow_edges").insert(newEdges);
    }

    return { workflow: newWf };
  });

export const simulateWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    leadName: z.string().default("João Lead"),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: nodes }, { data: edges }] = await Promise.all([
      supabase.from("workflow_nodes").select("*").eq("workflow_id", data.id),
      supabase.from("workflow_edges").select("*").eq("workflow_id", data.id),
    ]);
    if (!nodes?.length) return { steps: [] };

    const start = nodes.find((n: any) => n.type === "start") ?? nodes[0];
    const byId = new Map(nodes.map((n: any) => [n.id, n]));
    const outgoing = (id: string) => (edges ?? []).filter((e: any) => e.source_node_id === id);

    const steps: Array<{ kind: string; label: string; preview: string }> = [];
    const visited = new Set<string>();
    let current: any = start;
    let safety = 0;
    while (current && !visited.has(current.id) && safety++ < 50) {
      visited.add(current.id);
      const cfg = current.config ?? {};
      let preview = "";
      switch (current.type) {
        case "message":
        case "question": preview = (cfg.text ?? "").replace(/\{\{nome\}\}/gi, data.leadName); break;
        case "video": case "audio": preview = `🎬 ${cfg.url ?? ""}`; break;
        case "wait": preview = `⏱ Aguarda ${cfg.minutes ?? 5} minutos`; break;
        case "qualify": preview = "🤖 IA extrai área, urgência, score do lead"; break;
        case "proposal": preview = "📄 IA gera proposta de honorários"; break;
        case "contract": preview = `✍️ Envia contrato (${cfg.template_name ?? "template"}) via ZapSign`; break;
        case "condition": preview = `🔀 Verifica: ${cfg.kind ?? ""} ${cfg.value ?? ""}`; break;
        case "handoff": preview = "👤 Transfere para advogado humano"; break;
        case "start": preview = "▶️ Início"; break;
        case "end": preview = "🏁 Fim"; break;
      }
      steps.push({ kind: current.type, label: current.label ?? current.type, preview });
      const out = outgoing(current.id);
      const next = out[0];
      current = next ? byId.get(next.target_node_id) : null;
    }
    return { steps };
  });
