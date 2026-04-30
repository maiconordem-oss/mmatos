// Server-only helpers used by whatsapp.functions.ts

export async function evo(url: string, key: string, path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: any) {
  const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: key },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Evolution ${path} [${res.status}]: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

export function publicWebhookUrl(instanceId: string, secret: string) {
  const base = process.env.SITE_URL || process.env.VITE_SITE_URL || "";
  return `${base.replace(/\/$/, "")}/api/public/whatsapp-webhook?id=${instanceId}&secret=${secret}`;
}

export async function getEvoCreds(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_settings")
    .select("evolution_api_url, evolution_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  const url = data?.evolution_api_url;
  const key = data?.evolution_api_key;
  if (!url || !key) {
    throw new Error("Configure a Evolution API em Configurações antes de conectar uma instância.");
  }
  return { url, key };
}
