-- JJMK b36: bill item <-> stock item name link (run once, safe to re-run)
alter table supplier_items add column if not exists stock_name text;
select 'stock_name column' as ok, count(*) from information_schema.columns
where table_name='supplier_items' and column_name='stock_name';
