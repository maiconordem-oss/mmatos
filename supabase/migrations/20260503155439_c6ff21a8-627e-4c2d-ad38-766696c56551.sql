create table if not exists public.user_integrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, provider)
);

alter table public.user_integrations enable row level security;

create policy "own integrations select" on public.user_integrations
  for select to authenticated using (auth.uid() = user_id);
create policy "own integrations insert" on public.user_integrations
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own integrations update" on public.user_integrations
  for update to authenticated using (auth.uid() = user_id);
create policy "own integrations delete" on public.user_integrations
  for delete to authenticated using (auth.uid() = user_id);

create trigger user_integrations_updated_at
  before update on public.user_integrations
  for each row execute function public.update_updated_at_column();