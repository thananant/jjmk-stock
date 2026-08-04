-- JJMK: create storage bucket "archive" for archived history (public read)
-- run once in Supabase SQL Editor
insert into storage.buckets (id, name, public)
values ('archive', 'archive', true)
on conflict (id) do update set public = true;
