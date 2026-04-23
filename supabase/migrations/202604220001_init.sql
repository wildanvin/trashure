create extension if not exists pgcrypto;
create extension if not exists vector;

create type public.item_condition as enum ('new', 'used', 'broken');
create type public.item_status as enum ('draft', 'active', 'sold', 'expired');
create type public.agent_strategy as enum ('fast', 'balanced', 'max_profit');
create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'countered', 'withdrawn', 'expired');
create type public.negotiation_actor as enum ('buyer', 'seller_agent', 'system');
create type public.negotiation_decision as enum ('accept', 'reject', 'counter');
create type public.deal_status as enum ('pending_funding', 'funded', 'settled', 'canceled');

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_pubkey text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  raw_title text not null,
  raw_description text not null,
  condition public.item_condition not null,
  status public.item_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_mandates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.items (id) on delete cascade,
  strategy public.agent_strategy not null,
  min_price_lamports bigint not null check (min_price_lamports > 0),
  target_price_lamports bigint not null check (target_price_lamports >= min_price_lamports),
  agent_fee_bps integer not null check (agent_fee_bps >= 0 and agent_fee_bps <= 10000),
  agent_wallet_pubkey text not null,
  time_limit timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.item_enrichments (
  item_id uuid primary key references public.items (id) on delete cascade,
  optimized_title text not null,
  optimized_description text not null,
  creative_uses_json jsonb not null default '[]'::jsonb,
  keyword_text text not null default '',
  embedding vector(1536),
  search_tsv tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(optimized_title, '') || ' ' ||
      coalesce(optimized_description, '') || ' ' ||
      coalesce(keyword_text, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  price_lamports bigint not null check (price_lamports > 0),
  counter_price_lamports bigint,
  status public.offer_status not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.negotiation_messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  actor public.negotiation_actor not null,
  message text not null,
  decision public.negotiation_decision,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  offer_id uuid not null unique references public.offers (id) on delete cascade,
  accepted_price_lamports bigint not null check (accepted_price_lamports > 0),
  status public.deal_status not null default 'pending_funding',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onchain_settlements (
  deal_id uuid primary key references public.deals (id) on delete cascade,
  program_id text not null,
  escrow_pda text not null,
  tx_fund_sig text not null,
  tx_settle_sig text not null,
  settled_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_items_owner_status on public.items (owner_id, status);
create index if not exists idx_offers_item_status on public.offers (item_id, status);
create index if not exists idx_offers_buyer on public.offers (buyer_id, created_at desc);
create index if not exists idx_negotiation_messages_offer on public.negotiation_messages (offer_id, created_at);
create index if not exists idx_item_enrichments_search_tsv on public.item_enrichments using gin (search_tsv);
create index if not exists idx_item_enrichments_embedding on public.item_enrichments using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_items_updated_at
before update on public.items
for each row execute function public.set_updated_at();

create trigger set_agent_mandates_updated_at
before update on public.agent_mandates
for each row execute function public.set_updated_at();

create trigger set_item_enrichments_updated_at
before update on public.item_enrichments
for each row execute function public.set_updated_at();

create trigger set_offers_updated_at
before update on public.offers
for each row execute function public.set_updated_at();

create trigger set_deals_updated_at
before update on public.deals
for each row execute function public.set_updated_at();

create or replace function public.search_items_hybrid(
  query_text text,
  query_embedding vector(1536) default null,
  match_count integer default 20
)
returns table (
  item_id uuid,
  owner_id uuid,
  title text,
  description text,
  creative_uses_json jsonb,
  score double precision
)
language sql
stable
as $$
  with enriched as (
    select
      i.id as item_id,
      i.owner_id,
      coalesce(e.optimized_title, i.raw_title) as title,
      coalesce(e.optimized_description, i.raw_description) as description,
      coalesce(e.creative_uses_json, '[]'::jsonb) as creative_uses_json,
      coalesce(ts_rank(e.search_tsv, plainto_tsquery('english', query_text)), 0) as keyword_score,
      case
        when query_embedding is not null and e.embedding is not null
          then 1 - (e.embedding <=> query_embedding)
        else 0
      end as semantic_score
    from public.items i
    left join public.item_enrichments e on e.item_id = i.id
    where i.status = 'active'
  )
  select
    enriched.item_id,
    enriched.owner_id,
    enriched.title,
    enriched.description,
    enriched.creative_uses_json,
    ((enriched.keyword_score * 0.45) + (enriched.semantic_score * 0.55)) as score
  from enriched
  where
    query_text <> ''
    and (
      enriched.keyword_score > 0
      or enriched.semantic_score > 0
      or enriched.title ilike '%' || query_text || '%'
      or enriched.description ilike '%' || query_text || '%'
    )
  order by score desc, enriched.item_id
  limit greatest(1, least(match_count, 100));
$$;

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.item_images enable row level security;
alter table public.agent_mandates enable row level security;
alter table public.item_enrichments enable row level security;
alter table public.offers enable row level security;
alter table public.negotiation_messages enable row level security;
alter table public.deals enable row level security;
alter table public.onchain_settlements enable row level security;

create policy "public read profiles" on public.profiles
for select using (true);
create policy "users manage own profile" on public.profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "public read items" on public.items
for select using (true);
create policy "owners manage own items" on public.items
for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "public read item images" on public.item_images
for select using (true);
create policy "owners manage item images" on public.item_images
for all
using (
  exists (
    select 1
    from public.items i
    where i.id = item_images.item_id and i.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.items i
    where i.id = item_images.item_id and i.owner_id = auth.uid()
  )
);

create policy "public read mandates" on public.agent_mandates
for select using (true);
create policy "owners manage mandates" on public.agent_mandates
for all
using (
  exists (
    select 1
    from public.items i
    where i.id = agent_mandates.item_id and i.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.items i
    where i.id = agent_mandates.item_id and i.owner_id = auth.uid()
  )
);

create policy "public read enrichments" on public.item_enrichments
for select using (true);
create policy "owners manage enrichments" on public.item_enrichments
for all
using (
  exists (
    select 1
    from public.items i
    where i.id = item_enrichments.item_id and i.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.items i
    where i.id = item_enrichments.item_id and i.owner_id = auth.uid()
  )
);

create policy "public read offers" on public.offers
for select using (true);
create policy "buyers create offers" on public.offers
for insert with check (auth.uid() = buyer_id);
create policy "buyers update offers" on public.offers
for update using (auth.uid() = buyer_id);

create policy "public read negotiation messages" on public.negotiation_messages
for select using (true);
create policy "buyers write buyer messages" on public.negotiation_messages
for insert
with check (
  actor = 'buyer'
  and exists (
    select 1
    from public.offers o
    where o.id = negotiation_messages.offer_id and o.buyer_id = auth.uid()
  )
);

create policy "public read deals" on public.deals
for select using (true);
create policy "public read settlements" on public.onchain_settlements
for select using (true);
