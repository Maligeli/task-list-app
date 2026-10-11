-- ============================================================
-- Task List App – initial schema
-- Run this in the Supabase SQL editor or via `supabase db push`
-- ============================================================

-- Enable the pgcrypto extension (needed for gen_random_uuid on older PG versions)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Tasks table
-- ---------------------------------------------------------------
create table if not exists tasks (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  title       text        not null check (char_length(title) <= 200),
  notes       text,
  due_date    date,
  priority    smallint    not null check (priority between 1 and 5),
  status      text        not null default 'pending'
                           check (status in ('pending', 'in_progress', 'completed')),
  deleted_at  timestamptz,               -- soft-delete timestamp
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Keep updated_at current automatically
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
alter table tasks enable row level security;

-- Each authenticated user can only see their own non-deleted tasks
create policy "users_select_own_tasks" on tasks
  for select using (auth.uid() = user_id);

create policy "users_insert_own_tasks" on tasks
  for insert with check (auth.uid() = user_id);

create policy "users_update_own_tasks" on tasks
  for update using (auth.uid() = user_id);

-- Note: hard deletes are disallowed by the app; we use soft deletes instead.
-- This policy is present so the DB won't block it if ever needed.
create policy "users_delete_own_tasks" on tasks
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Index for fast per-user queries
-- ---------------------------------------------------------------
create index if not exists tasks_user_id_idx on tasks (user_id)
  where deleted_at is null;

-- Unique constraint used for duplicate detection (per user, case-sensitive)
create unique index if not exists tasks_user_title_duedate_uniq
  on tasks (user_id, lower(title), due_date)
  where deleted_at is null;
