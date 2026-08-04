-- ============================================================
-- JJMK b25: cover sheet (shift close) per branch/date/shift
-- run once in Supabase SQL Editor - safe to re-run
-- ============================================================
create table if not exists shift_close(
  branch_id    text    not null,
  close_date   date    not null,
  shift        text    not null check (shift in ('am','pm')),
  float_start  numeric,
  cash_sales   numeric,
  transfers    jsonb default '{}'::jsonb,
  expenses     jsonb default '[]'::jsonb,
  deposit      numeric,
  counted_cash numeric,
  note         text,
  user_name    text,
  edits        jsonb default '[]'::jsonb,
  updated_at   timestamptz default now(),
  primary key (branch_id, close_date, shift)
);
alter table shift_close add column if not exists edits jsonb default '[]'::jsonb;

alter table shift_close enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='shift_close' and policyname='shc_rw') then
    create policy shc_rw on shift_close for all to anon, authenticated using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on public.shift_close to anon, authenticated;
grant select on public.shift_close to service_role;

select 'shift_close' as ok, count(*) from information_schema.tables where table_name='shift_close';
