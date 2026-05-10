import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// API pública CNJ Datajud — chave pública documentada
const DATAJUD_API_KEY =
  process.env.DATAJUD_API_KEY ||
  "cDQHYnYL7geSeKHsJpa2A2GBCvOsfRyAwcF6aJoH";

// Mapeamento dos endpoints por tribunal (extraído da numeração CNJ)
// Numeração: NNNNNNN-DD.AAAA.J.TR.OOOO  → J = segmento, TR = tribunal
const TRIBUNAIS_ESPECIAIS: Record<string, string> = {
  // Superiores
  "STF": "stf", "STJ": "stj", "TST": "tst", "TSE": "tse", "STM": "stm",
};

function onlyDigits(s: string) { return (s || "").replace(/\D/g, ""); }

/** Detecta o alias do tribunal (ex: tjsp, trf3, trt2) a partir do nº CNJ. */
export function detectTribunalAlias(numero: string): { alias: string; segmento: string; tr: string } | null {
  const d = onlyDigits(numero);
  if (d.length !== 20) return null;
  // posições: 7 dígitos + 2 dv + 4 ano + 1 J + 2 TR + 4 origem
  const J  = d.substring(13, 14);
  const TR = d.substring(14, 16);

  // Justiça Federal (4) e Trabalho (5) — TR 90 = TRU/TNU; demais TRFs/TRTs por região
  if (J === "1") {
    // Justiça Estadual — TR é o nº do TJ (ex: 26 = TJSP). Mapeamento via tabela CNJ.
    const map: Record<string, string> = {
      "01":"tjac","02":"tjal","03":"tjap","04":"tjam","05":"tjba","06":"tjce","07":"tjdft",
      "08":"tjes","09":"tjgo","10":"tjma","11":"tjmt","12":"tjms","13":"tjmg","14":"tjpa",
      "15":"tjpb","16":"tjpr","17":"tjpe","18":"tjpi","19":"tjrj","20":"tjrn","21":"tjrs",
      "22":"tjro","23":"tjrr","24":"tjsc","25":"tjse","26":"tjsp","27":"tjto",
    };
    const alias = map[TR];
    return alias ? { alias, segmento: "estadual", tr: TR } : null;
  }
  if (J === "4") {
    // Justiça Federal: TR = nº da região (1..6)
    const n = parseInt(TR, 10);
    if (n >= 1 && n <= 6) return { alias: `trf${n}`, segmento: "federal", tr: TR };
  }
  if (J === "5") {
    // Justiça do Trabalho: TR = nº da região (01..24)
    const n = parseInt(TR, 10);
    if (n >= 1 && n <= 24) return { alias: `trt${n}`, segmento: "trabalho", tr: TR };
  }
  if (J === "6") {
    // Justiça Eleitoral: TRE por UF — TR = código da UF acima
    const map: Record<string, string> = {
      "01":"tre-ac","02":"tre-al","03":"tre-ap","04":"tre-am","05":"tre-ba","06":"tre-ce","07":"tre-df",
      "08":"tre-es","09":"tre-go","10":"tre-ma","11":"tre-mt","12":"tre-ms","13":"tre-mg","14":"tre-pa",
      "15":"tre-pb","16":"tre-pr","17":"tre-pe","18":"tre-pi","19":"tre-rj","20":"tre-rn","21":"tre-rs",
      "22":"tre-ro","23":"tre-rr","24":"tre-sc","25":"tre-se","26":"tre-sp","27":"tre-to",
    };
    const alias = map[TR];
    return alias ? { alias, segmento: "eleitoral", tr: TR } : null;
  }
  if (J === "7") return { alias: "stm", segmento: "militar-uniao", tr: TR };
  if (J === "8") {
    // Justiça Militar Estadual (apenas SP, MG, RS)
    const map: Record<string, string> = { "13":"tjmmg", "21":"tjmrs", "26":"tjmsp" };
    const alias = map[TR];
    return alias ? { alias, segmento: "militar-estadual", tr: TR } : null;
  }
  // Tribunais Superiores (J = 0)
  if (J === "0") {
    const map: Record<string, string> = { "01":"stf", "03":"stj", "05":"tst", "06":"tse", "07":"stm" };
    const alias = map[TR];
    return alias ? { alias, segmento: "superior", tr: TR } : null;
  }
  return null;
}

/** Faz a consulta no índice do tribunal pelo número CNJ. */
async function consultarDatajud(numeroCnj: string) {
  const alias = detectTribunalAlias(numeroCnj);
  if (!alias) throw new Error("Número CNJ inválido — não foi possível identificar o tribunal.");

  const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${alias.alias}/_search`;
  const body = {
    query: { match: { numeroProcesso: onlyDigits(numeroCnj) } },
    size: 5,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `APIKey ${DATAJUD_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Datajud ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  const hits = json?.hits?.hits ?? [];
  if (!hits.length) {
    throw new Error(`Processo não encontrado no ${alias.alias.toUpperCase()}.`);
  }
  return { hit: hits[0]._source, alias: alias.alias, todos: hits.map((h: any) => h._source) };
}

function normalizarMovimentacoes(raw: any): Array<{
  codigo: number | null; nome: string | null; dataHora: string | null; complemento: string | null;
}> {
  const movs = raw?.movimentos ?? [];
  return movs.map((m: any) => ({
    codigo: m?.codigo ?? null,
    nome: m?.nome ?? null,
    dataHora: m?.dataHora ?? null,
    complemento: Array.isArray(m?.complementosTabelados)
      ? m.complementosTabelados.map((c: any) => c?.descricao || c?.nome).filter(Boolean).join("; ")
      : null,
  }));
}

// ── 1. Consulta ad-hoc (sem salvar) ────────────────────────────────
export const consultarProcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), numero: z.string().min(15) }).parse)
  .handler(async ({ data }) => {
    const { hit, alias } = await consultarDatajud(data.numero);
    return {
      tribunal: alias.toUpperCase(),
      numero: hit?.numeroProcesso,
      classe: hit?.classe?.nome,
      assunto: (hit?.assuntos?.[0]?.nome) ?? null,
      orgaoJulgador: hit?.orgaoJulgador?.nome ?? null,
      dataAjuizamento: hit?.dataAjuizamento ?? null,
      grau: hit?.grau ?? null,
      nivelSigilo: hit?.nivelSigilo ?? null,
      movimentacoes: normalizarMovimentacoes(hit).sort((a, b) =>
        (b.dataHora || "").localeCompare(a.dataHora || "")
      ),
    };
  });

// ── 2. Cadastrar processo monitorado ──────────────────────────────
export const cadastrarProcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    __token: z.string().optional(),
    numero: z.string().min(15),
    client_id: z.string().uuid().nullable().optional(),
    case_id: z.string().uuid().nullable().optional(),
    notas: z.string().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { hit, alias } = await consultarDatajud(data.numero);

    const numeroLimpo = onlyDigits(data.numero);
    const { data: proc, error } = await supabase
      .from("processos_monitorados")
      .upsert({
        user_id: userId,
        numero_processo: numeroLimpo,
        client_id: data.client_id ?? null,
        case_id: data.case_id ?? null,
        tribunal: alias.toUpperCase(),
        classe: hit?.classe?.nome ?? null,
        assunto: hit?.assuntos?.[0]?.nome ?? null,
        orgao_julgador: hit?.orgaoJulgador?.nome ?? null,
        data_ajuizamento: hit?.dataAjuizamento ?? null,
        grau: hit?.grau ?? null,
        nivel_sigilo: hit?.nivelSigilo ?? null,
        ultima_consulta_em: new Date().toISOString(),
        ativo: true,
        raw: hit,
        notas: data.notas ?? null,
      }, { onConflict: "user_id,numero_processo" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Inserir movimentações
    const movs = normalizarMovimentacoes(hit);
    if (movs.length) {
      const rows = movs.map(m => ({
        user_id: userId,
        processo_id: proc.id,
        codigo: m.codigo,
        nome: m.nome,
        data_movimentacao: m.dataHora,
        complemento: m.complemento,
        is_new: false,
      }));
      await supabase
        .from("processo_movimentacoes")
        .upsert(rows, { onConflict: "processo_id,codigo,data_movimentacao", ignoreDuplicates: true });

      // Atualiza última movimentação
      const ultima = movs.reduce((acc, m) => (m.dataHora && (!acc || m.dataHora > acc) ? m.dataHora : acc), "" as string);
      if (ultima) {
        await supabase
          .from("processos_monitorados")
          .update({ ultima_movimentacao_em: ultima })
          .eq("id", proc.id);
      }
    }
    return { id: proc.id, ok: true };
  });

// ── 3. Atualizar (refetch) um processo ────────────────────────────
export const atualizarProcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: proc, error } = await supabase
      .from("processos_monitorados")
      .select("id, numero_processo")
      .eq("id", data.id).eq("user_id", userId).single();
    if (error || !proc) throw new Error("Processo não encontrado.");

    const { hit, alias } = await consultarDatajud(proc.numero_processo);
    const movs = normalizarMovimentacoes(hit);

    // Quais já existem?
    const { data: existentes } = await supabase
      .from("processo_movimentacoes")
      .select("codigo, data_movimentacao")
      .eq("processo_id", proc.id);
    const setExist = new Set((existentes ?? []).map((m: any) => `${m.codigo}|${m.data_movimentacao}`));
    const novos = movs.filter(m => !setExist.has(`${m.codigo}|${m.dataHora}`));

    if (novos.length) {
      await supabase.from("processo_movimentacoes").insert(novos.map(m => ({
        user_id: userId,
        processo_id: proc.id,
        codigo: m.codigo,
        nome: m.nome,
        data_movimentacao: m.dataHora,
        complemento: m.complemento,
        is_new: true,
      })));
    }

    const ultima = movs.reduce((acc, m) => (m.dataHora && (!acc || m.dataHora > acc) ? m.dataHora : acc), "" as string);
    await supabase.from("processos_monitorados").update({
      ultima_consulta_em: new Date().toISOString(),
      ultima_movimentacao_em: ultima || null,
      tribunal: alias.toUpperCase(),
      raw: hit,
    }).eq("id", proc.id);

    return { novos: novos.length, total: movs.length };
  });

// ── 4. Marcar movimentações como lidas ────────────────────────────
export const marcarMovsLidas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), processo_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await supabase.from("processo_movimentacoes")
      .update({ is_new: false })
      .eq("processo_id", data.processo_id)
      .eq("user_id", userId);
    return { ok: true };
  });

// ── 5. Atualização em lote (cron) ─────────────────────────────────
export const atualizarTodosProcessos = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string() }).parse)
  .handler(async ({ data }) => {
    if (data.token !== (process.env.SUPABASE_SERVICE_ROLE_KEY || "").slice(0, 32)) {
      throw new Error("Unauthorized");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: procs } = await admin
      .from("processos_monitorados")
      .select("id, user_id, numero_processo")
      .eq("ativo", true);

    let totalNovos = 0;
    for (const p of procs ?? []) {
      try {
        const { hit, alias } = await consultarDatajud(p.numero_processo);
        const movs = normalizarMovimentacoes(hit);
        const { data: existentes } = await admin
          .from("processo_movimentacoes")
          .select("codigo, data_movimentacao")
          .eq("processo_id", p.id);
        const setExist = new Set((existentes ?? []).map((m: any) => `${m.codigo}|${m.data_movimentacao}`));
        const novos = movs.filter(m => !setExist.has(`${m.codigo}|${m.dataHora}`));
        if (novos.length) {
          await admin.from("processo_movimentacoes").insert(novos.map(m => ({
            user_id: p.user_id,
            processo_id: p.id,
            codigo: m.codigo,
            nome: m.nome,
            data_movimentacao: m.dataHora,
            complemento: m.complemento,
            is_new: true,
          })));
          totalNovos += novos.length;
        }
        const ultima = movs.reduce((acc, m) => (m.dataHora && (!acc || m.dataHora > acc) ? m.dataHora : acc), "" as string);
        await admin.from("processos_monitorados").update({
          ultima_consulta_em: new Date().toISOString(),
          ultima_movimentacao_em: ultima || null,
          tribunal: alias.toUpperCase(),
          raw: hit,
        }).eq("id", p.id);
      } catch (e) {
        console.error("[datajud] erro ao atualizar", p.numero_processo, e);
      }
    }
    return { processos: procs?.length ?? 0, novosMovimentos: totalNovos };
  });
