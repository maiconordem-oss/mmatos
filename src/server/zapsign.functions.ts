import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getUserToken(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_integrations")
    .select("config")
    .eq("user_id", userId)
    .eq("provider", "zapsign")
    .maybeSingle();
  const t = data?.config?.token;
  return typeof t === "string" && t.length > 5 ? t : null;
}

/** Verifica se o token ZapSign está configurado (DB do usuário ou env como fallback) */
export const checkZapsignToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const userToken = await getUserToken(supabase, userId);
    const envToken = process.env.ZAPSIGN_API_TOKEN;
    const token = userToken ?? (envToken && envToken.length > 10 ? envToken : null);
    return {
      configured: !!token,
      source: userToken ? "user" : envToken ? "env" : null,
      masked: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : null,
    };
  });

/** Salva/atualiza o token ZapSign do usuário */
export const saveZapsignToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), token: z.string().min(6) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("user_integrations")
      .upsert({ user_id: userId, provider: "zapsign", config: { token: data.token.trim() } });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove o token ZapSign do usuário */
export const deleteZapsignToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional() }).parse)
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("user_integrations")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "zapsign");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Cria documento via template no ZapSign e registra contrato local */
export const sendContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(),
    proposalId: z.string().uuid(),
    templateId: z.string().uuid(),
    signerName: z.string().min(1),
    signerEmail: z.string().email(),
    signerPhone: z.string().optional(),
    variables: z.record(z.string(), z.string()).default({}),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: tpl } = await supabase
      .from("zapsign_templates").select("*").eq("id", data.templateId).single();
    if (!tpl) throw new Error("Template não encontrado");

    const { data: prop } = await supabase
      .from("proposals").select("*").eq("id", data.proposalId).single();
    if (!prop) throw new Error("Proposta não encontrada");

    let zapsignDocId: string | null = null;
    let signingUrl: string | null = null;
    let signerId: string | null = null;
    let zapsignError: string | null = null;

    try {
      const userToken = await getUserToken(supabase, userId);
      const token = userToken ?? process.env.ZAPSIGN_API_TOKEN;
      if (!token) throw new Error("Token ZapSign não configurado. Salve seu token na tela de Contratos.");
      const payload = {
        template_id: tpl.zapsign_template_id,
        signer_name: data.signerName,
        signer_email: data.signerEmail,
        signer_phone_number: data.signerPhone ?? "",
        data: Object.entries(data.variables).map(([de, para]) => ({ de, para })),
      };

      const res = await fetch(`https://api.zapsign.com.br/api/v1/models/create-doc/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`ZapSign [${res.status}]: ${JSON.stringify(json)}`);

      zapsignDocId = json.open_id?.toString() ?? json.token ?? null;
      signingUrl = json.signers?.[0]?.sign_url ?? null;
      signerId = json.signers?.[0]?.token ?? null;
    } catch (e: any) {
      zapsignError = e.message;
    }

    const { data: contract, error } = await supabase.from("contracts").insert({
      user_id: userId,
      case_id: prop.case_id,
      client_id: prop.client_id,
      proposal_id: prop.id,
      template_id: tpl.id,
      zapsign_document_id: zapsignDocId,
      zapsign_signer_id: signerId,
      signing_url: signingUrl,
      status: zapsignDocId ? "enviado" : "pendente",
      variables: data.variables,
      sent_at: zapsignDocId ? new Date().toISOString() : null,
    }).select().single();

    if (error) throw new Error(error.message);

    if (zapsignDocId) {
      await supabase.from("proposals").update({ status: "enviada", sent_at: new Date().toISOString() }).eq("id", prop.id);
    }

    return { contract, zapsignError };
  });

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as any).supabase
      .from("zapsign_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });
