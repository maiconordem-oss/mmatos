import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("kanban_stages")
      .select("*")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return { stages: data ?? [] };
  });

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || `col_${Date.now()}`;
}

export const createStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    label: z.string().min(1).max(40),
    color: z.string().max(20).default("slate"),
    is_won: z.boolean().optional(),
    is_lost: z.boolean().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("kanban_stages").select("position").eq("user_id", userId)
      .order("position", { ascending: false }).limit(1).maybeSingle();
    const nextPos = (existing?.position ?? -1) + 1;

    let key = slugify(data.label);
    // ensure unique
    const { data: clash } = await supabase.from("kanban_stages")
      .select("id").eq("user_id", userId).eq("key", key).maybeSingle();
    if (clash) key = `${key}_${Date.now().toString(36)}`;

    const { data: row, error } = await supabase.from("kanban_stages").insert({
      user_id: userId,
      key,
      label: data.label,
      color: data.color,
      position: nextPos,
      is_won: data.is_won ?? false,
      is_lost: data.is_lost ?? false,
    }).select().single();
    if (error) throw new Error(error.message);
    return { stage: row };
  });

export const updateStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    label: z.string().min(1).max(40).optional(),
    color: z.string().max(20).optional(),
    is_won: z.boolean().optional(),
    is_lost: z.boolean().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("kanban_stages").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    orderedIds: z.array(z.string().uuid()).min(1).max(50),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await Promise.all(
      data.orderedIds.map((id, idx) =>
        supabase.from("kanban_stages").update({ position: idx }).eq("id", id),
      ),
    );
    return { ok: true };
  });

export const deleteStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    moveCasesToStageKey: z.string().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: stage } = await supabase
      .from("kanban_stages").select("key").eq("id", data.id).single();
    if (!stage) throw new Error("Coluna não encontrada");
    if (data.moveCasesToStageKey) {
      await supabase.from("cases")
        .update({ stage: data.moveCasesToStageKey })
        .eq("user_id", userId).eq("stage", stage.key);
    }
    const { error } = await supabase.from("kanban_stages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(200).optional(),
    client_id: z.string().uuid().nullable().optional(),
    area: z.string().max(40).optional(),
    priority: z.string().max(20).optional(),
    stage: z.string().max(60).optional(),
    value: z.number().nullable().optional(),
    process_number: z.string().max(60).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    next_action_date: z.string().nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("cases").update(patch as any).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
