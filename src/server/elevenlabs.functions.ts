import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getUserToken(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_integrations")
    .select("config")
    .eq("user_id", userId)
    .eq("provider", "elevenlabs")
    .maybeSingle();
  const t = data?.config?.token;
  return typeof t === "string" && t.length > 5 ? t : null;
}

async function resolveToken(supabase: any, userId: string): Promise<string | null> {
  const userToken = await getUserToken(supabase, userId);
  const env = process.env.ELEVENLABS_API_KEY;
  return userToken ?? (env && env.length > 10 ? env : null);
}

export const checkElevenlabsToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const userToken = await getUserToken(supabase, userId);
    const env = process.env.ELEVENLABS_API_KEY;
    const token = userToken ?? (env && env.length > 10 ? env : null);
    return {
      configured: !!token,
      source: userToken ? "user" : env ? "env" : null,
      masked: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : null,
    };
  });

export const saveElevenlabsToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), token: z.string().min(6) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("user_integrations")
      .upsert({ user_id: userId, provider: "elevenlabs", config: { token: data.token.trim() } });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteElevenlabsToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional() }).parse)
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("user_integrations")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "elevenlabs");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Transcreve uma mensagem de áudio (messageId) usando ElevenLabs Scribe v2 */
export const transcribeAudioMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ __token: z.string().optional(), messageId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const token = await resolveToken(supabase, userId);
    if (!token) throw new Error("Token ElevenLabs não configurado. Salve em Configurações > Integrações.");

    const { data: msg, error: e1 } = await supabase
      .from("messages")
      .select("id, media_url, media_mime, transcript")
      .eq("id", data.messageId)
      .single();
    if (e1 || !msg?.media_url) throw new Error("Mensagem de áudio não encontrada.");

    if (msg.transcript && msg.transcript.length > 0) {
      return { transcript: msg.transcript, cached: true };
    }

    // Baixa o áudio
    const audioRes = await fetch(msg.media_url);
    if (!audioRes.ok) throw new Error(`Falha ao baixar áudio (${audioRes.status})`);
    const audioBuf = await audioRes.arrayBuffer();
    const mime = msg.media_mime || audioRes.headers.get("content-type") || "audio/ogg";
    const blob = new Blob([audioBuf], { type: mime });

    const fd = new FormData();
    fd.append("file", blob, `audio.${mime.includes("mp3") ? "mp3" : mime.includes("mp4") ? "mp4" : "ogg"}`);
    fd.append("model_id", "scribe_v2");
    fd.append("tag_audio_events", "false");
    fd.append("diarize", "false");

    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": token },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ElevenLabs [${res.status}]: ${err}`);
    }
    const json: any = await res.json();
    const transcript = (json?.text ?? "").trim();

    // Persiste
    await supabase.from("messages").update({ transcript }).eq("id", data.messageId);

    return { transcript, cached: false };
  });

/** Gera áudio TTS a partir de texto. Retorna base64 (mp3). */
export const generateTTS = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      __token: z.string().optional(),
      text: z.string().min(1).max(2000),
      voiceId: z.string().default("FGY2WhTYpPnrIDTdsKH5"), // Laura
    }).parse
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const token = await resolveToken(supabase, userId);
    if (!token) throw new Error("Token ElevenLabs não configurado. Salve em Configurações > Integrações.");

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${data.voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": token, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ElevenLabs TTS [${res.status}]: ${err}`);
    }
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { audioBase64: base64, mime: "audio/mpeg" };
  });
