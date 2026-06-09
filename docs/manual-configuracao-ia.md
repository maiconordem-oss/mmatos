# Manual de configuracao da IA

Este manual mostra como configurar a IA do Lex CRM de forma simples, do WhatsApp ate o atendimento automatico.

## Objetivo

A IA deve fazer tres coisas bem:

1. Receber o lead pelo WhatsApp.
2. Conduzir o atendimento com perguntas claras.
3. Chamar um humano quando o caso ficar sensivel, confuso ou pronto para fechamento.

Evite configurar tudo de uma vez. Comece com um atendimento simples, teste, e so depois ative recursos avancados.

## 1. Conectar o WhatsApp

1. Acesse **Ajustes > Conectar WhatsApp**.
2. Clique para adicionar ou editar uma instancia.
3. Escolha se o numero sera:
   - **Numero de atendimento automatico**: a IA responde usando um atendimento configurado.
   - **Numero do escritorio**: a IA fica pausada e a equipe assume manualmente.
4. Se for atendimento automatico, selecione o atendimento IA que esse numero deve usar.
5. Salve e conecte pelo QR Code.
6. Aguarde o status ficar conectado.

Sem WhatsApp conectado, a IA pode ate ser configurada, mas nao consegue atender leads reais.

## 2. Criar ou escolher um atendimento IA

1. Acesse **Automacao > Atendimentos IA**.
2. Para comecar rapido, use um atendimento existente ou clique em **Novo funil**.
3. A tela abre no **Fluxo visual**. Monte o atendimento por blocos:
   - **Pergunta**: adiciona uma pergunta que a IA fara ao lead.
   - **Arquivo**: adiciona um video ou audio que a IA pode enviar.
   - **Acao**: abre a fase para escolher contrato, agendamento, grupo ou chamada humana.
4. Clique em qualquer fase para ajustar detalhes como script do video, respostas rapidas, criterios de exclusao e dados para contrato.
5. Defina:
   - **Nome do atendimento**: exemplo, `BPC/LOAS`, `Vaga em Creche`, `Auxilio-doenca`.
   - **Descricao**: explique para a equipe o objetivo daquele fluxo.
   - **Honorarios**: marque se o servico e gratuito para o cliente ou informe um valor fixo.
   - **Midias do funil**: opcional, para videos ou audios que a IA pode enviar.
   - **Horario de atendimento**: defina quando a IA deve responder.
   - **Follow-up automatico**: defina em quantas horas/dias o sistema tenta reativar o lead.
6. Salve.

Recomendacao: crie primeiro apenas um atendimento principal e deixe ele como padrao.

## 3. Informar o que a IA precisa saber

1. Acesse **Automacao > Informacoes da IA**.
2. Cadastre informacoes simples do escritorio, como:
   - Areas atendidas.
   - Cidades atendidas.
   - Valores ou regras de honorarios.
   - Documentos necessarios.
   - Perguntas frequentes.
   - Casos que o escritorio nao atende.
3. Mantenha cada item curto e objetivo.
4. Deixe ativo apenas o que a IA deve usar nas respostas.

Exemplo de item:

```text
Titulo: Documentos para BPC/LOAS
Conteudo: Para analise inicial de BPC/LOAS, pedir RG, CPF, comprovante de residencia, laudos medicos, receitas, exames e numero do processo ou protocolo no INSS, se existir.
Tags: bpc, documentos, inss
```

## 4. Configurar o comportamento da IA

No atendimento IA, abra **Configuracoes avancadas** somente se precisar ajustar o comportamento tecnico.

Use essa area para:

- Editar o prompt completo da persona.
- Configurar ZapSign.
- Configurar Google Agenda.
- Criar grupo automatico de WhatsApp.
- Ativar teste A/B.
- Configurar roteiro manual visual.
- Ajustar follow-ups pos-consulta.

Se voce nao tem certeza do que uma opcao faz, deixe como esta.

## 5. Prompt da persona

O prompt e a instrucao principal da IA. Ele deve dizer:

- Quem a IA representa.
- Qual area juridica esta atendendo.
- Qual tom usar.
- Quais perguntas fazer.
- Quais limites respeitar.
- Quando chamar humano.
- Quais fases do atendimento seguir.

Modelo simples:

```text
Voce e o Dr. Maicon Matos, advogado. Atenda pelo WhatsApp com linguagem simples, cordial e objetiva.

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
5. Coletar dados para proposta ou contrato quando fizer sentido.
```

## 6. Quando a IA deve chamar humano

Configure o atendimento para chamar humano quando ocorrer qualquer uma destas situacoes:

- Cliente pede para falar com pessoa real.
- Cliente esta irritado ou ameaca reclamar.
- Cliente pede garantia de resultado.
- Cliente pergunta algo juridico complexo.
- Cliente quer negociar honorarios.
- Cliente enviou documentos importantes.
- Caso esta pronto para contrato.
- IA ficou insegura ou repetitiva.

O sistema tambem tem protecoes para pausar a IA em loops ou palavras sensiveis.

## 7. Testar antes de usar com leads reais

1. Va em **Automacao > Atendimentos IA**.
2. Clique em **Simular** no atendimento escolhido.
3. Teste mensagens como:
   - `oi`
   - `quero saber sobre BPC`
   - `quanto custa?`
   - `voce garante que eu ganho?`
   - `quero falar com uma pessoa`
4. Verifique se a IA:
   - Responde com clareza.
   - Faz uma pergunta por vez.
   - Nao promete resultado.
   - Chama humano quando deve.
   - Avanca no atendimento sem travar.

So conecte leads reais depois de testar o fluxo inteiro.

## 8. Acompanhar atendimentos

1. Acesse **Atendimento > Atendimentos**.
2. Veja as conversas recebidas.
3. Use **Pausar IA** quando a equipe assumir.
4. Use **Retomar IA** quando quiser que o atendimento automatico volte.
5. Use respostas prontas e sugestoes da IA apenas como apoio.

Regra pratica: a IA deve ajudar a equipe, nao esconder conversas importantes.

## 9. Configuracao recomendada para comecar

Para o primeiro uso em producao:

- 1 numero de WhatsApp conectado.
- 1 atendimento IA padrao.
- 3 a 5 informacoes na base da IA.
- Sem teste A/B.
- Sem Google Agenda.
- Sem grupo automatico.
- Sem ZapSign automatico, se ainda nao tiver contrato testado.
- Follow-up em 48 horas.
- Pausa humana ativada.

Depois que o atendimento estiver estavel, ative recursos avancados um por vez.

## 10. Checklist final

Antes de divulgar o WhatsApp:

- [ ] WhatsApp conectado.
- [ ] Atendimento IA ativo.
- [ ] Atendimento definido como padrao ou vinculado ao numero.
- [ ] Base de informacoes preenchida.
- [ ] Prompt revisado.
- [ ] Simulacao testada.
- [ ] IA chama humano em casos sensiveis.
- [ ] Follow-up configurado.
- [ ] Equipe sabe pausar e retomar IA no Inbox.

## Problemas comuns

### A IA nao responde

Verifique:

- O WhatsApp esta conectado.
- A conversa nao esta com IA pausada.
- O numero nao foi marcado como numero do escritorio.
- O atendimento IA esta ativo.
- Existe atendimento vinculado ao numero ou um atendimento padrao.

### A IA responde de forma confusa

Verifique:

- O prompt esta grande demais ou contraditorio.
- A base de informacoes tem itens duplicados.
- O atendimento tem muitas midias ou acoes avancadas.
- O fluxo pede muitas informacoes na mesma etapa.

### A IA promete resultado

Inclua no prompt:

```text
Nunca prometa resultado, prazo judicial ou decisao favoravel. Explique possibilidades com cautela e chame humano em duvida juridica complexa.
```

### A IA nao chama humano

Inclua no prompt:

```text
Se o cliente pedir pessoa real, garantia, desconto, prazo exato, analise juridica complexa ou demonstrar irritacao, acione transferencia para humano.
```

## Boa configuracao e simples

Uma boa IA nao precisa de muitas telas. Ela precisa de:

- Um objetivo claro.
- Poucas perguntas boas.
- Limites bem definidos.
- Um jeito facil de chamar humano.

Quanto mais simples o atendimento, mais facil testar, corrigir e confiar.
