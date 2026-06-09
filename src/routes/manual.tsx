import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  MessageSquare,
  Settings,
} from "lucide-react";

export const Route = createFileRoute("/manual")({
  head: () => ({ meta: [{ title: "Manual da IA - Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <ManualIaPage />
      </AppShell>
    </AuthGate>
  ),
});

const sections = [
  {
    title: "1. Conectar o WhatsApp",
    icon: MessageSquare,
    items: [
      "Acesse Ajustes > Conectar WhatsApp.",
      "Adicione ou edite uma instancia.",
      "Escolha se o numero sera atendimento automatico ou numero do escritorio.",
      "Se for automatico, vincule um atendimento IA ao numero.",
      "Salve, leia o QR Code e aguarde o status conectado.",
    ],
  },
  {
    title: "2. Criar o atendimento IA",
    icon: Bot,
    items: [
      "Acesse Automacao > Atendimentos IA.",
      "Use um atendimento existente ou clique em Novo funil.",
      "Use a aba Fluxo visual para montar perguntas, arquivos, coleta de dados e acoes.",
      "Clique em uma fase para ajustar scripts, tempo apos midia, respostas rapidas, exclusoes e dados do contrato.",
      "Se o video tem 1 minuto, configure 60 segundos antes da proxima mensagem.",
      "Defina nome, descricao, honorarios, horario e follow-up.",
      "Comece com um unico atendimento principal e marque como padrao.",
      "Deixe integracoes avancadas desligadas no primeiro teste.",
    ],
  },
  {
    title: "3. Informar o que a IA precisa saber",
    icon: BookOpen,
    items: [
      "Acesse Automacao > Informacoes da IA.",
      "Cadastre areas atendidas, cidades, documentos, honorarios e perguntas frequentes.",
      "Mantenha cada item curto, objetivo e sem duplicidade.",
      "Deixe ativo apenas o que a IA deve usar nas respostas.",
    ],
  },
  {
    title: "4. Ajustar comportamento",
    icon: Settings,
    items: [
      "Abra Configuracoes avancadas apenas quando precisar.",
      "Use essa area para prompt completo, ZapSign, Google Agenda, grupos, A/B e playbook manual.",
      "Se nao souber o que uma opcao faz, mantenha o padrao.",
      "Ative recursos avancados um por vez e teste antes de usar com leads reais.",
    ],
  },
  {
    title: "5. Testar antes de divulgar",
    icon: ClipboardCheck,
    items: [
      "Em Atendimentos IA, clique em Simular.",
      "Teste mensagens como: oi, quanto custa, voce garante que eu ganho, quero falar com uma pessoa.",
      "Confira se a IA faz uma pergunta por vez.",
      "Confira se ela nao promete resultado.",
      "Confira se ela chama humano quando o caso fica sensivel.",
    ],
  },
];

const recommended = [
  "1 numero de WhatsApp conectado.",
  "1 atendimento IA padrao.",
  "3 a 5 informacoes essenciais na base da IA.",
  "Teste A/B desligado.",
  "Google Agenda desligado no primeiro uso.",
  "Grupo automatico desligado no primeiro uso.",
  "ZapSign desligado ate o contrato estar testado.",
  "Follow-up em 48 horas.",
  "Pausa humana ativada.",
];

const checklist = [
  "WhatsApp conectado.",
  "Atendimento IA ativo.",
  "Atendimento vinculado ao numero ou marcado como padrao.",
  "Base de informacoes preenchida.",
  "Prompt revisado.",
  "Simulacao testada.",
  "IA chama humano em casos sensiveis.",
  "Equipe sabe pausar e retomar IA no Inbox.",
];

function ManualIaPage() {
  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Manual da IA</h1>
            <p className="text-sm text-muted-foreground">
              Passo a passo para configurar o atendimento automatico sem complicar o sistema.
            </p>
          </div>
        </div>
      </header>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Objetivo da IA
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Receber o lead pelo WhatsApp.",
            "Conduzir o atendimento com perguntas claras.",
            "Chamar humano quando o caso exigir cuidado.",
          ].map((item) => (
            <div key={item} className="flex gap-2 rounded-md border bg-background p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {sections.map(({ title, icon: Icon, items }) => (
          <section key={title} className="rounded-lg border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">{title}</h2>
            </div>
            <ol className="space-y-2 text-sm text-foreground/80">
              {items.map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <section className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Prompt simples para comecar</h2>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs leading-relaxed whitespace-pre-wrap">
{`Voce e o Dr. Maicon Matos, advogado. Atenda pelo WhatsApp com linguagem simples, cordial e objetiva.

Objetivo: qualificar leads interessados em [AREA].

Regras:
- Faca uma pergunta por vez.
- Nunca prometa resultado.
- Nunca garanta prazo judicial.
- Se o cliente estiver irritado, pedir garantia, falar em processo contra o escritorio ou pedir humano, pause a IA e chame a equipe.
- Ao final de cada resposta, deixe claro o proximo passo.

Fluxo:
1. Entender o problema.
2. Confirmar cidade e situacao atual.
3. Verificar documentos ou protocolo.
4. Explicar o proximo passo.
5. Coletar dados para proposta ou contrato quando fizer sentido.`}
        </pre>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <h2 className="font-semibold">Quando chamar humano</h2>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {[
            "Cliente pede para falar com pessoa real.",
            "Cliente esta irritado ou ameaca reclamar.",
            "Cliente pede garantia de resultado.",
            "Cliente pergunta algo juridico complexo.",
            "Cliente quer negociar honorarios.",
            "Cliente enviou documentos importantes.",
            "Caso esta pronto para contrato.",
            "IA ficou insegura ou repetitiva.",
          ].map((item) => (
            <div key={item} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {item}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-5">
          <h2 className="mb-3 font-semibold">Configuracao recomendada</h2>
          <ul className="space-y-2 text-sm">
            {recommended.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="mb-3 font-semibold">Checklist final</h2>
          <ul className="space-y-2 text-sm">
            {checklist.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-muted-foreground/40" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="mb-3 font-semibold">Problemas comuns</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border p-3">
            <h3 className="mb-1 text-sm font-semibold">A IA nao responde</h3>
            <p className="text-sm text-muted-foreground">
              Verifique se o WhatsApp esta conectado, se a conversa nao esta pausada, se o numero nao e do escritorio e se existe atendimento IA ativo.
            </p>
          </div>
          <div className="rounded-md border p-3">
            <h3 className="mb-1 text-sm font-semibold">A IA responde confusa</h3>
            <p className="text-sm text-muted-foreground">
              Reduza o prompt, remova informacoes duplicadas e deixe o fluxo com poucas perguntas por etapa.
            </p>
          </div>
          <div className="rounded-md border p-3">
            <h3 className="mb-1 text-sm font-semibold">A IA promete resultado</h3>
            <p className="text-sm text-muted-foreground">
              Inclua regra clara: nunca prometer resultado, prazo judicial ou decisao favoravel.
            </p>
          </div>
          <div className="rounded-md border p-3">
            <h3 className="mb-1 text-sm font-semibold">A IA nao chama humano</h3>
            <p className="text-sm text-muted-foreground">
              Inclua regra para transferir quando houver pedido de pessoa real, irritacao, garantia, desconto ou duvida juridica complexa.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
