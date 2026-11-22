-- FINANCE IA | Estrutura inicial do banco de dados (Supabase / PostgreSQL)
-- Versão de partida para protótipo. Revisar e testar antes de usar com dados reais.
-- Não inserir credenciais bancárias, senhas ou dados completos de cartões.

create extension if not exists pgcrypto;

-- Perfil do usuário: a autenticação é gerenciada pelo Supabase Auth.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Cada titular financeiro é mantido separado: CPF ou CNPJ.
create table if not exists public.financial_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('CPF','CNPJ')),
  display_name text not null,
  tax_id_last4 text, -- somente referência parcial; não armazenar CPF/CNPJ completo aqui
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.financial_entities(id) on delete cascade,
  institution_name text not null,
  account_name text not null,
  account_type text not null default 'checking',
  currency char(3) not null default 'BRL',
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_scope text not null check (entity_scope in ('CPF','CNPJ','BOTH')),
  flow_type text not null check (flow_type in ('INCOME','EXPENSE','TRANSFER','INVESTMENT','LIABILITY')),
  name text not null,
  parent_id uuid references public.categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, entity_scope, flow_type, name)
);

create table if not exists public.counterparties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  relationship_type text, -- empregador, cliente, fornecedor, pessoa, instituição etc.
  tax_id_last4 text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.financial_entities(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  counterparty_id uuid references public.counterparties(id) on delete set null,
  transaction_date date not null,
  competence_month date,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  direction text not null check (direction in ('INCOME','EXPENSE')),
  status text not null default 'CONFIRMED'
    check (status in ('PLANNED','PENDING','CONFIRMED','CANCELLED')),
  origin text not null default 'MANUAL'
    check (origin in ('MANUAL','IMPORT','OPEN_FINANCE')),
  external_id text,
  is_internal_transfer boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

-- Transferências entre contas próprias: registradas como vínculo, não como receita/despesa.
create table if not exists public.internal_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  to_transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_transaction_id <> to_transaction_id)
);

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.financial_entities(id) on delete cascade,
  institution_name text not null,
  card_name text not null,
  last4 char(4),
  credit_limit numeric(14,2),
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  reference_month date not null,
  due_date date,
  total_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  status text not null default 'OPEN'
    check (status in ('OPEN','PARTIAL','PAID','OVERDUE')),
  created_at timestamptz not null default now(),
  unique (card_id, reference_month)
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.financial_entities(id) on delete cascade,
  creditor_name text not null,
  description text not null,
  original_amount numeric(14,2) not null check (original_amount >= 0),
  outstanding_amount numeric(14,2) not null check (outstanding_amount >= 0),
  installment_amount numeric(14,2),
  due_day smallint check (due_day between 1 and 31),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','PAID','RENEGOTIATED','CANCELLED')),
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.financial_entities(id) on delete cascade,
  asset_type text not null, -- reserva, renda fixa, fundo, ação, título público etc.
  institution_name text,
  description text not null,
  current_value numeric(14,2) not null default 0,
  valuation_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Segurança: cada usuário só consulta e altera seus próprios registros.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','financial_entities','accounts','categories','counterparties',
    'transactions','internal_transfers','credit_cards','card_invoices','debts','assets'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'financial_entities','accounts','categories','counterparties',
    'transactions','internal_transfers','credit_cards','card_invoices','debts','assets'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'user owns rows', t);
    execute format(
      'create policy %I on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      'user owns rows', t
    );
  end loop;
end $$;

-- Índices básicos para consultas por titular e período.
create index if not exists idx_transactions_user_date
  on public.transactions(user_id, transaction_date desc);
create index if not exists idx_transactions_entity_date
  on public.transactions(entity_id, transaction_date desc);
create index if not exists idx_accounts_user_entity
  on public.accounts(user_id, entity_id);
create index if not exists idx_cards_user_entity
  on public.credit_cards(user_id, entity_id);
