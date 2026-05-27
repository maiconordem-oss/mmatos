import { createFileRoute } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, FileDown, Instagram, Loader2, MessageCircle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/captura/$slug")({
  head: () => ({ meta: [{ title: "Receber material no WhatsApp" }] }),
  component: LeadCapturePage,
});

type Magnet = {
  id: string;
  title: string;
  slug: string;
  keyword: string | null;
  description: string | null;
  button_label: string;
  success_message: string;
};

function LeadCapturePage() {
  const { slug } = Route.useParams();
  const [magnet, setMagnet] = useState<Magnet | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const ref = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("ref") ?? "";
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/public/instagram-lead?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Pagina indisponivel");
        if (active) setMagnet(data.magnet);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/instagram-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, phone, ref }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao enviar");
      setMessage(data?.message ?? magnet?.success_message ?? "Material enviado.");
    } catch (e: any) {
      setError(e?.message ?? "Nao foi possivel enviar agora.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 py-8 md:grid-cols-[1fr_420px] md:px-8">
        <div className="space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 shadow-sm">
            <Instagram className="h-3.5 w-3.5" />
            Conteudo enviado automaticamente
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-950 md:text-6xl">
              {loading ? "Preparando seu material" : magnet?.title ?? "Material indisponivel"}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
              {magnet?.description || "Informe seu WhatsApp para receber o arquivo agora, direto na conversa."}
            </p>
          </div>

          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              ["Comentario", magnet?.keyword ? `Palavra: ${magnet.keyword}` : "Instagram"],
              ["Captura", "WhatsApp validado"],
              ["Entrega", "Arquivo automatico"],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <FileDown className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Receber arquivo</h2>
              <p className="text-sm text-slate-500">Entrega imediata no WhatsApp</p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando
            </div>
          ) : message ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <CheckCircle2 className="mb-3 h-8 w-8" />
              <p className="font-semibold">Enviado</p>
              <p className="mt-1 text-sm leading-6">{message}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Nome</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={120} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">WhatsApp</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" required />
              </div>
              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}
              <Button type="submit" disabled={submitting || !magnet} className="h-11 w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                {submitting ? "Enviando..." : magnet?.button_label ?? "Receber no WhatsApp"}
              </Button>
            </form>
          )}

          <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Seu numero sera usado apenas para enviar este material e continuar o atendimento solicitado.
          </div>
        </div>
      </section>
    </main>
  );
}
