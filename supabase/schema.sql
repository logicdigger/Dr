create extension if not exists "pgcrypto";

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  party_name text not null,
  order_number text not null unique,
  style_name text not null,
  quantity integer not null check (quantity >= 0),
  delivery_date date not null,
  rate_per_piece numeric(12, 2) not null check (rate_per_piece >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.production_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stage text not null check (stage in ('Cutting', 'Stitching', 'Overlock', 'Folding', 'Packed')),
  qty_in integer not null check (qty_in >= 0),
  qty_out integer not null check (qty_out >= 0),
  log_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile_number text not null,
  process text not null check (process in ('Cutting', 'Stitching', 'Overlock', 'Folding', 'Packed')),
  rate_per_piece numeric(12, 2) not null check (rate_per_piece >= 0),
  opening_balance numeric(12, 2) not null default 0,
  work_assigned integer not null default 0 check (work_assigned >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  process text not null check (process in ('Cutting', 'Stitching', 'Overlock', 'Folding', 'Packed')),
  qty_completed integer not null check (qty_completed >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.worker_advances (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  paid_on date not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.materials_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  entry_date date not null,
  material_type text not null check (material_type in ('Fabric', 'Thread', 'Accessory')),
  quantity_received numeric(12, 2) not null default 0 check (quantity_received >= 0),
  quantity_consumed numeric(12, 2) not null default 0 check (quantity_consumed >= 0),
  wastage numeric(12, 2) not null default 0 check (wastage >= 0),
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.production_logs enable row level security;
alter table public.workers enable row level security;
alter table public.daily_entries enable row level security;
alter table public.worker_advances enable row level security;
alter table public.materials_ledger enable row level security;

create policy "authenticated users can read orders" on public.orders for select to authenticated using (true);
create policy "authenticated users can write orders" on public.orders for all to authenticated using (true) with check (true);

create policy "authenticated users can read production logs" on public.production_logs for select to authenticated using (true);
create policy "authenticated users can write production logs" on public.production_logs for all to authenticated using (true) with check (true);

create policy "authenticated users can read workers" on public.workers for select to authenticated using (true);
create policy "authenticated users can write workers" on public.workers for all to authenticated using (true) with check (true);

create policy "authenticated users can read daily entries" on public.daily_entries for select to authenticated using (true);
create policy "authenticated users can write daily entries" on public.daily_entries for all to authenticated using (true) with check (true);

create policy "authenticated users can read worker advances" on public.worker_advances for select to authenticated using (true);
create policy "authenticated users can write worker advances" on public.worker_advances for all to authenticated using (true) with check (true);

create policy "authenticated users can read materials" on public.materials_ledger for select to authenticated using (true);
create policy "authenticated users can write materials" on public.materials_ledger for all to authenticated using (true) with check (true);
