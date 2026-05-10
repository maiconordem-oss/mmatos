
CREATE TABLE public.processos_monitorados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  numero_processo text NOT NULL,
  tribunal text NOT NULL,
  classe text,
  assunto text,
  orgao_julgador text,
  data_ajuizamento timestamptz,
  grau text,
  nivel_sigilo integer,
  ultima_movimentacao_em timestamptz,
  ultima_consulta_em timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  raw jsonb,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, numero_processo)
);

CREATE INDEX idx_processos_monitorados_user ON public.processos_monitorados(user_id);
CREATE INDEX idx_processos_monitorados_client ON public.processos_monitorados(client_id);
CREATE INDEX idx_processos_monitorados_case ON public.processos_monitorados(case_id);

ALTER TABLE public.processos_monitorados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own processos" ON public.processos_monitorados FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own processos" ON public.processos_monitorados FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own processos" ON public.processos_monitorados FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own processos" ON public.processos_monitorados FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_processos_monitorados_updated_at
BEFORE UPDATE ON public.processos_monitorados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.processo_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  processo_id uuid NOT NULL REFERENCES public.processos_monitorados(id) ON DELETE CASCADE,
  codigo integer,
  nome text,
  data_movimentacao timestamptz,
  complemento text,
  raw jsonb,
  is_new boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id, codigo, data_movimentacao)
);

CREATE INDEX idx_movs_processo ON public.processo_movimentacoes(processo_id, data_movimentacao DESC);

ALTER TABLE public.processo_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own movs" ON public.processo_movimentacoes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own movs" ON public.processo_movimentacoes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own movs" ON public.processo_movimentacoes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own movs" ON public.processo_movimentacoes FOR DELETE USING (auth.uid() = user_id);
