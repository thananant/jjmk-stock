-- JJMK b40: month-day ordering mode (run once, safe to re-run)
alter table suppliers add column if not exists month_days text;
select 'month_days column' as ok, count(*) from information_schema.columns
where table_name='suppliers' and column_name='month_days';
