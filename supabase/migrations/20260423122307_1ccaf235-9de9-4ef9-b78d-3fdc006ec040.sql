create type public.whatsapp_status as enum ('disconnected','connecting','qr','connected','error');

create table public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  instance_name text not null,
  api_url text,
  api_key text,
  webhook_secret text not null default encode(gen_random_bytes(24),'hex'),
  status public.whatsapp_status not null default 'disconnected',
  qr_code text,
  phone_number text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, instance_name)
);

alter table public.whatsapp_instances enable row level security;

create policy "own select" on public.whatsapp_instances for select using (auth.uid() = user_id);
create policy "own insert" on public.whatsapp_instances for insert with check (auth.uid() = user_id);
create policy "own update" on public.whatsapp_instances for update using (auth.uid() = user_id);
create policy "own delete" on public.whatsapp_instances for delete using (auth.uid() = user_id);

create trigger whatsapp_instances_updated_at
before update on public.whatsapp_instances
for each row execute function public.update_updated_at_column();