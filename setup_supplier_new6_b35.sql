-- ============================================================
-- JJMK b35: create 6 suppliers that exist in the bill sheet
--           but not in the app, then map them. Safe to re-run.
-- New suppliers start as order_mode 'any' (no LINE schedule) -
-- adjust later in the supplier settings page if needed.
-- ============================================================
insert into suppliers (name, order_mode, lead_days)
select v.name, 'any', 1
from (values
  ('บริษัท สยามมิตร ฟู้ดส์ จำกัด'),
  ('บริษัท ทีอาร์อาร์ ฟู้ดโปรดักส์ จำกัด'),
  ('หจก.กิตติแก๊ส'),
  ('ห้างหุ้นส่วนจำกัด แกรนนารี่'),
  ('บริษัท บางกอกแร้นช์ จำกัด (มหาชน)'),
  ('บริษัท สยามอุตสาหกรรมไผ่ จำกัด')
) v(name)
where not exists (select 1 from suppliers s where trim(s.name)=trim(v.name));

insert into supplier_map (sup_sheet, sup_app, updated_at) values
  ('SM Retail','บริษัท สยามมิตร ฟู้ดส์ จำกัด',now()),
  ('TRR Food Product','บริษัท ทีอาร์อาร์ ฟู้ดโปรดักส์ จำกัด',now()),
  ('หจก.กิตติแก๊ส','หจก.กิตติแก๊ส',now()),
  ('ห้างหุ้นส่วนจำกัด แกรนนารี่','ห้างหุ้นส่วนจำกัด แกรนนารี่',now()),
  ('Dalee','บริษัท บางกอกแร้นช์ จำกัด (มหาชน)',now()),
  ('บริษัท สยามอุตสาหกรรมไผ่ จำกัด','บริษัท สยามอุตสาหกรรมไผ่ จำกัด',now())
on conflict (sup_sheet) do update set sup_app=excluded.sup_app, updated_at=now();

select sup_sheet, sup_app from supplier_map order by sup_app nulls first, sup_sheet;
