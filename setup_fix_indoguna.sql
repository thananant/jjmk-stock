-- JJMK: fix leftover supplier rename (b34 missed it due to spelling)
-- "KCG Indoguna เนือ" -> full company name. Run once, safe to re-run.
create or replace function _jj_rename_sup(old_name text, new_name text) returns text as $$
begin
  if not exists (select 1 from suppliers where trim(name)=trim(old_name)) then
    return 'NOT FOUND (already fixed?): '||old_name; end if;
  if exists (select 1 from suppliers where trim(name)=trim(new_name)) then
    return 'TARGET EXISTS (skip): '||new_name; end if;
  update suppliers set name=new_name where trim(name)=trim(old_name);
  update products set sup=new_name where trim(coalesce(sup,''))=trim(old_name);
  update stock_receipts set sup=new_name where trim(coalesce(sup,''))=trim(old_name);
  update stock_counts set sup=new_name where trim(coalesce(sup,''))=trim(old_name);
  update supplier_bills set sup=new_name where trim(coalesce(sup,''))=trim(old_name);
  update supplier_map set sup_app=new_name where trim(coalesce(sup_app,''))=trim(old_name);
  return 'renamed: '||old_name||' -> '||new_name;
end; $$ language plpgsql;

select _jj_rename_sup('KCG Indoguna เนือ','บริษัท อินโดกูนา(ประเทศไทย) จำกัด');
drop function _jj_rename_sup(text,text);

select name from suppliers where name like '%อินโดกูนา%' or name like '%Indoguna%';
