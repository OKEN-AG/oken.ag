create table if not exists public.credit_lines (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  funding_cost_aa numeric(12,6) not null check (funding_cost_aa >= 0),
  spread_aa numeric(12,6) not null check (spread_aa >= 0),
  priority integer not null default 100,
  max_share numeric(8,6) null check (max_share > 0 and max_share <= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_credit_lines_campaign_id on public.credit_lines(campaign_id);
create index if not exists idx_credit_lines_priority on public.credit_lines(campaign_id, priority);

create table if not exists public.credit_line_requirements (
  id uuid primary key default gen_random_uuid(),
  credit_line_id uuid not null references public.credit_lines(id) on delete cascade,
  risk_levels text[] null,
  profiles text[] null,
  operation_types text[] null,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_line_requirements_line_id on public.credit_line_requirements(credit_line_id);

alter table public.credit_lines enable row level security;
alter table public.credit_line_requirements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'credit_lines' and policyname = 'credit_lines_select_authenticated'
  ) then
    create policy "credit_lines_select_authenticated"
    on public.credit_lines
    for select
    using (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'credit_line_requirements' and policyname = 'credit_line_requirements_select_authenticated'
  ) then
    create policy "credit_line_requirements_select_authenticated"
    on public.credit_line_requirements
    for select
    using (auth.role() = 'authenticated');
  end if;
end $$;
