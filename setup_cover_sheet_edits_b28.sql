-- JJMK b28: edit history column for shift_close (run once, safe to re-run)
alter table shift_close add column if not exists edits jsonb default '[]'::jsonb;
select 'edits column' as ok, count(*) from information_schema.columns
where table_name='shift_close' and column_name='edits';
