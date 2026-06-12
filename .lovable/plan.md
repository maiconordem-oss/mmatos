## Diagnóstico

A causa raiz é a inconsistência no formato do telefone entre **envio** e **recebimento** (echo do webhook). Hoje:

1. **Recebimento (webhook)** — `whatsapp-webhook.ts` força o número para o formato canônico brasileiro com `normalizeBRPhone` (55 + DDD + 9 + 8 dígitos = 13 dígitos) e grava na `conversations.phone`.
2. **Envio (todos os fluxos)** — `sendWhatsappMessage`, `sendEvolutionText` e os crons só fazem `phone.replace(/\D/g, "")`. Se o número estiver salvo num formato diferente (com/sem 55, com/sem o "9"), a Evolution pode:
   - entregar para um JID que **não existe** (some no destino, e o cliente nunca recebe);
   - ou entregar, mas o echo (`SEND_MESSAGE`) volta com um `remoteJid` canônico **diferente** do `phone` da conversa → o webhook **não encontra a conversa** e cria uma nova / a mensagem não aparece no inbox original.
3. **Disparo manual (`sendWhatsappMessage`)** **não persiste** a mensagem na tabela `messages` antes de enviar — depende 100% do echo. Se o echo falha em casar a conversa, a mensagem **desaparece da interface** mesmo tendo sido entregue.

Isso explica os três sintomas relatados: disparo manual, workflows/funis e crons "somem" da interface para certos números, sem padrão de DDD claro (depende de como cada contato foi criado/importado).

## Plano

### 1. Centralizar normalização no envio
- Em `src/server/whatsapp.functions.ts`, dentro de `sendEvolutionText` e `sendWhatsappMessage`, aplicar `normalizeBRPhone(phone)` antes de enviar para a Evolution. Fallback para `onlyDigits` quando não for número BR.
- Mesma normalização nos crons que montam o destino direto: `cron-reminders`, `cron-scheduled`, `cron-post-consulta`, `cron-reactivation`, `instagram-followup-tick`, `workflow-tick`, `instagram-lead`.

### 2. Persistir SEMPRE a mensagem outbound no disparo manual
- Em `sendWhatsappMessage`, antes de chamar Evolution: inserir linha em `messages` com `direction: "outbound"`, `status: "pending"`, `content: text`, `conversation_id` resolvido a partir do telefone normalizado (mesma lógica `phoneVariants` do webhook). Após sucesso, atualizar `status: "sent"` + `external_id`. Em falha, `status: "failed"` (visível no inbox como erro, em vez de sumir).
- Atualizar `last_message_at` / `last_message_preview` da conversa.
- Manter o de-dup que já existe no webhook (procura outbound `pending` recente com mesmo `content` para colar o `external_id` do echo).

### 3. Resolver conversa por variantes também no echo `fromMe`
- O webhook já usa `phoneVariants` (bom). Adicionar log/contador quando o echo cria uma conversa nova para `fromMe` — sintoma de divergência de formato a investigar caso a caso.

### 4. Backfill de telefones existentes (migração de dados, não de schema)
- Script único (via `supabase--insert`) que reescreve `conversations.phone` para o formato canônico usando uma função SQL equivalente a `normalizeBRPhone`. Quando o backfill detectar duas conversas com o mesmo telefone canônico para o mesmo `user_id`+`instance_id`, mover as mensagens da mais nova para a mais antiga e remover a duplicada.
- Idempotente: rodar uma vez agora, e o item 1 mantém a consistência daqui pra frente.

### 5. Página de diagnóstico rápido (opcional, mas barato)
- Em `/ia-debug` (já existe), adicionar uma seção "Testar envio para número" que mostra: número digitado → número normalizado → JID que a Evolution receberá → resultado. Acelera triagem quando um caso novo aparecer.

## Detalhes técnicos

- **Arquivos**: `src/server/whatsapp.functions.ts`, `src/routes/api/public/whatsapp-webhook.ts`, `src/routes/api/public/cron-*.ts`, `src/routes/api/public/workflow-tick.ts`, `src/routes/api/public/instagram-*.ts`, `src/lib/phone.ts` (já tem `normalizeBRPhone` e `phoneVariants`).
- **Sem mudanças de schema** — só dados (backfill) + código.
- **Sem novas dependências, sem novos secrets.**

## Fora do escopo

- Mudar provedor de WhatsApp ou versão da Evolution API.
- Refatorar a estrutura de `conversations` / `messages`.
- Mexer em lógica de IA / funis além de receber o telefone normalizado.
