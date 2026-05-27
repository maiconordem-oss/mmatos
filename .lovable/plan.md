
# Modernização do sistema de atendimento por IA

Plano incremental, sem quebrar fluxos atuais. Backend migra para **AI SDK + tools tipadas** e frontend ganha uma **Inbox moderna estilo Intercom/Front**. As duas trilhas avançam em paralelo, onda por onda.

---

## Princípios

- Reaproveitar `funnel-executor`, `workflow-executor`, `whatsapp-webhook`, `inbox.tsx` — refator cirúrgico, não reescrita.
- Toda chamada de IA passa a usar o helper `createLovableAiGatewayProvider` (AI SDK) — substitui `fetch` manual + parser frágil de JSON.
- Banco preservado: só migrations aditivas (índices, colunas novas, nada de drop).
- Cada onda termina funcional e testável de ponta a ponta.

---

## Onda 1 — Núcleo do atendimento (backend) + skeleton da nova Inbox (frontend)

**Backend (`src/server/ai-core.server.ts` novo, refator de `funnel-executor.server.ts`):**
- Criar helper único `src/lib/ai-gateway.server.ts` com `createLovableAiGatewayProvider` (AI SDK + `@ai-sdk/openai-compatible`).
- Novo módulo `ai-core.server.ts` com 3 funções centralizadas usadas por funil/qualifier/workflow:
  - `generateFunnelReply(ctx)` → `generateText` + `tool({ name: "funnel_reply", inputSchema })` com `tool_choice` forçado. Fim do parser frágil.
  - `classifyArea(text)` → `Output.object` Zod.
  - `transcribeAudio(url)` → via Gemini multimodal pelo gateway (sem mais `LOVABLE_API_KEY` como chave Google).
- Plugar no `handleFunnelMessage`:
  - `checkSafety` (palavras proibidas + needs_human) **antes** da resposta.
  - `acquireLock` / `releaseLock` em try/finally (race condition).
  - `ai_debug_logs` em toda chamada (latência, modelo, tokens, decisão).
  - `incrementAICounter` + cap de mensagens consecutivas.

**Frontend (`src/routes/inbox.tsx`):**
- Refatorar layout para 3 zonas reais:
  - **Coluna 1**: lista de conversas com filtros (Todas / IA / Humano / Pendentes).
  - **Coluna 2**: thread com bubbles modernos (assistant sem fundo, user com `primary`), markdown, timestamps agrupados.
  - **Coluna 3**: novo **painel de contexto** (placeholder com tabs: Cliente / IA / Funil) — preenchido nas ondas 2-3.
- Reaproveitar componentes shadcn (`Tabs`, `Card`, `ScrollArea`, `Badge`). Sem nova lib de UI.

---

## Onda 2 — Memória do cliente + contexto inteligente

**Backend:**
- Injetar `client_memory.summary` + `interests` + `pains` no `personaPrompt` do funil (bloco "CONTEXTO DO CLIENTE").
- `updateClientMemory` fire-and-forget a cada 5 mensagens inbound OU em mudança de fase.
- Para `messages.count > 40`: substituir histórico bruto por `conversation_summaries.summary` + últimas 15 msgs.
- Migration aditiva: índice em `client_memory(client_id)`, coluna `last_synced_at`.

**Frontend (painel de contexto, coluna 3):**
- Tab **Cliente**: nome, área jurídica, dores, interesses, preferências — editáveis inline.
- Botão "🔄 Atualizar memória agora" chamando `updateClientMemory`.
- Timeline de fatos extraídos (com data e fonte).

---

## Onda 3 — Observabilidade e controle

**Backend:**
- `aiMetrics` filtrado por `ai_handled = true` ou presença em `ai_debug_logs`.
- `classifyAndPersistSentiment` só quando `text.length >= 8` e sem palavras-chave críticas (corta ~60% de chamadas).
- Consolidar horário comercial: `business_hours` é fonte única; `funnels.working_hours_*` vira override opcional.
- Endpoint `/api/internal/ai-replay` para reexecutar uma mensagem com prompt novo (debug).

**Frontend:**
- Tab **IA** no painel de contexto: últimos 10 `ai_debug_logs` da conversa, badge de confiança, prompt usado, tempo de resposta.
- Botão "🛑 Pausar IA" / "▶ Retomar IA" inline (já existe lógica, só faltam controles visíveis).
- Página `/ia-debug`: filtro por conversa + replay button.
- Redesign do `/configuracoes` aba IA: cards visuais de safety, A/B, limites.

---

## Onda 4 — Polimento e qualidade

- Tab **Funil** no painel: nó atual, próximos passos, contexto da execução.
- Sugestões inline na thread ("A IA sugere responder: …" + botão "Enviar").
- Markdown + atalhos no composer (`/sugerir`, `/pausar`, `/handoff`).
- Notificações em tempo real (já temos realtime habilitado em `messages`).
- Limpeza: remover `qualifierReply` (órfão) ou redirecioná-lo para `ai-core`.

---

## Detalhes técnicos

### Arquivos novos
```text
src/lib/ai-gateway.server.ts         # provider helper AI SDK
src/server/ai-core.server.ts         # generateFunnelReply, classifyArea, transcribeAudio
src/components/inbox/ContextPanel.tsx
src/components/inbox/ClientMemoryTab.tsx
src/components/inbox/AIDebugTab.tsx
src/components/inbox/FunnelTab.tsx
src/components/inbox/MessageBubble.tsx
src/components/inbox/ConversationList.tsx
src/routes/api/internal/ai-replay.ts
```

### Arquivos refatorados (cirúrgicos)
```text
src/server/funnel-executor.server.ts   # usa ai-core, safety, lock, debug logs
src/server/workflow-executor.server.ts # callAI → ai-core
src/server/ai-agent.functions.ts       # qualifierReply → ai-core ou removido
src/server/intelligence.functions.ts   # sentiment com gate de tamanho
src/routes/api/public/whatsapp-webhook.ts  # business_hours único
src/routes/inbox.tsx                   # layout 3 colunas + nova UX
src/routes/ia-debug.tsx                # filtro + replay
src/routes/configuracoes.tsx           # aba IA redesenhada
```

### Migrations (aditivas)
- `client_memory`: índice + `last_synced_at`.
- `ai_debug_logs`: índice composto `(conversation_id, created_at desc)`.
- Nenhum DROP ou rename.

### Dependências
- Adicionar: `ai`, `@ai-sdk/openai-compatible`, `zod` (já existe).
- Nada removido nesta fase.

---

## Critérios de sucesso por onda

1. **Onda 1**: enviar mensagem real no WhatsApp → `ai_debug_logs` registra entrada; safety bloqueia palavra proibida; nova Inbox renderiza thread sem regressão.
2. **Onda 2**: ao 6ª mensagem inbound, `client_memory.summary` atualiza; painel mostra dados.
3. **Onda 3**: `/ia-debug` mostra logs reais do funil (não só do qualifier); replay reproduz resposta.
4. **Onda 4**: operador consegue sugerir-pausar-retomar-handoff em 1 clique sem sair do Inbox.

---

## Fora de escopo (não faremos agora)

- Mudar provider de IA (continua Lovable AI Gateway).
- Refatorar Datajud, ZapSign, Calendar, Kanban, Processos.
- Multi-tenant / multi-workspace.
- Mobile-specific redesign (responsivo apenas básico).
