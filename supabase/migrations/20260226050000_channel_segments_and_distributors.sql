-- Channel segment governance + distributor whitelist
create table if not exists public.campaign_channel_segments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  channel_segment_name text not null,
  margin_percent numeric not null default 0,
  price_adjustment_percent numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_distributors (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  short_name text not null default '',
  full_name text not null default '',
  cnpj text not null default '',
  channel_segment_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.operations
  add column if not exists distributor_id uuid,
  add column if not exists channel_segment_name text,
  add column if not exists commercial_segment_name text;

alter table public.campaign_channel_segments enable row level security;
alter table public.campaign_distributors enable row level security;

drop policy if exists "Read campaign_channel_segments" on public.campaign_channel_segments;
create policy "Read campaign_channel_segments" on public.campaign_channel_segments for select using (auth.role() = 'authenticated');
drop policy if exists "Manage campaign_channel_segments" on public.campaign_channel_segments;
create policy "Manage campaign_channel_segments" on public.campaign_channel_segments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Read campaign_distributors" on public.campaign_distributors;
create policy "Read campaign_distributors" on public.campaign_distributors for select using (auth.role() = 'authenticated');
drop policy if exists "Manage campaign_distributors" on public.campaign_distributors;
create policy "Manage campaign_distributors" on public.campaign_distributors for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
