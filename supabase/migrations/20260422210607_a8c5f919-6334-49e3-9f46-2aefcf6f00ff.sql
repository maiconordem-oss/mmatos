-- Enums
CREATE TYPE public.proposal_status AS ENUM ('rascunho', 'enviada', 'aceita', 'recusada');
CREATE TYPE public.contract_status AS ENUM ('pendente', 'enviado', 'visualizado', 'assinado', 'recusado', 'expirado');

-- AI agent settings (one row per user)
CREATE TABLE public.ai_agent_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  qualifier_enabled BOOLEAN NOT NULL DEFAULT true,
  qualifier_prompt TEXT NOT NULL DEFAULT 'Você é um assistente de um escritório de advocacia. Cumprimente o lead, descubra qual é a área jurídica (trabalhista, civil, criminal, família, tributário, empresarial, previdenciário, consumidor), a urgência, e peça uma descrição resumida do caso. Seja cordial, profissional e objetivo. Quando tiver informações suficientes, encerre dizendo que um advogado entrará em contato em breve.',
  proposal_prompt TEXT NOT NULL DEFAULT 'Você é um advogado experiente. Com base nas informações do lead, gere uma proposta de honorários profissional contendo: escopo de atuação, valor sugerido, forma de pagamento e prazo estimado. Use linguagem técnica jurídica brasileira.',
  ai_model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  auto_send_proposal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own agent settings" ON public.ai_agent_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own agent settings" ON public.ai_agent_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own agent settings" ON public.ai_agent_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own agent settings" ON public.ai_agent_settings FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_agent_settings_updated_at BEFORE UPDATE ON public.ai_agent_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lead qualifications
CREATE TABLE public.lead_qualifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID,
  client_id UUID,
  case_id UUID,
  legal_area TEXT,
  urgency TEXT,
  description TEXT,
  estimated_value NUMERIC,
  score INTEGER DEFAULT 0,
  qualified BOOLEAN NOT NULL DEFAULT false,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own qualifications" ON public.lead_qualifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own qualifications" ON public.lead_qualifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own qualifications" ON public.lead_qualifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own qualifications" ON public.lead_qualifications FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_lead_qualifications_updated_at BEFORE UPDATE ON public.lead_qualifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Proposals
CREATE TABLE public.proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_id UUID,
  client_id UUID,
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  payment_terms TEXT,
  estimated_duration TEXT,
  status proposal_status NOT NULL DEFAULT 'rascunho',
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own proposals" ON public.proposals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own proposals" ON public.proposals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own proposals" ON public.proposals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own proposals" ON public.proposals FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ZapSign templates
CREATE TABLE public.zapsign_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  zapsign_template_id TEXT NOT NULL,
  description TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.zapsign_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own templates" ON public.zapsign_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own templates" ON public.zapsign_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own templates" ON public.zapsign_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own templates" ON public.zapsign_templates FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_zapsign_templates_updated_at BEFORE UPDATE ON public.zapsign_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contracts
CREATE TABLE public.contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_id UUID,
  client_id UUID,
  proposal_id UUID,
  template_id UUID,
  zapsign_document_id TEXT,
  zapsign_signer_id TEXT,
  signing_url TEXT,
  signed_file_url TEXT,
  status contract_status NOT NULL DEFAULT 'pendente',
  variables JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own contracts" ON public.contracts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own contracts" ON public.contracts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own contracts" ON public.contracts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own contracts" ON public.contracts FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add columns to existing tables
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_handled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS proposal_id UUID;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS contract_id UUID;

-- Indexes
CREATE INDEX idx_lead_qualifications_conversation ON public.lead_qualifications(conversation_id);
CREATE INDEX idx_proposals_case ON public.proposals(case_id);
CREATE INDEX idx_contracts_case ON public.contracts(case_id);
CREATE INDEX idx_contracts_zapsign_doc ON public.contracts(zapsign_document_id);