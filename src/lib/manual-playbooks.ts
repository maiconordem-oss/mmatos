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
  name: "Fluxo manual BPC/LOAS",
  description: "Roteiro visual para atendimento manual no WhatsApp, com etapas de SDR, closer, coleta, assinatura e acompanhamento.",
  steps: [
    {
      id: "abertura",
      label: "SDR - Abertura",
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
      label: "SDR - Triagem",
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
      label: "Closer - Conexão",
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
      label: "Closer - Fechamento",
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
      label: "Backoffice - Coleta de dados",
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
      label: "Backoffice - Assinatura",
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
      label: "Acompanhamento - Encerrado",
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

export const DEFAULT_PREVIDENCIARIO_MANUAL_PLAYBOOK: ManualPlaybook = {
  area: "previdenciario",
  name: "Protocolo de Concessões Máximas",
  description: "Roteiro de atendimento previdenciário baseado no Protocolo de Concessões Máximas — cobre aposentadorias, benefícios por incapacidade, pensão por morte, salário-maternidade, auxílio-reclusão e BPC.",
  steps: [
    {
      id: "abertura",
      label: "SDR - Identificação da Dor",
      goal: "Identificar o fato gerador previdenciário (dor) do cliente para direcionar ao fluxo correto.",
      questions: [
        "Olá, tudo bem? Para eu te orientar da melhor forma, me conta: o atendimento é sobre aposentadoria, alguma doença ou acidente, falecimento de familiar, ou outro assunto?",
        "O pedido é para você ou para outra pessoa?",
        "Qual cidade a pessoa mora hoje?",
      ],
      quickReplies: [
        "Vou te fazer algumas perguntas rápidas para entender se existe direito ao benefício e qual é o melhor caminho.",
        "Pode me responder com calma, uma pergunta de cada vez.",
      ],
      infoToCollect: ["Fato gerador / tipo de benefício", "Quem é o requerente", "Cidade"],
      objections: [],
      mediaSuggestions: [
        {
          key: "audio_abertura_prev",
          title: "Áudio de boas-vindas previdenciário",
          type: "audio",
          script: "Olá! Vou te ajudar a entender se existe direito ao benefício e qual é o caminho mais rápido. Me conta o que aconteceu.",
        },
      ],
    },
    {
      id: "incapacidade",
      label: "SDR - Benefício por Incapacidade",
      goal: "Coletar as informações determinantes para avaliar auxílio por incapacidade temporária ou aposentadoria por incapacidade permanente.",
      questions: [
        "A pessoa está afastada do trabalho atualmente?",
        "Sofreu algum tipo de acidente, seja no trabalho ou fora dele?",
        "Possui alguma doença que impede de trabalhar? Se sim, qual é o diagnóstico?",
        "Está contribuindo para o INSS atualmente? Tem carteira assinada ou contribui como autônomo?",
        "Qual foi a última vez que trabalhou com contribuição ao INSS?",
        "Já recebeu algum benefício do INSS antes? Foi negado ou cancelado?",
      ],
      quickReplies: [
        "Essas informações vão mostrar se existe carência suficiente e se o afastamento é reconhecível pelo INSS.",
        "Mesmo quem foi negado antes pode ter caminho pela via judicial com a tese correta.",
      ],
      infoToCollect: ["Afastamento", "Acidente ou doença", "CID/diagnóstico", "Situação contributiva", "Última contribuição", "Histórico de benefícios no INSS"],
      objections: [
        {
          label: "O INSS já negou",
          reply: "A negativa do INSS não encerra o assunto. Muitas vezes o problema está nos documentos médicos ou na análise incompleta. Pela via judicial ainda é possível reverter.",
        },
        {
          label: "Só tenho poucos meses de contribuição",
          reply: "Existem casos em que a carência é dispensada — por exemplo, acidente de qualquer natureza ou doenças graves. Preciso entender melhor o diagnóstico para saber se se encaixa.",
        },
      ],
      mediaSuggestions: [
        {
          key: "video_incapacidade_requisitos",
          title: "Vídeo — requisitos do auxílio por incapacidade",
          type: "video",
          script: "Explique em linguagem simples: o benefício exige doença ou acidente, afastamento há mais de 15 dias, carência de 12 meses (salvo dispensa) e qualidade de segurado.",
        },
      ],
    },
    {
      id: "pensao_morte",
      label: "SDR - Pensão por Morte",
      goal: "Coletar as informações determinantes para avaliar a concessão de pensão por morte.",
      questions: [
        "Qual é a relação com a pessoa que faleceu? (cônjuge, filho, companheiro, pai/mãe?)",
        "Quando ocorreu o falecimento?",
        "O falecido deixou filhos menores ou dependentes?",
        "O falecido estava aposentado pelo INSS ou por regime próprio?",
        "Estava trabalhando com contribuição ao INSS antes de falecer?",
        "O óbito decorreu de acidente ou de doença?",
        "Já foi feito algum pedido de pensão por morte no INSS? Foi negado?",
      ],
      quickReplies: [
        "Para a pensão por morte, o mais importante é comprovar o vínculo com o falecido e que ele tinha qualidade de segurado na data do óbito.",
        "Mesmo que o falecido estivesse desempregado, pode haver o chamado 'período de graça' que mantém o direito ao benefício.",
      ],
      infoToCollect: ["Relação com o falecido", "Data do óbito", "Dependentes", "Situação previdenciária do falecido", "Causa do óbito", "Histórico de pedidos no INSS"],
      objections: [
        {
          label: "O falecido estava desempregado",
          reply: "Mesmo desempregado, pode haver período de graça de 12 a 36 meses que mantém a qualidade de segurado. Preciso saber quando ele trabalhou pela última vez.",
        },
        {
          label: "Não tenho documentos do falecido",
          reply: "O CNIS do falecido pode ser acessado com autorização judicial. Com o CPF dele já conseguimos verificar o histórico contributivo.",
        },
      ],
      mediaSuggestions: [
        {
          key: "audio_pensao_morte",
          title: "Áudio — documentos para pensão por morte",
          type: "audio",
          script: "Explique que a pensão exige prova do vínculo (certidão de casamento, nascimento ou comprovação de união estável) e que o falecido tinha qualidade de segurado.",
        },
      ],
    },
    {
      id: "salario_maternidade",
      label: "SDR - Salário-Maternidade",
      goal: "Coletar as informações determinantes para avaliar o salário-maternidade.",
      questions: [
        "Quando ocorreu o parto ou a adoção?",
        "Em caso de adoção, a criança tem no máximo 12 anos?",
        "A mãe ou adotante estava trabalhando quando a gestação ou adoção teve início?",
        "Estava contribuindo para o INSS nos meses anteriores ao parto ou à adoção?",
        "Já foi feito pedido administrativo para o INSS? Foi negado?",
      ],
      quickReplies: [
        "O salário-maternidade para empregada com carteira assinada é pago pela empresa, não pelo INSS diretamente — mas o INSS reembolsa.",
        "Para autônoma ou contribuinte individual, o benefício exige 10 meses de contribuição antes do parto.",
      ],
      infoToCollect: ["Data do parto ou adoção", "Idade da criança (adoção)", "Situação de trabalho", "Contribuições anteriores", "Histórico de pedidos"],
      objections: [
        {
          label: "Já voltei a trabalhar",
          reply: "O prazo para pedir retroativamente existe. Verifique se ainda está no período de 5 anos a contar do parto.",
        },
        {
          label: "Fui demitida durante a gestação",
          reply: "Demissão durante a gestação gera direito à estabilidade e ao salário-maternidade. São casos diferentes que podem ser tratados juntos.",
        },
      ],
      mediaSuggestions: [],
    },
    {
      id: "auxilio_reclusao",
      label: "SDR - Auxílio-Reclusão",
      goal: "Coletar as informações determinantes para avaliar o auxílio-reclusão.",
      questions: [
        "O preso está recolhido em regime fechado atualmente?",
        "Quando ocorreu a prisão em regime fechado?",
        "O preso estava trabalhando com contribuição ao INSS nos 12 meses anteriores à prisão?",
        "Se trabalhou, qual era o salário mensal aproximado?",
        "Qual é a relação com o preso? (cônjuge, companheiro, filho, pai, mãe?)",
        "Já foi feito algum pedido de auxílio-reclusão no INSS?",
      ],
      quickReplies: [
        "O auxílio-reclusão exige que o preso estivesse em regime fechado e que tivesse qualidade de segurado de baixa renda na data da prisão.",
        "Os dependentes que têm direito são: cônjuge ou companheiro, filhos menores e, em alguns casos, pais e irmãos.",
      ],
      infoToCollect: ["Regime de prisão", "Data da prisão", "Histórico contributivo do preso", "Salário anterior", "Relação do requerente com o preso", "Histórico de pedidos"],
      objections: [
        {
          label: "O preso nunca teve carteira assinada",
          reply: "Se nunca contribuiu ao INSS, infelizmente o direito ao auxílio-reclusão fica prejudicado, pois exige qualidade de segurado.",
        },
        {
          label: "Passou para regime semiaberto",
          reply: "A mudança para regime semiaberto ou aberto geralmente encerra o auxílio-reclusão, mas os valores pagos indevidamente nem sempre precisam ser devolvidos.",
        },
      ],
      mediaSuggestions: [],
    },
    {
      id: "aposentadoria_programada",
      label: "SDR - Aposentadoria Programada",
      goal: "Coletar as informações determinantes para avaliar aposentadoria por idade, tempo de contribuição ou regras de transição.",
      questions: [
        "Qual é a idade atual do segurado?",
        "Possui carteira de trabalho assinada ou contribui de outra forma ao INSS?",
        "Ainda está trabalhando atualmente?",
        "Desde quando trabalha ou contribui para o INSS? (mesmo que parcialmente)",
        "O trabalho é na cidade ou no meio rural?",
        "Trabalha ou já trabalhou exposto a agentes nocivos como ruído intenso, produtos químicos, calor extremo ou agentes biológicos?",
        "Já foi feito algum pedido de aposentadoria no INSS? Foi negado?",
      ],
      quickReplies: [
        "Com essas informações consigo verificar qual regra de aposentadoria se aplica: a regra atual, uma das regras de transição ou o direito adquirido antes da Reforma de 2019.",
        "Trabalho rural e exposição a agentes nocivos podem acrescentar tempo ao histórico e antecipar a aposentadoria.",
      ],
      infoToCollect: ["Idade", "Forma de contribuição", "Situação de trabalho atual", "Início das contribuições", "Urbano ou rural", "Exposição a agentes nocivos", "Histórico de pedidos"],
      objections: [
        {
          label: "Acho que não tenho tempo suficiente",
          reply: "Talvez tenha períodos não registrados no CNIS: trabalho rural, serviço militar ou tempo especial. Preciso ver o extrato completo para confirmar.",
        },
        {
          label: "Já fui negado pelo INSS",
          reply: "A negativa pode ter ignorado períodos rurais, trabalho informal comprovável ou exposição a agentes nocivos. Há muito espaço para reverter pela via judicial.",
        },
        {
          label: "Ainda não tenho idade suficiente",
          reply: "Dependendo do histórico, pode haver uma regra de transição mais favorável ou a possibilidade de planejamento previdenciário para antecipar a aposentadoria.",
        },
      ],
      mediaSuggestions: [
        {
          key: "video_aposentadoria_regras",
          title: "Vídeo — regras de aposentadoria 2026",
          type: "video",
          script: "Explique as modalidades: aposentadoria por idade (65H/62M), por tempo de contribuição com direito adquirido, regras de transição da EC 103 e aposentadoria especial.",
        },
      ],
    },
    {
      id: "bpc_deficiente",
      label: "SDR - BPC Deficiente",
      goal: "Coletar as informações determinantes para avaliar o BPC para pessoa com deficiência.",
      questions: [
        "O requerente possui algum tipo de doença diagnosticada ou deficiência?",
        "Sofreu algum tipo de acidente que gerou sequela permanente?",
        "Nasceu com ou desenvolveu alguma deficiência física, mental, intelectual ou sensorial?",
        "O requerente já trabalhou alguma vez na vida?",
        "Já foi afastado do trabalho por motivo de saúde?",
        "Já contribuiu para o INSS alguma vez?",
        "Está trabalhando ou contribuindo ao INSS atualmente?",
        "Possui alguma fonte de renda própria?",
        "Quantas pessoas moram na mesma casa?",
        "Alguém da família possui renda? Qual o valor aproximado?",
        "Faz uso de medicamento especial, alimentação especial ou fraldas geriátricas?",
        "Possui CadÚnico? Se sim, sabe informar o NIS?",
        "Já foi feito algum pedido de BPC no INSS? Foi negado ou suspenso?",
      ],
      quickReplies: [
        "O BPC para deficiente exige comprovação da deficiência e que a renda familiar per capita não ultrapasse 1/4 do salário mínimo.",
        "Mesmo negado antes, é possível tentar novamente com documentação médica atualizada ou critérios socioeconômicos mais detalhados.",
      ],
      infoToCollect: ["Diagnóstico ou deficiência", "Histórico de trabalho e contribuição", "Renda própria", "Composição e renda familiar", "CadÚnico/NIS", "Uso de itens especiais", "Histórico de pedidos"],
      objections: [
        {
          label: "A renda da família passa do limite",
          reply: "O critério de 1/4 do salário mínimo pode ser flexibilizado pelo juiz quando há gastos extras com medicamentos, fraldas ou cuidados especiais. Não descarte o caso sem análise.",
        },
        {
          label: "O médico disse que não é grave o suficiente",
          reply: "O laudo médico para BPC avalia impedimento de longo prazo para participação na sociedade, não só gravidade clínica. Um bom relatório faz diferença.",
        },
      ],
      mediaSuggestions: [
        {
          key: "video_bpc_deficiente",
          title: "Vídeo — BPC deficiente: requisitos",
          type: "video",
          script: "Explique: BPC não é aposentadoria, exige deficiência de longo prazo, baixa renda familiar e laudo específico. Não precisa ter contribuído ao INSS.",
        },
      ],
    },
    {
      id: "bpc_idoso",
      label: "SDR - BPC Idoso",
      goal: "Coletar as informações determinantes para avaliar o BPC para pessoa idosa.",
      questions: [
        "O requerente tem 65 anos ou mais?",
        "Está trabalhando atualmente?",
        "Possui alguma fonte de renda (aposentadoria, pensão, aluguel, etc.)?",
        "Quantas pessoas moram na mesma casa?",
        "Alguém da família possui renda? Qual o valor aproximado?",
        "Faz uso de medicamento especial, alimentação especial ou fraldas geriátricas?",
        "Possui CadÚnico atualizado?",
        "Já foi feito algum pedido de BPC no INSS? Foi negado?",
      ],
      quickReplies: [
        "O BPC para idoso exige 65 anos ou mais e renda familiar per capita de até 1/4 do salário mínimo.",
        "Quem recebe apenas o salário mínimo de aposentadoria não tem direito ao BPC idoso, mas outros membros da família podem ter.",
      ],
      infoToCollect: ["Idade", "Renda própria", "Composição familiar", "Renda familiar", "CadÚnico", "Gastos especiais", "Histórico de pedidos"],
      objections: [
        {
          label: "Já recebe uma aposentadoria pequena",
          reply: "Quem já recebe benefício previdenciário do INSS normalmente não tem direito ao BPC idoso, pois as rendas se sobrepõem. Mas vale confirmar os valores.",
        },
        {
          label: "A renda familiar passa do limite",
          reply: "Assim como no BPC para deficiente, despesas com saúde e cuidados especiais podem ser consideradas para flexibilizar o critério de renda pelo juiz.",
        },
      ],
      mediaSuggestions: [],
    },
    {
      id: "tese_vencedora",
      label: "Closer - Identificação da Tese Vencedora",
      goal: "Identificar cenários de ameaça e oportunidade no histórico previdenciário e definir a tese vencedora antes de fechar o contrato.",
      questions: [
        "Vou verificar agora o CNIS (extrato do INSS). Você consegue acessar o Meu INSS ou prefere que eu ajude a buscar?",
        "Existe algum período de trabalho que não está no CNIS? (trabalho rural, serviço informal, período no exterior?)",
        "Houve trabalho em empresa que faliu ou fechou sem registrar corretamente?",
        "Fez serviço militar obrigatório? Em qual período?",
        "Existe algum processo administrativo ou judicial anterior sobre esse mesmo assunto?",
      ],
      quickReplies: [
        "Com o CNIS em mãos, consigo identificar períodos que podem estar faltando e que mudam o resultado do caso.",
        "Qualquer inconsistência no CNIS é uma oportunidade que o INSS normalmente ignora, mas que pode ser corrigida.",
      ],
      infoToCollect: ["CNIS do requerente", "Períodos não registrados", "Empresas extintas", "Serviço militar", "Processos anteriores"],
      objections: [
        {
          label: "Não sei como acessar o Meu INSS",
          reply: "Posso te orientar passo a passo para acessar o Meu INSS e baixar o extrato. Ou, com uma procuração, posso acessar por você.",
        },
      ],
      mediaSuggestions: [
        {
          key: "audio_cnis_instrucoes",
          title: "Áudio — como acessar o CNIS no Meu INSS",
          type: "audio",
          script: "Explique o passo a passo para acessar o Meu INSS, criar login gov.br e baixar o extrato previdenciário completo.",
        },
      ],
    },
    {
      id: "coleta",
      label: "Backoffice - Coleta de Documentos",
      goal: "Receber documentos em blocos organizados conforme o tipo de benefício identificado.",
      questions: [
        "Me envie primeiro um documento com foto e CPF do requerente (RG ou CNH).",
        "Agora envie comprovante de residência atualizado.",
        "Se tiver carteira de trabalho, pode tirar foto das páginas com dados pessoais e todos os registros de emprego.",
        "Envie o extrato do CNIS baixado no Meu INSS (pode ser print ou PDF).",
        "Se houver documentos específicos do benefício (laudos, certidão de óbito, PPP, documentos rurais), envie agora.",
        "Se já houve pedido no INSS, envie a carta de indeferimento ou o protocolo.",
      ],
      quickReplies: [
        "Recebi. Pode mandar o próximo documento.",
        "Esse documento está ótimo. Vou registrar aqui.",
        "Se estiver em foto, tente enviar bem legível, sem reflexo e sem cortar as bordas.",
      ],
      infoToCollect: ["RG/CPF", "Comprovante de residência", "Carteira de trabalho", "CNIS", "Documentos específicos do benefício", "Indeferimento ou protocolo do INSS"],
      objections: [
        {
          label: "Não tenho todos os documentos",
          reply: "Comece pelo que tiver. Com o básico já consigo iniciar a análise e indicar o que ainda precisa ser providenciado.",
        },
        {
          label: "Perdi a carteira de trabalho",
          reply: "Sem a carteira de trabalho física, o CNIS já traz o histórico de vínculos formais. Para períodos informais, buscamos outras provas.",
        },
      ],
      mediaSuggestions: [
        {
          key: "video_documentos_prev",
          title: "Vídeo — lista de documentos previdenciários",
          type: "video",
          script: "Mostre a lista em ordem por tipo de benefício: identidade, residência, CNIS, CTPS, documentos específicos e negativa do INSS se houver.",
        },
      ],
    },
    {
      id: "fechamento",
      label: "Closer - Fechamento do Contrato",
      goal: "Confirmar o interesse do cliente, apresentar o parecer inicial e fechar contrato e procuração.",
      questions: [
        "Com base no que me informou, identificamos o seguinte caminho para o caso. Faz sentido avançarmos?",
        "Vou te enviar o contrato de honorários e a procuração para assinatura. Consegue abrir o link pelo celular?",
        "Após assinar, me avise por aqui para eu confirmar o recebimento.",
      ],
      quickReplies: [
        "O contrato deixa claro todos os valores, condições e o que o escritório vai fazer por você.",
        "Nenhum valor será cobrado sem que você entenda e concorde com tudo antes.",
      ],
      infoToCollect: ["Confirmação do interesse", "Assinatura do contrato", "Assinatura da procuração", "Dúvidas sobre honorários"],
      objections: [
        {
          label: "Não tenho dinheiro agora",
          reply: "Muitos casos previdenciários são trabalhados com honorários de êxito, ou seja, você só paga quando recebe. Posso te explicar as condições.",
        },
        {
          label: "Quero pensar mais",
          reply: "Sem problema. Deixo aqui o resumo do que identificamos e fico à disposição quando quiser retomar.",
        },
        {
          label: "Tenho receio de assinar online",
          reply: "É totalmente compreensível. O link de assinatura é seguro e você pode ler tudo antes de assinar. Qualquer dúvida me pergunte antes.",
        },
      ],
      mediaSuggestions: [
        {
          key: "audio_honorarios_prev",
          title: "Áudio — como funcionam os honorários",
          type: "audio",
          script: "Explique as modalidades: honorários de êxito (percentual sobre retroativos), honorários fixos para planejamento, e que nenhuma cobrança ocorre sem aprovação do cliente.",
        },
      ],
    },
    {
      id: "encerrado",
      label: "Acompanhamento - Encerrado",
      goal: "Encerrar o atendimento inicial e manter o cliente informado sobre os próximos passos.",
      questions: [
        "Tudo registrado por aqui. Qualquer novidade do INSS, decisão judicial ou documento novo, me envie por este WhatsApp.",
        "Vou manter você informado sobre os andamentos do caso.",
      ],
      quickReplies: [
        "Atendimento inicial concluído e caso registrado no sistema.",
        "Qualquer atualização relevante será enviada por aqui.",
      ],
      infoToCollect: ["Próximo retorno", "Pendências finais", "Canal de comunicação confirmado"],
      objections: [],
      mediaSuggestions: [],
    },
  ],
};

export const PLAYBOOK_BY_AREA: Record<string, ManualPlaybook> = {
  bpc_loas: DEFAULT_BPC_MANUAL_PLAYBOOK,
  previdenciario: DEFAULT_PREVIDENCIARIO_MANUAL_PLAYBOOK,
};

export function getManualPlaybook(funnel?: { manual_playbook?: any; area?: string | null } | null): ManualPlaybook {
  const candidate = funnel?.manual_playbook;
  if (candidate?.steps?.length) {
    return {
      ...DEFAULT_BPC_MANUAL_PLAYBOOK,
      ...candidate,
      steps: candidate.steps,
    };
  }
  if (funnel?.area && PLAYBOOK_BY_AREA[funnel.area]) {
    return PLAYBOOK_BY_AREA[funnel.area];
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
