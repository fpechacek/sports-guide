-- Paste this whole file into the Supabase SQL editor and run it once.
-- It stores Must Watch checks. Only the signed-in person can change their own rows.

create table if not exists public.watch_picks (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null,
  event_date date not null,
  kind text not null check (kind in ('pin', 'hide')),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.watch_picks enable row level security;

drop policy if exists "read own picks" on public.watch_picks;
create policy "read own picks"
  on public.watch_picks
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "add own picks" on public.watch_picks;
create policy "add own picks"
  on public.watch_picks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "change own picks" on public.watch_picks;
create policy "change own picks"
  on public.watch_picks
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "remove own picks" on public.watch_picks;
create policy "remove own picks"
  on public.watch_picks
  for delete
  to authenticated
  using (auth.uid() = user_id);
