-- b47: in-app supplier rename with full cascade
-- Run once in SQL Editor. Re-run safe (create or replace).
create or replace function public.jj_rename_sup(o text, n text)
returns text
language plpgsql security definer set search_path to 'public'
as $fn$
declare cnt int;
begin
  if not (is_admin() or my_perm('manageSuppliers')) then
    raise exception 'not allowed';
  end if;
  o := trim(o); n := trim(n);
  if o = '' or n = '' then raise exception 'empty name'; end if;
  if o = n then raise exception 'same name'; end if;
  if not exists (select 1 from suppliers where name = o) then
    raise exception 'supplier not found: %', o;
  end if;
  if exists (select 1 from suppliers where name = n) then
    raise exception 'name already exists: %', n;
  end if;
  update suppliers set name = n where name = o;
  update products set sup = n where sup = o;
  get diagnostics cnt = row_count;
  update stock_counts set sup = n where sup = o;
  update stock_receipts set sup = n where sup = o;
  update supplier_bills set sup = n where sup = o;
  update supplier_map set sup_app = n where sup_app = o;
  update reminder_log set sup = n where sup = o;
  return 'ok: products '||cnt;
end $fn$;

revoke all on function public.jj_rename_sup(text,text) from public, anon;
grant execute on function public.jj_rename_sup(text,text) to authenticated;
