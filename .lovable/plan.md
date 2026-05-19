# Melhorias — Inbox & Agente IA

Foco em transformar o atendimento em algo mais rápido, inteligente e com menos cliques. Dividi em 3 ondas para você escolher por onde começar (ou aprovar tudo).

---

## Onda 1 — Produtividade no Inbox (rápido, alto impacto)

1. **Respostas rápidas / Templates**
   - Tabela `message_templates` (atalho `/`, título, conteúdo, variáveis `{{nome}}`, `{{processo}}`).
   - Menu `/` dentro do input do Inbox com busca fuzzy.
   - Variáveis preenchidas automaticamente com dados do cliente/conversa.

2. **Busca global no Inbox**
   - Campo de busca que pesquisa em conversas + mensagens + clientes.
   - Filtros: não lidas, com IA, sem resposta há X horas, por etiqueta, por advogado.

3. **Etiquetas (tags) de conversa**
   - Tabela `conversation_tags` com cor.
   - Aplicar/remover via menu, exibir como chips no card e no header.

4. **Sinalizadores rápidos**
   - Marcar como "Importante", "Aguardando cliente", "Aguardando advogado".
   - Ordenação e filtros usam esses estados.

5. **Agendar envio de mensagem**
   - Tabela `scheduled_messages` + cron tick (reaproveita `workflow-tick`) que dispara no horário.

6. **Anotações internas na conversa**
   - Aba "Notas" lateral, mensagens privadas que não vão para o cliente.

---

## Onda 2 — Agente IA mais inteligente

1. **Memória por cliente**
   - Tabela `client_memory` (fatos persistidos: área de interesse, processos, preferências, dores).
   - Cada resposta da IA atualiza e consulta essa memória → para de "esquecer" entre conversas.

2. **Base de conhecimento do escritório (RAG simples)**
   - Tabela `kb_documents` (perguntas frequentes, valores, áreas atendidas, horários, endereço).
   - Editor em `/configuracoes` para adicionar trechos.
   - Antes de responder, IA busca trechos relevantes (match textual / embeddings opcionais) e injeta no system prompt.

3. **Sugestões de resposta em tempo real (copiloto)**
   - Em qualquer mensagem recebida, painel lateral mostra 2–3 sugestões de resposta geradas pela IA.
   - Atendente clica → vai para o input → edita → envia. Não envia sozinho.

4. **Análise de sentimento + alertas**
   - Para cada mensagem inbound, classifica: neutro / positivo / negativo / urgente.
   - Conversa com sentimento negativo ou palavras-chave ("processar", "reclamar", "PROCON") destaca em vermelho e notifica.

5. **Resumo automático da conversa**
   - Botão "Resumir" gera bullets com: objetivo do cliente, fatos relevantes, próximo passo recomendado, área jurídica.
   - Salvo na conversa para o advogado abrir e entender em 10s.

6. **Handoff humano explícito**
   - Toggle "IA ligada / desligada" por conversa (já existe `ai_handled` — virar UI clara).
   - Quando IA detecta que não consegue resolver (confiança baixa, pedido de humano, tema fora da base), desliga sozinha e marca "Precisa de humano".

7. **Entendimento de mídia**
   - Áudio: transcrição já existe — passar a transcrição automaticamente para o contexto da IA (hoje precisa clicar).
   - Imagem/PDF: usar Gemini multimodal para extrair texto/descrição (contratos enviados, prints de processo, comprovantes).

8. **Horário comercial + fora-do-ar**
   - Configuração de horário por dia da semana.
   - Fora do horário: IA responde com mensagem configurável + agenda retorno + cria tarefa.

---

## Onda 3 — Qualidade e operação

1. **Métricas do atendimento** (em `/relatorios`)
   - Tempo médio de primeira resposta, % respondido pela IA, taxa de conversão lead → cliente, conversas por etiqueta/área.

2. **Logs de IA por conversa**
   - Aba "Debug IA": prompt enviado, modelo, custo estimado, latência, resposta. Ajuda a refinar prompts.

3. **A/B de prompts**
   - Versionar o prompt do qualificador, ver qual converte mais.

4. **Limites de segurança**
   - Rate limit por conversa (IA não responde mais que N msgs seguidas sem humano), proteção contra loops, lista de palavras proibidas.

---

## Detalhes técnicos

- **Backend**: tudo em `createServerFn` em `src/server/*.functions.ts`. Sem novas Edge Functions.
- **IA**: Lovable AI Gateway, modelo padrão `google/gemini-3-flash-preview`; trocar para `gemini-2.5-pro` em resumo/sentimento se precisar mais qualidade.
- **Banco**: novas tabelas com RLS por `user_id`. Reaproveitar `phone.ts` para normalização.
- **Realtime**: sugestões e sentimento publicados via canal Supabase para atualizar a UI sem refresh.
- **Cron**: `scheduled_messages` e fora-do-horário usam tick já existente.

---

## Como prosseguir

Me diga uma destas opções:
- **"Onda 1"** → começo pela produtividade do Inbox (templates, busca, tags, agendar envio).
- **"Onda 2"** → começo pela inteligência (memória + base de conhecimento + copiloto + sentimento).
- **"Tudo"** → executo na ordem (1 → 2 → 3) em entregas separadas.
- **"Só os itens X, Y, Z"** → lista os números que quer priorizar.