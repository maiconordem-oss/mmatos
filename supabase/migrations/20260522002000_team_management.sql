CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  member_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'secretaria',
  status TEXT NOT NULL DEFAULT 'pendente',
  invite_token TEXT,
  invite_expires_at TIMESTAMPTZ,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages team" ON public.team_members;
CREATE POLICY "owner manages team"
  ON public.team_members FOR ALL
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "member views own invite" ON public.team_members;
CREATE POLICY "member views own invite"
  ON public.team_members FOR SELECT
  USING (auth.uid() = member_user_id);

CREATE INDEX IF NOT EXISTS idx_team_members_owner ON public.team_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON public.team_members(member_email);
CREATE INDEX IF NOT EXISTS idx_team_members_token ON public.team_members(invite_token) WHERE invite_token IS NOT NULL;
