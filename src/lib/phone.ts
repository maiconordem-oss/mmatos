// Normalização de telefones brasileiros.
// Aceita qualquer formato (com/sem +55, com/sem DDD, com/sem 9 inicial)
// e gera variantes para localizar conversas duplicadas.

export function onlyDigits(input: string | null | undefined): string {
  return (input || "").replace(/\D/g, "");
}

/**
 * Retorna a forma canônica do telefone brasileiro:
 * 55 + DDD (2) + 9 (se celular) + 8 dígitos = 13 dígitos.
 * Se não conseguir identificar, retorna apenas os dígitos.
 */
export function normalizeBRPhone(input: string | null | undefined): string {
  let d = onlyDigits(input);
  if (!d) return "";

  // Remove "55" do início se houver e sobrar tamanho válido
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }

  // Agora deve ter 10 (fixo: DDD+8) ou 11 (celular: DDD+9+8) dígitos
  if (d.length === 10 || d.length === 11) {
    const ddd = d.slice(0, 2);
    let rest = d.slice(2);
    // Adiciona o 9 se for celular sem o nono dígito (DDDs >= 11)
    // Heurística: se rest tem 8 dígitos e começa com 6,7,8,9 → celular
    if (rest.length === 8 && /^[6789]/.test(rest)) {
      rest = "9" + rest;
    }
    return "55" + ddd + rest;
  }

  // Já está em forma internacional/desconhecida
  return d;
}

/**
 * Gera todas as variantes possíveis de um número (para buscar duplicatas).
 * Inclui: canônico, sem 55, com/sem 9 inicial.
 */
export function phoneVariants(input: string | null | undefined): string[] {
  const canonical = normalizeBRPhone(input);
  const set = new Set<string>();
  if (!canonical) return [];
  set.add(canonical);
  set.add(onlyDigits(input));

  // Tenta extrair DDD+resto a partir do canônico (55 + DDD + ...)
  if (canonical.startsWith("55") && canonical.length >= 12) {
    const ddd = canonical.slice(2, 4);
    const rest = canonical.slice(4);
    const noNine = rest.startsWith("9") ? rest.slice(1) : rest;
    const withNine = rest.startsWith("9") ? rest : "9" + rest;

    // Com 55
    set.add("55" + ddd + rest);
    set.add("55" + ddd + noNine);
    set.add("55" + ddd + withNine);
    // Sem 55
    set.add(ddd + rest);
    set.add(ddd + noNine);
    set.add(ddd + withNine);
    // Apenas o número (sem DDD)
    set.add(rest);
    set.add(noNine);
    set.add(withNine);
  }

  return Array.from(set).filter(Boolean);
}

/**
 * Formata para exibição: +55 (DDD) 9XXXX-XXXX
 */
export function formatBRPhone(input: string | null | undefined): string {
  const c = normalizeBRPhone(input);
  if (!c) return "";
  if (c.startsWith("55") && (c.length === 12 || c.length === 13)) {
    const ddd = c.slice(2, 4);
    const rest = c.slice(4);
    if (rest.length === 9) {
      return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return "+" + c;
}
