import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ZAPSIGN_BASE = "https://api.zapsign.com.br/api/v1";

function getZapsignToken() {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) throw new Error("ZAPSIGN_API_TOKEN não configurado. Configure o token nos secrets para enviar contratos.");
  return token;
}

/** Cria documento via template no ZapSign e registra contrato local */
export const sendContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    proposalId: z.string().uuid(),
    templateId: z.string().uuid(),
    signerName: z.string().min(1),
    signerEmail: z.string().email(),
    signerPhone: z.string().optional(),
    variables: z.record(z.string(), z.string()).default({}),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

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
      const token = getZapsignToken();
      const payload = {
        template_id: tpl.zapsign_template_id,
        signer_name: data.signerName,
        signer_email: data.signerEmail,
        signer_phone_number: data.signerPhone ?? "",
        data: Object.entries(data.variables).map(([de, para]) => ({ de, para })),
      };

      const res = await fetch(`${ZAPSIGN_BASE}/models/create-doc/`, {
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
