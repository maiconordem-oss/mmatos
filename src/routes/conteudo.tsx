import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  CalendarDays, Check, Clipboard, Copy, FileText, Layers, Loader2,
  MessageSquare, Sparkles, Wand2, Zap,
} from "lucide-react";

export const Route = createFileRoute("/conteudo")({
  head: () => ({ meta: [{ title: "Geração de Conteúdo — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <ConteudoPage />
      </AppShell>
    </AuthGate>
  ),
});

const AREAS = ["Previdenciário / INSS", "Imobiliário", "Consumidor", "BPC/LOAS", "Revisão de benefício"];
const PILARES = ["Direito desconhecido", "Erro comum", "Bastidores / Humano", "Notícia / Lei nova", "Passo a passo"];
const FORMATOS = ["Reel", "Carrossel", "Story", "Post estático"];
const DURACOES = ["7-30s", "30-60s", "60-90s"];

const HOOKS: Record<string, Array<{ pilar: string; text: string }>> = {
  "Previdenciário / INSS": [
    { pilar: "Direito desconhecido", text: "Você trabalhou anos e pode estar perdendo um benefício que nunca te explicaram." },
    { pilar: "Erro comum", text: "Benefício negado pelo INSS não é o fim. Muitas vezes é o começo do recurso." },
    { pilar: "Passo a passo", text: "Antes de pedir aposentadoria, confira estes três pontos." },
  ],
  "BPC/LOAS": [
    { pilar: "Direito desconhecido", text: "BPC não é aposentadoria, mas pode garantir um salário mínimo para quem precisa." },
    { pilar: "Erro comum", text: "O erro que faz muita família perder o BPC está nos documentos, não na doença." },
    { pilar: "Passo a passo", text: "Se o BPC foi negado, organize estes documentos antes de desistir." },
  ],
  Consumidor: [
    { pilar: "Direito desconhecido", text: "Cobrança indevida pode gerar devolução em dobro, mas muita gente deixa passar." },
    { pilar: "Erro comum", text: "Assinar esse termo na loja pode fazer você abrir mão de um direito importante." },
  ],
  Imobiliário: [
    { pilar: "Direito desconhecido", text: "A construtora atrasou a entrega? Isso pode gerar indenização." },
    { pilar: "Erro comum", text: "Esse detalhe no contrato de aluguel costuma causar prejuízo." },
  ],
};

const CHECKLIST = [
  "Hook visível nos primeiros 3 segundos",
  "Texto funciona mesmo sem áudio",
  "Sem promessa de resultado jurídico",
  "Legenda com pergunta para comentários",
  "CTA de salvar, compartilhar ou comentar",
  "3 a 5 hashtags específicas do nicho",
  "Rosto e texto dentro da zona segura do Reels",
];

const CALENDARIO = [
  { dia: "Seg", tipo: "Carrossel", tema: "Direito desconhecido", horario: "09:00" },
  { dia: "Ter", tipo: "Reel", tema: "Erro comum", horario: "12:00" },
  { dia: "Qua", tipo: "Reel", tema: "Passo a passo", horario: "12:00" },
  { dia: "Qui", tipo: "Carrossel", tema: "Notícia ou bastidor", horario: "09:00" },
  { dia: "Sex", tipo: "Reel", tema: "Bastidores / humano", horario: "19:00" },
];

const TABS = [
  { id: "gerador", label: "Gerador", Icon: Wand2 },
  { id: "hooks", label: "Hooks", Icon: Zap },
  { id: "checklist", label: "Checklist", Icon: Check },
  { id: "calendario", label: "Calendário", Icon: CalendarDays },
] as const;

function copyText(text: string, label = "Copiado") {
  navigator.clipboard.writeText(text);
  toast.success(label);
}

function formatContent(content: any) {
  if (!content) return "";
  return [
    `TÍTULO: ${content.titulo || ""}`,
    `HOOK: ${content.hook || ""}`,
    "",
    "ROTEIRO:",
    ...(content.roteiro ?? []).map((item: any) => `${item.tempo} | ${item.fala}\nTela: ${item.textoTela}\nDireção: ${item.direcao}`),
    "",
    `LEGENDA:\n${content.legenda || ""}`,
    "",
    `HASHTAGS: ${(content.hashtags ?? []).join(" ")}`,
  ].join("\n");
}

function ConteudoPage() {
  const [tab, setTab] = useState<"gerador" | "hooks" | "checklist" | "calendario">("gerador");
  const [area, setArea] = useState(AREAS[0]);
  const [pilar, setPilar] = useState(PILARES[0]);
  const [formato, setFormato] = useState(FORMATOS[0]);
  const [duracao, setDuracao] = useState(DURACOES[1]);
  const [tema, setTema] = useState("");
  const [tom, setTom] = useState("humano, direto, acessível e sem juridiquês");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [raw, setRaw] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const hooks = useMemo(() => HOOKS[area] ?? HOOKS["Previdenciário / INSS"], [area]);
  const done = Object.values(checks).filter(Boolean).length;

  const gerar = async () => {
    if (!tema.trim()) {
      toast.error("Informe o tema do conteúdo.");
      return;
    }
    setLoading(true);
    setResult(null);
    setRaw("");
    try {
      const res = await fetch("/api/content-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, pilar, tema, formato, duracao, tom }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar conteúdo.");
      setResult(data.content);
      setRaw(data.raw || "");
      if (!data.content) toast.warning("Claude respondeu fora do JSON. Mostrei o texto bruto.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar conteúdo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <Toaster />
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-4 w-4 text-amber-500" /> Sistema de conteúdo
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Geração de Conteúdo</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Gere roteiros, legendas, carrosséis e ideias para Instagram usando Claude, com foco jurídico e linguagem simples.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TABS.map(({ id, Icon, label }) => (
            <Button key={id} variant={tab === id ? "default" : "outline"} onClick={() => setTab(id)} className="gap-2">
              <Icon className="h-4 w-4" /> {label}
            </Button>
          ))}
        </div>
      </header>

      {tab === "gerador" && (
        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <section className="space-y-4 rounded-lg border bg-card p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Área</Label>
                <select value={area} onChange={e => setArea(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {AREAS.map(item => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <Label>Pilar</Label>
                <select value={pilar} onChange={e => setPilar(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {PILARES.map(item => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <Label>Formato</Label>
                <select value={formato} onChange={e => setFormato(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {FORMATOS.map(item => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <Label>Duração</Label>
                <select value={duracao} onChange={e => setDuracao(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {DURACOES.map(item => <option key={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Tema do conteúdo</Label>
              <Input
                value={tema}
                onChange={e => setTema(e.target.value)}
                onKeyDown={e => e.key === "Enter" && gerar()}
                placeholder="Ex: BPC negado por falta de CadÚnico"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Tom de voz</Label>
              <Textarea rows={3} value={tom} onChange={e => setTom(e.target.value)} className="mt-1" />
            </div>
            <Button onClick={gerar} disabled={loading || !tema.trim()} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Gerando com Claude..." : "Gerar com Claude"}
            </Button>
          </section>

          <section className="min-h-[560px] rounded-lg border bg-card p-5">
            {!result && !raw && (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center text-muted-foreground">
                <FileText className="mb-3 h-10 w-10 opacity-40" />
                <p className="font-medium">O conteúdo gerado aparece aqui.</p>
                <p className="mt-1 text-sm">Escolha área, pilar e tema para criar roteiro, legenda e carrossel.</p>
              </div>
            )}

            {result && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge variant="outline" className="mb-2">{formato} · {area}</Badge>
                    <h2 className="text-2xl font-bold">{result.titulo}</h2>
                    <p className="mt-2 text-lg font-semibold text-amber-600">{result.hook}</p>
                  </div>
                  <Button variant="outline" onClick={() => copyText(formatContent(result), "Conteúdo copiado")} className="gap-2">
                    <Copy className="h-4 w-4" /> Copiar
                  </Button>
                </div>

                <div className="grid gap-3">
                  {(result.roteiro ?? []).map((item: any, index: number) => (
                    <div key={index} className="rounded-lg border bg-muted/20 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge>{item.tempo}</Badge>
                        <span className="text-sm font-semibold">Cena {index + 1}</span>
                      </div>
                      <p className="text-sm leading-relaxed">{item.fala}</p>
                      <p className="mt-2 text-xs text-muted-foreground"><strong>Texto na tela:</strong> {item.textoTela}</p>
                      <p className="mt-1 text-xs text-muted-foreground"><strong>Direção:</strong> {item.direcao}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" /> Legenda</h3>
                    <p className="whitespace-pre-line text-sm leading-relaxed">{result.legenda}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(result.hashtags ?? []).map((tag: string) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 flex items-center gap-2 font-semibold"><Layers className="h-4 w-4" /> Carrossel</h3>
                    <div className="space-y-2">
                      {(result.carrossel ?? []).map((slide: any) => (
                        <div key={slide.slide} className="rounded-md bg-muted/30 p-2 text-sm">
                          <strong>{slide.slide}. {slide.titulo}</strong>
                          <p className="mt-1 text-muted-foreground">{slide.texto}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <strong>Observação jurídica:</strong> {result.observacaoJuridica}
                </div>
              </div>
            )}

            {!result && raw && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Resposta do Claude</h2>
                  <Button variant="outline" onClick={() => copyText(raw)} className="gap-2"><Copy className="h-4 w-4" /> Copiar</Button>
                </div>
                <pre className="max-h-[680px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm">{raw}</pre>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "hooks" && (
        <div className="grid gap-4 md:grid-cols-2">
          {hooks.map((hook, index) => (
            <button key={index} onClick={() => copyText(hook.text, "Hook copiado")} className="rounded-lg border bg-card p-4 text-left transition hover:bg-muted/40">
              <Badge variant="outline" className="mb-3">{hook.pilar}</Badge>
              <p className="text-base font-medium leading-relaxed">"{hook.text}"</p>
            </button>
          ))}
        </div>
      )}

      {tab === "checklist" && (
        <div className="max-w-3xl rounded-lg border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Checklist de publicação</h2>
              <p className="text-sm text-muted-foreground">{done}/{CHECKLIST.length} itens prontos</p>
            </div>
            <Button variant="outline" onClick={() => setChecks({})}>Reiniciar</Button>
          </div>
          <div className="space-y-2">
            {CHECKLIST.map(item => (
              <button key={item} onClick={() => setChecks(prev => ({ ...prev, [item]: !prev[item] }))} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/40">
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${checks[item] ? "border-emerald-500 bg-emerald-500 text-white" : ""}`}>
                  {checks[item] && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className={checks[item] ? "text-muted-foreground line-through" : ""}>{item}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "calendario" && (
        <div className="grid gap-3 md:grid-cols-5">
          {CALENDARIO.map(item => (
            <div key={item.dia} className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-lg font-bold">{item.dia}</span>
                <Badge variant="secondary">{item.horario}</Badge>
              </div>
              <p className="font-semibold">{item.tipo}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.tema}</p>
              <Button variant="ghost" size="sm" className="mt-3 gap-2 px-0" onClick={() => copyText(`${item.dia} ${item.horario}: ${item.tipo} sobre ${item.tema}`)}>
                <Clipboard className="h-3.5 w-3.5" /> Copiar ideia
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
