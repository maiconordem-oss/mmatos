import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BookOpen, Bot, Zap, Video, Mic, FileText, Users,
  Calendar, Phone, CheckCheck, ChevronDown, ChevronUp,
  Copy, Check, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/manual")({
  head: () => ({ meta: [{ title: "Manual de Prompts — Lex CRM" }] }),
  component: () => (
    <AuthGate>
      <AppShell>
        <ManualPage />
      </AppShell>
    </AuthGate>
  ),
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="absolute top-2 right-2 p-1.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CodeBlock({ code, lang = "json" }: { code: string; lang?: string }) {
  return (
    <div className="relative">
      <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed">{code}</pre>
      <CopyButton text={code} />
    </div>
  );
}

function Section({ id, icon: Icon, title, color, children }: any) {
  const [open, setOpen] = useState(true);
  return (
    <div id={id} className="border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <h2 className="font-bold text-lg">{title}</h2>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t">{children}</div>}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
      <span>{children}</span>
    </div>
  );
}

function Var({ name, desc, example }: { name: string; desc: string; example?: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      <code className="text-xs bg-muted px-2 py-1 rounded font-mono shrink-0 text-violet-700">{name}</code>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{desc}</p>
        {example && <p className="text-xs text-muted-foreground mt-0.5">Ex: <span className="font-mono">{example}</span></p>}
      </div>
    </div>
  );
}

function ManualPage() {
  const sections = [
    { id: "formato", label: "Formato JSON", icon: FileText },
    { id: "fases", label: "Fases do funil", icon: Zap },
    { id: "acoes", label: "Ações disponíveis", icon: CheckCheck },
    { id: "midias", label: "Mídias", icon: Video },
    { id: "dados", label: "Dados extraídos", icon: Users },
    { id: "objecoes", label: "Objeções", icon: Bot },
    { id: "exemplos", label: "Exemplos completos", icon: BookOpen },
  ];

  return (
    <div className="flex h-full">
      {/* Índice lateral */}
      <aside className="w-52 shrink-0 border-r p-4 space-y-1 hidden lg:block">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Neste manual</p>
        {sections.map(s => (
          <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <s.icon className="h-3.5 w-3.5 shrink-0" />
            {s.label}
          </a>
        ))}
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <header className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Manual de Criação de Prompts</h1>
                <p className="text-muted-foreground">Guia completo para criar funis de atendimento automático</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <strong>Princípio fundamental:</strong> A IA responde SEMPRE com um JSON estruturado. Nunca com texto livre. Isso garante que o sistema execute as ações corretamente — enviar mídias, avançar fases, gerar contratos, agendar consultas.
            </div>
          </header>

          {/* FORMATO JSON */}
          <Section id="formato" icon={FileText} title="Formato obrigatório do JSON" color="bg-slate-600">
            <p className="text-sm text-muted-foreground pt-4">Toda resposta da IA deve ser um JSON válido com exatamente estes campos. Nenhum texto fora do JSON.</p>
            <CodeBlock code={`{
  "texto":          "mensagem enviada ao cliente antes das mídias",
  "midias":         [],
  "texto_pos_midia": null,
  "nova_fase":      null,
  "acao":           null,
  "dados_extraidos": {}
}`} />
            <div className="space-y-2">
              <Var name="texto" desc="Mensagem principal enviada ao cliente. Pode ser vazio se só vai enviar mídia." example='"Me conta o que está acontecendo."' />
              <Var name="midias" desc="Array com chaves das mídias a enviar após o texto. A ordem importa." example='["video_abertura"]' />
              <Var name="texto_pos_midia" desc="Mensagem enviada AUTOMATICAMENTE após todas as mídias terminarem. Use para perguntas que chegam depois do vídeo." example='"Posso abrir o caso agora?"' />
              <Var name="nova_fase" desc='Muda a fase da conversa. Deixe null para manter a fase atual. Siga a sequência obrigatória.' example='"triagem"' />
              <Var name="acao" desc="Dispara uma ação do sistema. Veja seção Ações." example='"gerar_contrato"' />
              <Var name="dados_extraidos" desc="Objeto com dados coletados nesta mensagem. O sistema acumula automaticamente." example='{"nome": "Jonas Silva", "cpf": "123.456.789-00"}' />
            </div>
            <Tip>O sistema injeta automaticamente o estado atual (fase, dados já coletados, mídias já enviadas) no início do prompt a cada mensagem. Use isso para não repetir perguntas.</Tip>
          </Section>

          {/* FASES */}
          <Section id="fases" icon={Zap} title="Fases do funil" color="bg-violet-600">
            <p className="text-sm text-muted-foreground pt-4">As fases seguem uma sequência obrigatória. O sistema rastreia em qual fase a conversa está e nunca volta atrás.</p>
            <div className="space-y-2">
              {[
                { fase: "abertura",   cor: "bg-gray-400",   desc: "Fase inicial. Toda conversa começa aqui. Envie o vídeo de abertura e mude para triagem." },
                { fase: "triagem",    cor: "bg-blue-400",   desc: "Colete as informações básicas do caso. Uma pergunta por vez." },
                { fase: "conexao",    cor: "bg-orange-400", desc: "Apresente o caso como solucionável. Envie vídeo emocional. Peça confirmação para abrir o caso." },
                { fase: "fechamento", cor: "bg-pink-400",   desc: "Envie áudio de avaliação. Confirme interesse e passe para coleta." },
                { fase: "coleta",     cor: "bg-purple-400", desc: "Colete dados pessoais completos. Um campo por mensagem." },
                { fase: "assinatura", cor: "bg-green-400",  desc: "Gere o contrato e envie para assinatura digital." },
                { fase: "encerrado",  cor: "bg-teal-400",   desc: "Conversa finalizada. A IA para de responder." },
              ].map(({ fase, cor, desc }) => (
                <div key={fase} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <div className={`h-6 w-6 rounded-full ${cor} flex items-center justify-center shrink-0 mt-0.5`}>
                    <span className="text-white text-[10px] font-bold">→</span>
                  </div>
                  <div>
                    <code className="text-xs font-mono font-bold text-violet-700">{fase}</code>
                    <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <CodeBlock code={`// Exemplo: avançar da abertura para triagem
{
  "texto": "Me conta o que está acontecendo.",
  "midias": ["video_abertura"],
  "texto_pos_midia": null,
  "nova_fase": "triagem",
  "acao": null,
  "dados_extraidos": {}
}`} />
          </Section>

          {/* AÇÕES */}
          <Section id="acoes" icon={CheckCheck} title="Ações disponíveis" color="bg-green-600">
            <p className="text-sm text-muted-foreground pt-4">Ações executam lógica no servidor além de enviar mensagem. Use sempre com "nova_fase" apropriada.</p>

            <div className="space-y-4">
              {[
                {
                  acao: "gerar_contrato",
                  icon: FileText,
                  desc: "Gera proposta de honorários + envia contrato ZapSign para assinatura. Também notifica o dono por WhatsApp.",
                  quando: "Quando o cliente confirmar os dados na fase coleta",
                  code: `{
  "texto": "Perfeito. Gerando os documentos agora.",
  "midias": [],
  "texto_pos_midia": null,
  "nova_fase": "assinatura",
  "acao": "gerar_contrato",
  "dados_extraidos": {}
}`,
                },
                {
                  acao: "agendar_consulta",
                  icon: Calendar,
                  desc: "Busca horários livres do Google Calendar do dia seguinte e envia as opções numeradas ao cliente.",
                  quando: "Quando o cliente quiser conversar pessoalmente ou você quiser oferecer consulta",
                  code: `{
  "texto": "Vou verificar minha agenda para amanhã.",
  "midias": [],
  "texto_pos_midia": null,
  "nova_fase": null,
  "acao": "agendar_consulta",
  "dados_extraidos": {}
}`,
                },
                {
                  acao: "confirmar_agendamento",
                  icon: CheckCheck,
                  desc: "Detecta qual horário o cliente escolheu (número 1-5), cria o evento no Google Calendar e confirma.",
                  quando: "Quando o cliente responder com o número do horário desejado",
                  code: `{
  "texto": "",
  "midias": [],
  "texto_pos_midia": null,
  "nova_fase": null,
  "acao": "confirmar_agendamento",
  "dados_extraidos": {}
}`,
                },
                {
                  acao: "transferir_humano",
                  icon: Phone,
                  desc: "Envia mensagem de handoff configurada no funil e pausa a IA. A conversa fica com indicador vermelho no Inbox.",
                  quando: "Quando o cliente insistir em falar com humano ou em casos complexos",
                  code: `{
  "texto": "",
  "midias": [],
  "texto_pos_midia": null,
  "nova_fase": "encerrado",
  "acao": "transferir_humano",
  "dados_extraidos": {}
}`,
                },
              ].map(({ acao, icon: Icon, desc, quando, code }) => (
                <div key={acao} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-green-600" />
                    <code className="font-mono font-bold text-green-700">{acao}</code>
                  </div>
                  <p className="text-sm">{desc}</p>
                  <p className="text-xs text-muted-foreground"><strong>Quando usar:</strong> {quando}</p>
                  <CodeBlock code={code} />
                </div>
              ))}
            </div>
          </Section>

          {/* MÍDIAS */}
          <Section id="midias" icon={Video} title="Mídias" color="bg-blue-600">
            <p className="text-sm text-muted-foreground pt-4">Você cria as chaves de mídia livremente em Funis de Atendimento. A regra é simples:</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-lg p-3 text-center space-y-1">
                <Mic className="h-6 w-6 mx-auto text-violet-500" />
                <p className="font-medium text-sm">Áudio</p>
                <p className="text-xs text-muted-foreground">Chave começa com <code className="bg-muted px-1 rounded">audio_</code></p>
                <code className="text-xs text-violet-700">audio_fechamento</code>
              </div>
              <div className="border rounded-lg p-3 text-center space-y-1">
                <Video className="h-6 w-6 mx-auto text-blue-500" />
                <p className="font-medium text-sm">Vídeo</p>
                <p className="text-xs text-muted-foreground">Qualquer outra chave</p>
                <code className="text-xs text-blue-700">video_abertura</code>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Chaves sugeridas para começar:</p>
              {[
                { key: "video_abertura",   desc: "Apresentação do Dr. Maicon — enviado na primeira mensagem" },
                { key: "video_conexao",    desc: "Vídeo emocional — enviado quando o caso tem fundamento" },
                { key: "audio_fechamento", desc: "Áudio do Dr. avaliando o caso pessoalmente" },
                { key: "video_documentos", desc: "Orientações sobre documentos — enviado após assinatura" },
                { key: "audio_objecao_custo",  desc: "Áudio rebatendo objeção de custo" },
                { key: "audio_objecao_demora", desc: "Áudio rebatendo objeção de demora" },
              ].map(({ key, desc }) => (
                <div key={key} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                  {key.startsWith("audio_") ? <Mic className="h-3.5 w-3.5 text-violet-500 shrink-0" /> : <Video className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                  <code className="text-xs font-mono text-violet-700 shrink-0">{key}</code>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
            <CodeBlock code={`// Enviar vídeo e depois fazer pergunta automaticamente
{
  "texto": "Tenho um recado importante pra você.",
  "midias": ["video_conexao"],
  "texto_pos_midia": "Posso abrir o seu caso agora?",
  "nova_fase": "conexao",
  "acao": null,
  "dados_extraidos": {}
}`} />
            <Tip>O sistema nunca envia a mesma mídia duas vezes na mesma conversa. Se a chave já foi enviada, é ignorada automaticamente.</Tip>
          </Section>

          {/* DADOS EXTRAÍDOS */}
          <Section id="dados" icon={Users} title="Dados extraídos" color="bg-orange-600">
            <p className="text-sm text-muted-foreground pt-4">Extraia um dado por mensagem. O sistema acumula todos automaticamente e os usa para gerar o contrato, criar o cliente e preencher o kanban.</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Funil Creche</p>
                {["nome","nomeCrianca","idadeCrianca","municipio","cpf","rg","estadoCivil","profissao","endereco","dataNascimentoCrianca","creche","protocolo"].map(k => (
                  <div key={k} className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-orange-700">{k}</div>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Funil Tirzepatida</p>
                {["nome","cpf","rg","estadoCivil","profissao","endereco","dataNascimento","temPrescricao","nomeMedico","crm","cid"].map(k => (
                  <div key={k} className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-orange-700">{k}</div>
                ))}
              </div>
            </div>

            <CodeBlock code={`// Extrair dado a cada mensagem
{
  "texto": "E o nome do seu filho ou filha?",
  "midias": [],
  "texto_pos_midia": null,
  "nova_fase": null,
  "acao": null,
  "dados_extraidos": { "nomeCrianca": "Davi Silva" }
}

// Extrair múltiplos de uma vez (quando o cliente manda tudo junto)
{
  "texto": "Anotado. Agora preciso do seu CPF.",
  "midias": [],
  "texto_pos_midia": null,
  "nova_fase": null,
  "acao": null,
  "dados_extraidos": {
    "estadoCivil": "Casado",
    "profissao": "Motorista"
  }
}`} />
          </Section>

          {/* OBJEÇÕES */}
          <Section id="objecoes" icon={Bot} title="Como tratar objeções" color="bg-red-600">
            <p className="text-sm text-muted-foreground pt-4">Inclua no prompt as respostas para as principais objeções. Elas valem em qualquer fase — o sistema detecta automaticamente.</p>

            <div className="space-y-3">
              {[
                {
                  trigger: "Quanto custa? Tem algum custo?",
                  resposta: "Você não paga nada. Quando o município perde — e na maioria dos casos perde — ele é condenado a pagar meus honorários. Quem banca é a Prefeitura. Para você, é gratuito.",
                  acao: '{"texto": "[resposta]", "midias": [], "nova_fase": null, "acao": null, "dados_extraidos": {}}',
                },
                {
                  trigger: "Demora muito? Preciso ir ao escritório?",
                  resposta: "Você não vai precisar ir a lugar nenhum. Eu cuido de tudo. Já vi liminares saírem em 48 horas. Sua parte é só me mandar os documentos.",
                  acao: null,
                },
                {
                  trigger: "Vai funcionar? Já tentei antes...",
                  resposta: "Cobrar informalmente é diferente de entrar com ação judicial. Com a ação, o município é legalmente obrigado a responder. Já resolvi casos iguais.",
                  acao: null,
                },
                {
                  trigger: "Deixa eu pensar / ver depois",
                  resposta: "Sem pressão. Só quero que você saiba que enquanto a gente não abre o processo, o município não tem obrigação nenhuma de te responder. A fila continua andando. Quando decidir, é só me chamar aqui.",
                  acao: null,
                },
                {
                  trigger: "Você é robô? É IA?",
                  resposta: "Sou o Dr. Maicon Matos. Estou aqui para cuidar do seu caso.",
                  acao: null,
                },
                {
                  trigger: "Quero falar com uma pessoa / quero falar com o doutor",
                  resposta: null,
                  acao: '{"texto": "Entendido. Vou acionar minha equipe.", "acao": "transferir_humano", "nova_fase": "encerrado", "midias": [], "texto_pos_midia": null, "dados_extraidos": {}}',
                },
              ].map(({ trigger, resposta, acao }) => (
                <div key={trigger} className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                    <span>⚡</span> Quando o cliente disser: <em>"{trigger}"</em>
                  </p>
                  {resposta && <p className="text-sm bg-muted/50 rounded p-2 italic">"{resposta}"</p>}
                  {acao && <CodeBlock code={acao} />}
                </div>
              ))}
            </div>
          </Section>

          {/* EXEMPLOS COMPLETOS */}
          <Section id="exemplos" icon={BookOpen} title="Exemplos completos por etapa" color="bg-teal-600">
            <div className="space-y-5 pt-4">

              <div>
                <Badge variant="outline" className="mb-2">Abertura — primeira mensagem de qualquer lead</Badge>
                <CodeBlock code={`{
  "texto": "Me conta o que está acontecendo.",
  "midias": ["video_abertura"],
  "texto_pos_midia": null,
  "nova_fase": "triagem",
  "acao": null,
  "dados_extraidos": {}
}`} />
              </div>

              <div>
                <Badge variant="outline" className="mb-2">Triagem — coletando dados um a um</Badge>
                <CodeBlock code={`// Após receber o nome:
{ "texto": "E o nome do seu filho ou filha?", "midias": [], "texto_pos_midia": null, "nova_fase": null, "acao": null, "dados_extraidos": { "nome": "Ana Paula" } }

// Após receber o nome da criança:
{ "texto": "Quantos anos e meses ele tem?", "midias": [], "texto_pos_midia": null, "nova_fase": null, "acao": null, "dados_extraidos": { "nomeCrianca": "Davi" } }

// Criança com mais de 5 anos e 11 meses → encerrar:
{ "texto": "Entendo a situação. Esse atendimento é específico para crianças até 5 anos e 11 meses — período com proteção legal garantida.", "midias": [], "texto_pos_midia": null, "nova_fase": "encerrado", "acao": null, "dados_extraidos": { "idadeCrianca": "7 anos" } }`} />
              </div>

              <div>
                <Badge variant="outline" className="mb-2">Conexão — caso tem fundamento</Badge>
                <CodeBlock code={`{
  "texto": "Ana, com o que você me contou, o caso de Davi tem base legal sólida.\\nO município está descumprindo uma obrigação constitucional.\\nCada mês que passa é tempo de desenvolvimento que não volta. Tenho um recado importante pra você.",
  "midias": ["video_conexao"],
  "texto_pos_midia": "Posso abrir o caso de Davi agora?",
  "nova_fase": "conexao",
  "acao": null,
  "dados_extraidos": {}
}`} />
              </div>

              <div>
                <Badge variant="outline" className="mb-2">Fechamento — cliente confirmou interesse</Badge>
                <CodeBlock code={`{
  "texto": "Ótimo. Vou te mandar um áudio com minha avaliação do caso.",
  "midias": ["audio_fechamento"],
  "texto_pos_midia": "O que eu falei faz sentido pra você?",
  "nova_fase": "fechamento",
  "acao": null,
  "dados_extraidos": {}
}`} />
              </div>

              <div>
                <Badge variant="outline" className="mb-2">Confirmação de dados → gerar contrato</Badge>
                <CodeBlock code={`// Exibir resumo dos dados coletados:
{
  "texto": "Deixa eu confirmar tudo antes de gerar os documentos:\\n\\nNome: Ana Paula\\nCPF: 123.456.789-00\\nCriança: Davi, nascido em 07/10/2024\\nMunicípio: Porto Alegre\\nCreche: Bem me Quer\\n\\nEstá tudo certo?",
  "midias": [], "texto_pos_midia": null, "nova_fase": null, "acao": null, "dados_extraidos": {}
}

// Quando confirmar:
{
  "texto": "Perfeito. Gerando os documentos agora.",
  "midias": [], "texto_pos_midia": null,
  "nova_fase": "assinatura", "acao": "gerar_contrato", "dados_extraidos": {}
}`} />
              </div>

              <div>
                <Badge variant="outline" className="mb-2">Agendamento de consulta</Badge>
                <CodeBlock code={`// IA oferece horários:
{
  "texto": "Posso verificar minha agenda para amanhã.",
  "midias": [], "texto_pos_midia": null, "nova_fase": null,
  "acao": "agendar_consulta", "dados_extraidos": {}
}
// → Sistema envia automaticamente: "Tenho os seguintes horários: 1. 09:00  2. 10:00  3. 14:00..."

// Cliente responde "2" → IA confirma:
{
  "texto": "",
  "midias": [], "texto_pos_midia": null, "nova_fase": null,
  "acao": "confirmar_agendamento", "dados_extraidos": {}
}
// → Sistema cria evento no Google Calendar e confirma ao cliente`} />
              </div>

              <div>
                <Badge variant="outline" className="mb-2">Transferência para humano</Badge>
                <CodeBlock code={`{
  "texto": "",
  "midias": [], "texto_pos_midia": null,
  "nova_fase": "encerrado", "acao": "transferir_humano", "dados_extraidos": {}
}
// → Sistema envia mensagem configurada no funil e pausa a IA`} />
              </div>
            </div>
          </Section>

          {/* Dicas finais */}
          <div className="border rounded-xl p-5 bg-gradient-to-br from-primary/5 to-primary/10 space-y-3">
            <h3 className="font-bold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Dicas de ouro</h3>
            <ul className="space-y-2 text-sm">
              {[
                "Sempre instrua a IA a responder APENAS com JSON — coloque isso em maiúsculas no prompt",
                "Injete o estado atual explicitamente: 'fase atual, dados já coletados e mídias já enviadas são injetados automaticamente'",
                "Uma pergunta por mensagem — nunca duas no mesmo JSON",
                "O texto_pos_midia é enviado após as mídias sem precisar de nova mensagem do cliente — use para a pergunta de fechamento",
                "Use o botão Simular antes de ligar no número real — teste todos os caminhos possíveis",
                "Não prometa resultados — 'já resolvi casos iguais' é diferente de 'você vai ganhar'",
                "Teste o fluxo de objeções: custo, demora, dúvida, deixa eu pensar, quero falar com humano",
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
