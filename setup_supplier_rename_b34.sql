-- ============================================================
-- JJMK b34: rename app suppliers to full company names
--           + save sheet->app supplier mapping (user-confirmed)
-- REVIEW the rename list below, then run once. Safe to re-run.
-- Renames cascade to: suppliers, products, stock_receipts,
-- stock_counts, supplier_bills, supplier_map
-- ============================================================
create or replace function _jj_rename_sup(old_name text, new_name text) returns text as $$
begin
  if old_name is null or new_name is null or trim(old_name)=trim(new_name) then return 'skip'; end if;
  if not exists (select 1 from suppliers where trim(name)=trim(old_name)) then
    return 'NOT FOUND: '||old_name; end if;
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

select _jj_rename_sup(o,n) from (values
  ('makro','บริษัท ซีพี แอ็กตร้า จำกัด(มหาชน)'),
  ('Knock Knock','บริษัท น็อคสโตร์ จำกัด สำนักงานใหญ่'),
  ('mix888','Mix888'),
  ('Jimmy','ณชา ซีฟู้ดส์'),
  ('KCG','บริษัท เคซีจี คอร์ปอเรชั่น จำกัด'),
  ('Smilemeat','บริษัทสมาย มีท จำกัด'),
  ('Smoosh','บริษัท เซ็นซอรี่ จำกัด'),
  ('Purefoods','บริษัท เพียวสแควร์ จำกัด'),
  ('แพกุ้ง พี่บิ๊ก','แพกุ้ง เสี่ยบิ๊กนครปฐม'),
  ('coke','บริษัท ไทยน้ำทิพย์ คอร์ปอเรชั่น จำกัด(มหาชน)'),
  ('Smileheart','บริษัท สมาย ฮาร์ท ฟู้ดส์ จำกัด'),
  ('TRK','บริษัท ธาริกัน ฟู้ดส์ จำกัด'),
  ('PFP','บริษัท พี.เอฟ.พี เทรดดิ้ง จำกัด'),
  ('Ajinomoto','บริษัท บิซพอร์ทัล จำกัด'),
  ('Betagro','บริษัท เบทาโกรเกษตรอุตสาหกรรม จำกัด'),
  ('Maruha','บริษัท มารูฮะ นิชิโระ (ไทยแลนด์) จำกัด'),
  ('เส้นอุด้ง','บริษัท ราเมนโนโลยี จำกัด'),
  ('Best Deal','บริษัท เบสดีล ออนไลน์ จำกัด'),
  ('SP เบค่อน','Sp Bacon'),
  ('TVI','บริษัท อุตสาหกรรมทวีวงษ์ จำกัด'),
  ('queen','บริษัท ควีนโปรดักส์ จำกัด'),
  ('Omega','บริษัท โอเมก้า กรุ๊ป คอร์ปอเรชั่น จำกัด'),
  ('KCG Indoguna เนื้อ','บริษัท อินโดกูนา(ประเทศไทย) จำกัด'),
  ('กิมจิ','บริษัท คิงส์ วิช จำกัด'),
  ('Destiny Asia','บริษัท เดสทินีเอเชีย จำกัด')
) v(o,n);

drop function _jj_rename_sup(text,text);

-- sheet name -> app name (null = not mapped yet)
insert into supplier_map (sup_sheet, sup_app, updated_at) values
  ('สี่มุมเมือง','สี่มุมเมือง',now()),
  ('makro','บริษัท ซีพี แอ็กตร้า จำกัด(มหาชน)',now()),
  ('Farmfresh','Farmfresh',now()),
  ('Knock Knock','บริษัท น็อคสโตร์ จำกัด สำนักงานใหญ่',now()),
  ('mix888','Mix888',now()),
  ('ณชา ซีฟู้ดส์','ณชา ซีฟู้ดส์',now()),
  ('SM Retail',null,now()),
  ('KCG','บริษัท เคซีจี คอร์ปอเรชั่น จำกัด',now()),
  ('Smilemeat','บริษัทสมาย มีท จำกัด',now()),
  ('บริษัท เซ็นซอรี่ จำกัด','บริษัท เซ็นซอรี่ จำกัด',now()),
  ('เพียวสแควร์','บริษัท เพียวสแควร์ จำกัด',now()),
  ('พี่ Big','แพกุ้ง เสี่ยบิ๊กนครปฐม',now()),
  ('Yannahbeef','Yannahbeef',now()),
  ('coke','บริษัท ไทยน้ำทิพย์ คอร์ปอเรชั่น จำกัด(มหาชน)',now()),
  ('smile heart','บริษัท สมาย ฮาร์ท ฟู้ดส์ จำกัด',now()),
  ('FOODS TRK','บริษัท ธาริกัน ฟู้ดส์ จำกัด',now()),
  ('PFP','บริษัท พี.เอฟ.พี เทรดดิ้ง จำกัด',now()),
  ('บริษัท บิซพอร์ทัล จำกัด','บริษัท บิซพอร์ทัล จำกัด',now()),
  ('หจก.รักษ์ข้าว','หจก.รักษ์ข้าว',now()),
  ('BETAGRO','บริษัท เบทาโกรเกษตรอุตสาหกรรม จำกัด',now()),
  ('MARUHA','บริษัท มารูฮะ นิชิโระ (ไทยแลนด์) จำกัด',now()),
  ('บริษัท ราเมนโนโลยี จำกัด','บริษัท ราเมนโนโลยี จำกัด',now()),
  ('บริษัท เบสดีล ออนไลน์ จำกัด','บริษัท เบสดีล ออนไลน์ จำกัด',now()),
  ('Freshy Syrup','Freshy Syrup',now()),
  ('Sp Bacon','Sp Bacon',now()),
  ('TRR Food Product',null,now()),
  ('Thaveevong industry co.,ltd','บริษัท อุตสาหกรรมทวีวงษ์ จำกัด',now()),
  ('บริษัท ควีนโปรดักส์ จำกัด','บริษัท ควีนโปรดักส์ จำกัด',now()),
  ('บริษัท โอเมก้า กรุ๊ป คอร์ปอเรชั่น จำกัด','บริษัท โอเมก้า กรุ๊ป คอร์ปอเรชั่น จำกัด',now()),
  ('หจก.กิตติแก๊ส',null,now()),
  ('ห้างหุ้นส่วนจำกัด แกรนนารี่',null,now()),
  ('Dalee',null,now()),
  ('KCG (Indoguna)','บริษัท อินโดกูนา(ประเทศไทย) จำกัด',now()),
  ('บริษัท คิงส์ วิช จำกัด','บริษัท คิงส์ วิช จำกัด',now()),
  ('บริษัท สยามอุตสาหกรรมไผ่ จำกัด',null,now()),
  ('บริษัท เดสทินีเอเชีย จำกัด','บริษัท เดสทินีเอเชีย จำกัด',now())
 
on conflict (sup_sheet) do update set sup_app=excluded.sup_app, updated_at=now();

select name from suppliers order by name;
