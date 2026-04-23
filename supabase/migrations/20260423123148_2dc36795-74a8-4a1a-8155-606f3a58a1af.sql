-- Enums
CREATE TYPE public.workflow_node_type AS ENUM (
  'start','message','video','audio','wait','question','condition',
  'qualify','proposal','contract','handoff','end'
);

CREATE TYPE public.workflow_execution_status AS ENUM (
  'running','paused','completed','failed','cancelled'
);

-- Workflows
CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  legal_area text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf select own" ON public.workflows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wf insert own" ON public.workflows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wf update own" ON public.workflows FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wf delete own" ON public.workflows FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON public.workflows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Nodes
CREATE TABLE public.workflow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  type public.workflow_node_type NOT NULL,
  label text,
  position_x double precision NOT NULL DEFAULT 0,
  position_y double precision NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfn select own" ON public.workflow_nodes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wfn insert own" ON public.workflow_nodes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wfn update own" ON public.workflow_nodes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wfn delete own" ON public.workflow_nodes FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_workflow_nodes_updated BEFORE UPDATE ON public.workflow_nodes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_wf_nodes_workflow ON public.workflow_nodes(workflow_id);

-- Edges
CREATE TABLE public.workflow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  source_node_id uuid NOT NULL REFERENCES public.workflow_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.workflow_nodes(id) ON DELETE CASCADE,
  label text,
  condition text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfe select own" ON public.workflow_edges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wfe insert own" ON public.workflow_edges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wfe update own" ON public.workflow_edges FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wfe delete own" ON public.workflow_edges FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_wf_edges_workflow ON public.workflow_edges(workflow_id);
CREATE INDEX idx_wf_edges_source ON public.workflow_edges(source_node_id);

-- Executions
CREATE TABLE public.workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  conversation_id uuid,
  current_node_id uuid REFERENCES public.workflow_nodes(id) ON DELETE SET NULL,
  status public.workflow_execution_status NOT NULL DEFAULT 'running',
  next_run_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfx select own" ON public.workflow_executions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wfx insert own" ON public.workflow_executions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wfx update own" ON public.workflow_executions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wfx delete own" ON public.workflow_executions FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_workflow_executions_updated BEFORE UPDATE ON public.workflow_executions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_wf_exec_conversation ON public.workflow_executions(conversation_id);
CREATE INDEX idx_wf_exec_next_run ON public.workflow_executions(next_run_at) WHERE status = 'running';