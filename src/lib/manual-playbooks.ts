import { FASES, FASE_LABELS } from "@/lib/inbox-helpers";

export type ManualObjection = {
  label: string;
  reply: string;
};

export type ManualMediaSuggestion = {
  key: string;
  title: string;
  type: "audio" | "video" | "documento";
  script: string;
};

export type ManualPlaybookStep = {
  id: string;
  label: string;
  goal: string;
  questions: string[];
  quickReplies: string[];
  infoToCollect: string[];
  objections: ManualObjection[];
  mediaSuggestions: ManualMediaSuggestion[];
};

export type ManualPlaybook = {
  area: string;
  name: string;
  description: string;
  steps: ManualPlaybookStep[];
};

export const DEFAULT_BPC_MANUAL_PLAYBOOK: ManualPlaybook = {
  area: "bpc_loas",
  name: "BPC/LOAS - Atendimento manual",
  description: "Roteiro visual para conduzir atendimentos de BPC no WhatsApp, com perguntas, respostas, objeções e mídias sugeridas.",
  steps: [
    {
      id: "abertura",
      label: "Abertura",
      goal: "Entender quem é o requerente e qual foi a dor inicial sem sobrecarregar o cliente.",
      questions: [
        "Oi, tudo bem? O atendimento é sobre BPC/LOAS para você ou para outra pessoa?",
        "Me conta em poucas palavras o que aconteceu: é um pedido novo, negativa, suspensão ou dúvida sobre o benefício?",
        "Qual é a cidade onde a pessoa mora hoje?",
      ],
      quickReplies: [
        "Perfeito, vou te orientar por etapas para entender se existe caminho para o BPC.",
        "Pode me mandar uma mensagem por vez. Eu vou organizando as informações por aqui.",
      ],
      infoToCollect: ["Quem é o requerente", "Tipo do problema", "Cidade"],
      objections: [],
      mediaSuggestions: [
        {
          key: "audio_abertura_bpc",
          title: "Áudio curto de acolhimento",
          type: "audio",
          script: "Oi, eu entendi. Vou te fazer algumas perguntas simples para saber se o caso tem caminho para BPC e quais documentos vão ajudar.",
        },
      ],
    },
    {
      id: "triagem",
      label: "Triagem",
      goal: "Confirmar os requisitos principais: idade ou deficiência, renda familiar, CadÚnico e histórico do INSS.",
      questions: [
        "A pessoa tem 65 anos ou mais, ou possui alguma deficiência/doença que dificulte trabalhar ou viver de forma independente?",
        "Quantas pessoas moram na mesma casa e qual é a renda aproximada da família?",
        "A família tem CadÚnico atualizado? Se tiver, sabe informar o NIS?",
        "Já houve pedido no INSS? Foi negado, está em análise ou o benefício foi suspenso?",
        "Existem laudos, receitas, exames ou relatórios médicos recentes?",
      ],
      quickReplies: [
        "Essas respostas ajudam a separar o que é requisito do benefício e o que precisa ser provado.",
        "Mesmo quando o INSS nega, ainda pode existir caminho se os documentos mostrarem a realidade da família.",
      ],
      infoToCollect: ["Idade ou deficiência", "Composição familiar", "Renda", "CadÚnico/NIS", "Situação no INSS", "Documentos médicos"],
      objections: [
        {
          label: "Não tenho CadÚnico",
          reply: "Sem CadÚnico fica mais difícil, mas não significa que acabou. O ideal é atualizar ou fazer o cadastro e, ao mesmo tempo, organizar os documentos do caso.",
        },
      ],
      mediaSuggestions: [
        {
          key: "video_requisitos_bpc",
          title: "Vídeo explicando requisitos",
          type: "video",
          script: "Explique em linguagem simples: BPC não é aposentadoria, exige idade ou deficiência, baixa renda e prova documental.",
        },
      ],
    },
    {
      id: "conexao",
      label: "Conexão",
      goal: "Mostrar que o escritório entendeu a situação e traduzir os próximos passos de forma segura.",
      questions: [
        "Pelo que você me contou, o principal problema hoje é a renda da casa, a parte médica ou a negativa do INSS?",
        "Essa situação já está afetando compra de remédios, alimentação, aluguel ou cuidados básicos?",
      ],
      quickReplies: [
        "Entendi. O BPC costuma depender de duas provas: a realidade social da família e, quando for deficiência, a condição de saúde.",
        "O próximo passo é organizar os documentos para enxergar a força do caso antes de prometer qualquer resultado.",
      ],
      infoToCollect: ["Principal dor", "Impacto financeiro", "Impacto na saúde", "Urgência"],
      objections: [
        {
          label: "Tenho medo de perder tempo",
          reply: "Eu entendo. Por isso a primeira análise serve justamente para evitar promessa vazia e ver se os documentos sustentam o pedido.",
        },
      ],
      mediaSuggestions: [
        {
          key: "audio_analise_bpc",
          title: "Áudio de análise inicial",
          type: "audio",
          script: "Explique que o caso será analisado por requisitos, documentos e urgência, sem juridiquês.",
        },
      ],
    },
    {
      id: "fechamento",
      label: "Fechamento",
      goal: "Confirmar interesse, quebrar objeções e conduzir para a análise documental.",
      questions: [
        "Faz sentido fazermos uma análise dos documentos para saber o melhor caminho?",
        "Você prefere me enviar os documentos por aqui agora ou quer que eu te mande a lista primeiro?",
      ],
      quickReplies: [
        "Vamos fazer com calma: primeiro documentos, depois análise, depois orientação sobre o caminho mais seguro.",
        "Eu não vou te pedir nada desnecessário. A lista é só para confirmar requisito e prova.",
      ],
      infoToCollect: ["Autorização para analisar", "Disponibilidade para enviar documentos", "Principal objeção"],
      objections: [
        {
          label: "Não tenho dinheiro agora",
          reply: "Entendo totalmente. A primeira etapa é entender se existe caminho. Depois disso explicamos com clareza as condições antes de qualquer decisão.",
        },
        {
          label: "O INSS já negou",
          reply: "A negativa do INSS não encerra o assunto. Muitas vezes o problema está na prova apresentada ou na avaliação que foi feita.",
        },
        {
          label: "Vai demorar muito?",
          reply: "Depende do caminho e dos documentos, mas organizar bem desde o início evita perda de tempo e retrabalho.",
        },
      ],
      mediaSuggestions: [
        {
          key: "audio_objecao_custo_bpc",
          title: "Áudio sobre custo",
          type: "audio",
          script: "Acolha a preocupação financeira e explique que nenhuma contratação será feita sem clareza sobre valores e próximos passos.",
        },
      ],
    },
    {
      id: "coleta",
      label: "Coleta de dados",
      goal: "Receber documentos em blocos pequenos e registrar o que falta.",
      questions: [
        "Me envie primeiro documento com foto e CPF da pessoa que vai pedir o BPC.",
        "Agora me envie comprovante de residência e, se tiver, o NIS ou folha do CadÚnico.",
        "Se for caso de deficiência ou doença, me mande laudos, exames, receitas e relatórios médicos.",
        "Se já pediu no INSS, me envie a negativa, protocolo ou print do Meu INSS.",
      ],
      quickReplies: [
        "Recebi. Pode mandar o próximo documento.",
        "Esse documento ajuda. Vou marcar aqui e te aviso o que ainda falta.",
        "Se estiver em foto, tente enviar bem legível e sem cortar as bordas.",
      ],
      infoToCollect: ["RG/CPF", "Comprovante de residência", "CadÚnico/NIS", "Laudos e exames", "Receitas", "Negativa ou protocolo do INSS", "Renda da família"],
      objections: [
        {
          label: "Não tenho laudo recente",
          reply: "Pode mandar o que tiver. Depois vemos se será necessário atualizar relatório médico para fortalecer o pedido.",
        },
      ],
      mediaSuggestions: [
        {
          key: "video_documentos_bpc",
          title: "Vídeo da lista de documentos",
          type: "video",
          script: "Mostre a lista em ordem: identificação, residência, CadÚnico, médicos, renda e negativa do INSS.",
        },
      ],
    },
    {
      id: "assinatura",
      label: "Assinatura",
      goal: "Orientar contrato, procuração e próximos passos com linguagem simples.",
      questions: [
        "Vou te enviar os documentos de assinatura. Consegue abrir o link pelo celular?",
        "Após assinar, me avise por aqui para eu conferir se ficou tudo certo.",
      ],
      quickReplies: [
        "A assinatura é feita pelo celular mesmo, seguindo o link.",
        "Depois da assinatura, o escritório confere os documentos e te informa o próximo passo.",
      ],
      infoToCollect: ["Confirmação de leitura", "Assinatura concluída", "Dúvidas sobre contrato"],
      objections: [
        {
          label: "Tenho receio de assinar online",
          reply: "É normal ter essa dúvida. O link serve para registrar sua autorização com segurança e você pode perguntar qualquer ponto antes de assinar.",
        },
      ],
      mediaSuggestions: [
        {
          key: "audio_assinatura_bpc",
          title: "Áudio explicando assinatura",
          type: "audio",
          script: "Explique que o cliente assina contrato/procuração e que o escritório só avança com autorização clara.",
        },
      ],
    },
    {
      id: "encerrado",
      label: "Encerrado",
      goal: "Fechar o atendimento inicial e manter o cliente orientado sobre acompanhamento.",
      questions: [
        "Tudo certo por aqui. Se surgir documento novo ou mensagem do INSS, me envie por aqui.",
        "Vou manter você informado sobre os próximos movimentos do caso.",
      ],
      quickReplies: [
        "Atendimento inicial finalizado e registrado.",
        "Qualquer atualização importante será enviada por este WhatsApp.",
      ],
      infoToCollect: ["Próximo retorno", "Pendências finais", "Canal confirmado"],
      objections: [],
      mediaSuggestions: [],
    },
  ],
};

export function getManualPlaybook(funnel?: { manual_playbook?: any } | null): ManualPlaybook {
  const candidate = funnel?.manual_playbook;
  if (candidate?.steps?.length) {
    return {
      ...DEFAULT_BPC_MANUAL_PLAYBOOK,
      ...candidate,
      steps: candidate.steps,
    };
  }
  return DEFAULT_BPC_MANUAL_PLAYBOOK;
}

export function getManualStep(playbook: ManualPlaybook, phase?: string | null) {
  const fallbackPhase = phase || "abertura";
  return playbook.steps.find(step => step.id === fallbackPhase)
    ?? playbook.steps.find(step => step.id === "abertura")
    ?? {
      id: fallbackPhase,
      label: FASE_LABELS[fallbackPhase] || "Atendimento",
      goal: "Conduzir o atendimento manual com clareza.",
      questions: [],
      quickReplies: [],
      infoToCollect: [],
      objections: [],
      mediaSuggestions: [],
    };
}

export function normalizeManualPlaybook(playbook?: ManualPlaybook) {
  const base = playbook ?? DEFAULT_BPC_MANUAL_PLAYBOOK;
  const known = new Set(base.steps.map(step => step.id));
  return {
    ...base,
    steps: [
      ...base.steps,
      ...FASES.filter(phase => !known.has(phase)).map(phase => ({
        id: phase,
        label: FASE_LABELS[phase] || phase,
        goal: "Conduzir esta etapa do atendimento.",
        questions: [],
        quickReplies: [],
        infoToCollect: [],
        objections: [],
        mediaSuggestions: [],
      })),
    ],
  };
}
