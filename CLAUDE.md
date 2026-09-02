# CLAUDE.md — JJMK Stock / หลังบ้านจริงใจ (อัปเดตถึง b42 · 8 ส.ค. 2026)

คู่มือบริบทโปรเจกต์ — อ่านไฟล์นี้ก่อนแก้อะไรเสมอ
ผู้ใช้ (Pattrick) คุยภาษาไทย ตอบภาษาไทยกระชับ ๆ

## 1. โปรเจกต์คืออะไร

เว็บแอปหลังบ้านร้านหมูกระทะ "จริงใจหมูกระทะ" 2 สาขา (สาขารัชดา / สาขาลาดพร้าว):
นับสต็อกรายวัน → ระบบคำนวณยอดสั่ง → ส่งใบสั่งเข้ากลุ่ม LINE ของแต่ละซัพ → บันทึกรับของ+ราคา →
ใบปะหน้าปิดกะ (รายรับ/กระทบยอดเงินสด) → บิลรายจ่ายซัพ → รายงานการใช้ของ / (กำลังทำ) Food Cost

- **Frontend:** ไฟล์เดียว `index.html` (production) + `beta.html` (ทดลอง) — HTML+CSS+JS ล้วน ไม่มี build step
- **Hosting:** GitHub Pages · repo `thananant/jjmk-stock` · URL `https://thananant.github.io/jjmk-stock/`
- **Backend:** Supabase project `aikyxvluaiubdidqxwnd` (region ap-southeast-1)
- **LINE Messaging API:** ส่งใบสั่ง/แจ้งเตือน (แพ็กเกจไม่จำกัดข้อความ)
- **Edge Functions:** `line-order`, `order-reminders` (cron 15 นาที — เวอร์ชันรองรับ monthdays อยู่ใน repo แล้ว ต้อง deploy), `sync-line-groups`, `admin-reset-password`
- **NAS (Synology "Phagunruay_NAS"):** สำรองข้อมูล + คลังข้อมูลเก่า — ดูข้อ 8

## 2. สถานะเวอร์ชัน

| ไฟล์ | เวอร์ชัน | หมายเหตุ |
|---|---|---|
| `index.html` (production) | v24.6 | ยังไม่ได้ promote โครงหลังบ้าน · v24.4-24.5 = hotfix ล็อกอิน · v24.6 = ปุ่มเปลี่ยนชื่อซัพ (b47) |
| `beta.html` | **b49** | ทุกฟีเจอร์ล่าสุด |

ป้ายเวอร์ชัน = `<span class="verb">…</span>` — **bump ทุกครั้งที่แก้** (`🧪 BETA bN — คำอธิบายสั้น`)
เปิดกันแคช: `beta.html?v=N`

ไทม์ไลน์ b23–b42: b23 เมนูใบปะหน้า · b24 คลังข้อมูลเก่า (archive) · b25-b29 ใบปะหน้าปิดกะ ·
b30 รีเฟรชกลับหน้าเดิม · b31-b33 รายจ่าย Supplier + คลังรายการบิล · b34-b35 (SQL) ชื่อซัพบริษัทเต็ม+จับคู่ ·
b36-b39 จับคู่ชื่อสินค้า/แก้ z-index/ป้าย 🧾 · b40 สั่งตามวันที่ของเดือน · b41 ย้ายซัพ ·
b42 ธีมใหม่โทน v2 (reskin เฟส 1 — ฟอนต์ Prompt + พาเลตสว่าง + sidebar maroon · แก้เฉพาะ CSS ใน proSkin · ไฟล์อ้างอิงดีไซน์ `design/jjmk-stockcheck-v2.html` · หน้าเช็คสต๊อก layout เดิม) ·
b43 แก้รีเซ็ตรหัสผ่าน (Edge Function `admin-reset-password` v2 — หาได้ทั้ง uid/username + ซ่อมบัญชีที่ auth_uid หาย · **ต้อง deploy ไฟล์ `admin-reset-password.ts` ใน dashboard**) ·
b44 login diagnostics — `sbProfile()` แยก 3 สาเหตุ (เซสชันหาย / REST error+code / ไม่มีแถว) แล้วโชว์บนหน้าล็อกอิน + console (แก้ทั้ง beta และ index v24.4) · ตัวแปร `PROF_ERR` ·
b45 ทน PGRST303 — Auth ออก token ล่วงหน้ากว่านาฬิกา API (`JWT issued at future`) แอปวนลองใหม่ 10 ครั้ง × 3 วิ พร้อมข้อความรอบนปุ่ม (`CLOCK_SKEW`, `sbProfile(onWait)`) · index v24.5 ·
b46 อัตราใช้ 3 ช่วงวัน — **safety=จ-พฤ · rate_fri(คอลัมน์ใหม่)=ศ · max=ส-อา+วันหยุดพิเศษ** · needQty เดินปฏิทินทีละวัน (dayRate/sumRate/needBase/isSpecialDay+SPD_CACHE) · config `special_days` (รับ d/m ทุกปี, d/m/พ.ศ., YYYY-MM-DD · กรอกในตั้งค่า upsert ลง DB) · หน้า central 3 ช่องกรอก ตัด sughint เดิม · **ต้องรัน `alter table products add column if not exists rate_fri numeric;` ก่อนเปิด b46** (refreshMeta select ระบุคอลัมน์) ·
b47 ปุ่ม ✏️ เปลี่ยนชื่อบริษัทซัพ ในการ์ดซัพ — เรียก RPC `jj_rename_sup(o,n)` (SECURITY DEFINER เช็ค is_admin/my_perm cascade 7 ตาราง) + อัปเดต in-memory (SUPPLIERS/items.sup/SUP_OVERRIDE/LAST_SENT) · **ต้องรัน `setup_rename_b47.sql` ก่อนใช้ปุ่ม** ·
b48 แยกคอลัมน์อัตราใหม่ — beta อ่าน/เขียน **rate_wk/rate_fri/rate_we** (fallback → safety/max เดิมเมื่อ null ผ่าน `numR()`) · safety/max เดิมคืนให้ production ใช้ตามเดิม (ทดลองใน beta เท่านั้น ตามคำสั่งผู้ใช้ 1 ก.ย.) · **ต้องรัน alter เพิ่ม rate_wk/rate_we + ย้ายค่า import + กู้ safety/max เดิมจาก NAS backup** · SQL อัตราใช้ต่อไปทั้งหมดต้องลง rate_* ไม่ใช่ safety/max ·
b49 **products.bill_name** = ชื่อในบิล/P&L (jj-pnl) ผูกด้วย product_id จากตาราง link ของผู้ใช้ (1 ก.ย.) · แอปโชว์ตัวเล็ก 🧾 ใต้ชื่อนับ (`billTag()`) เฉพาะเมื่อต่างจากชื่อนับ · ไฟล์ `bill_names_b49.sql` (ผู้ใช้รัน)

## 3. Workflow ที่ต้องทำตามเป๊ะ ๆ

1. แก้ที่ `beta.html` ก่อนเสมอ (beta-first) → ผู้ใช้ทดลอง → ค่อยออก production
2. ทุกการแก้: assert ว่า string เดิมมีอยู่ก่อน replace · เช็ค syntax ทุก `<script>` block ด้วย `node -e "new Function(...)"`
3. ฟีเจอร์ใหญ่ → เสนอ flow/diagram ให้ดูก่อนลงมือ
4. **Git:** dev บน branch → สร้าง PR → **merge เข้า main อัตโนมัติได้เลย** (ผู้ใช้อนุญาตถาวรแล้ว) — GitHub Pages deploy เอง 1-2 นาที
5. SQL ต้อง idempotent (`if not exists`) + **ตารางใหม่ต้อง enable RLS + policy + grant ให้ anon/authenticated** (โปรเจกต์เคย revoke default) + grant sequence ถ้ามี identity column · SQL รันมือใน SQL Editor (GitHub ไม่ auto-run)
6. SQL ห้ามคอมเมนต์ไทยยาว ๆ (เคยเจอ encoding พังใน SQL Editor) — ข้อมูลภาษาไทยใน values ใช้ได้
7. Supabase SQL Editor **ตัดผลลัพธ์ที่ 100 แถว** — export ข้อมูลเยอะให้เปลี่ยน Limit dropdown หรือใช้ json_agg/string_agg ยุบแถว

## 4. โครงสร้าง DB (ตารางทั้งหมด)

- `products` — id (text, gen เอง: `'p'||substr(md5(random()::text||clock_timestamp()::text),1,14)`),
  branch_id, cat_key, cat_label, name, **i18n (jsonb {en,lo,my})**, unit, sup, safety, "max", pack, pack_unit,
  order_step, step_unit, location, **image_url**, sort, deleted_at (soft delete) · ~412 แถว (สินค้าแยกต่อสาขา — ชื่อเดียวกัน id คนละตัว)
- **products.bill_name (b49)** — ชื่อบิล/P&L ของสินค้าตัวนั้น (ผูกด้วย product_id) · ใช้ join กับ jj-pnl ในอนาคต · ผู้ใช้มีตาราง link ฝั่ง P&L (คอลัมน์ product_id, branch JJRD/JJLP, ชื่อนับ, ชื่อบิล, สถานะ, หน่วยนับ, หน่วยบิล, ตัวคูณหน่วย, ซัพ) — ชื่อตารางยังไม่ทราบ ถ้าได้ชื่อให้เปลี่ยนแอปไปอ่านสด · คู่ที่น่าสงสัยในตาราง link: fanta ส้ม→"ส้ม", ข้าว→ไซรัปข้าวโพด, เค้กกล้วยหอม→กล้วยหอม, นม/ช๊อกโกแลต/มัทฉะ→ไอศกรีม, น้ำตาลมะพร้าว→น้ำตาลเหลว, ชีสโตะดิป→ยัมมี่ผง (ซ้ำ), น้ำซอสบะหมี่หยก→บะหมี่หยก (ซ้ำ), อูด้ง→เส้นมันหนึบ (ซ้ำ)
- `branches` — id, name, sort
- `suppliers` — **คีย์คือ name ไม่มี id** · ตอนนี้ใช้**ชื่อบริษัทเต็ม**เป็นหลัก (b34) เช่น "บริษัท ซีพี แอ็กตร้า จำกัด(มหาชน)" (=makro เดิม) ·
  order_mode ('any'/'fixed'/'interval'/**'monthdays'**), lead_days, cycle_days, **month_days (text "1,16")**, min_cases,
  cutoff (HH:MM), schedule (jsonb {mon:'wed',...}), last_order_date, last_delivery_date, reopen_date, line_group_id, note
  · ⚠️ ค้างแก้: ซัพ "KCG Indoguna เนือ" (สะกดตกไม้โท) ยังไม่ถูกเปลี่ยนเป็น "บริษัท อินโดกูนา(ประเทศไทย) จำกัด"
- `stock_counts` — log การนับ (append เฉพาะแถวเปลี่ยน) · count_date เป็น date · **ห้ามใช้คอลัมน์ ordered เป็น "ของเข้า"**
- `stock_current` — ยอดสดบนจอ (upsert onConflict branch_id,product_id)
- `stock_receipts` — **แหล่งความจริง "สั่งจริง/รับจริง/ราคา"** · key (branch_id,product_id,order_date) ·
  ordered เขียนตอนส่ง LINE สำเร็จ · received/diff/unit_price จากหน้ารับของ · sup = ซัพที่สั่งจริงวันนั้น (รองรับย้ายซัพ)
- `daily_revenue` — branch_id, rev_date, revenue, note, user_name · PK(branch_id,rev_date) · **ซิงก์อัตโนมัติจาก shift_close** · เก็บตลอด ไม่ archive
- `shift_close` (b25+) — **ใบปะหน้าปิดกะ** · PK(branch_id, close_date, shift 'am'/'pm') ·
  float_start (เก๊ะเปิด), cash_sales, transfers (jsonb {ช่องทาง:ยอด}), expenses (jsonb [{d,by,a}]),
  deposit (กะเช้า=0 เสมอ), counted_cash (เก๊ะปิด), note, user_name (คนบันทึกแรก คงไว้), edits (jsonb log ใครแก้อะไร), updated_at
- `supplier_bills` (b31+) — บิลรายจ่ายซัพ · id identity, branch_id, bill_date, sup, amount, **lines (jsonb [{name,unit,qty,price,amount}])**, note, user_name
- `supplier_items` (b32+) — คลังรายการบิล 494 รายการจากไฟล์ Excel · sup_sheet (ชื่อในไฟล์บิล), sup_full, name, unit, has_vat, has_disc, **stock_name (b36 — จับคู่ชื่อสินค้านับ)**, sort, active
- `supplier_map` (b32+) — sup_sheet → sup_app (จับคู่ชื่อซัพ ครบ 36 แถวแล้ว, หลายชีทชี้ซัพเดียวได้)
- `config` — key/value: resetTime (06:00), remind_before_min, remind_nocut_time, remind_line_group, shop, **pay_channels ("QR พร้อมเพย์,เครดิต")**
- `line_groups`, `reminder_log`, `app_users`/`roles`, `units`
- **Storage buckets:** `product-images` (รูปสินค้า public), `archive` (b24 — คลังข้อมูลเก่า public read)
- สำรองก่อนล้าง 11 ก.ค.: `stock_counts_backup_20260711`, `stock_receipts_backup_20260711`

## 5. Business logic สำคัญ (อย่าทำพัง)

- **อัตราใช้ 3 ช่วงวัน (b46/b48 · beta เท่านั้น): rate_wk = จ-พฤ/วัน · rate_fri = ศ/วัน · rate_we = ส-อา/วัน** · null → fallback ไป safety/max เดิม (numR) · production ใช้ safety/max แบบเดิมไปก่อนจน promote · วันหยุดพิเศษ (config.special_days) คิดแบบ ส-อา · ช่องว่าง fallback: ศ→ส-อา→จ-พฤ, ส-อา→จ-พฤ
- **สูตรสั่ง (fixed/interval/monthdays) b46:** `แนะนำ = Σrate(วัน)ช่วง cycle − max(0, stock − Σrate(วัน)ช่วง lead)` เดินปฏิทินทีละวันด้วย dayRate() ·
  supHorizon() คืน {lead:วันนับ→วันส่ง, cycle:วันส่งรอบนี้→รอบหน้า} · โหมด any: gate stock≥dayRate(วันนี้), target=Σrate(วัน)ช่วง lead
- **โหมด monthdays (b40):** month_days="1,16" · เดือนสั้นเลื่อนวันเกินเป็นวันสุดท้ายของเดือน (monthdaysDueOn) ·
  helpers: monthDays(), mdDate(), monthdaysNext() · needQty ต้องมี mode 'monthdays' ในเงื่อนไขสูตรเต็มรอบ
- **โหมด interval:** นับรอบจาก LAST_SENT (วันส่ง LINE ล่าสุดจาก stock_receipts)
- **ย้ายซัพ (b41):** `SUP_OVERRIDE` (localStorage `jj_sup_ovr` จำต่อวันธุรกิจ) = ย้ายเฉพาะวันนี้ ·
  `effSup(it)` ใช้แทน it.sup ในสูตร/จัดกลุ่ม/บันทึก · `rowSup(r)` เช็ค override ก่อน · ย้ายถาวร = update products.sup (ต่อสาขา)
- **orderRound():** ปัดขึ้นเต็มหน่วย ยกเว้น unit ตรง regex `/โล|กิโล|กก|กรัม/` → แปลงลัง (pack) / สั่งทีละ (order_step)
- **วันธุรกิจ:** เส้นแบ่งวัน = resetTime (06:00) — ใช้ bizDate()/bizTodayISO()/nowMinEff() แทน new Date() เสมอ
- **ส่ง LINE สำเร็จ → upsert stock_receipts** (ordered=ยอดส่งจริง, sup=ซัพที่สั่งจริง) + อัปเดต LAST_SENT — ห้ามลบ
- **ใบปะหน้าปิดกะ (b25-b29):** 2 กะเสมอ (เช้า 06:00-21:00 / เย็น 21:01-05:59 เลือกออโต้ตามเวลา แก้มือได้) ·
  ช่องทางรายรับ: QR พร้อมเพย์ → เงินสด → เครดิต (แก้ได้ผ่าน config.pay_channels) ·
  **เงินฝากกะเช้า = 0 ล็อกเสมอ** · **เก๊ะเปิด = เก๊ะปิดกะก่อนหน้าอัตโนมัติ** (เย็น←เช้าวันเดียวกัน, เช้า←เย็นเมื่อวาน) ·
  สูตร: ควรมีในเก๊ะปิด = เก๊ะเปิด + ขายสด − รายจ่ายสด − เงินฝาก · Diff = นับจริง − ควรมี ·
  ยอดขายวัน (เช้า+เย็น) ซิงก์เข้า daily_revenue อัตโนมัติ · บันทึกใครบันทึก/ใครแก้อะไร (edits log) · Enter เลื่อนช่องถัดไป
- **รายจ่าย Supplier (b31-b39):** เลือกซัพ (ป้าย 🧾 = มีรายการบิล) → รายการจาก supplier_items ผ่าน supplier_map →
  กรอกจำนวน/ราคา รวมเป็นยอดบิลอัตโนมัติ → บันทึกลง supplier_bills.lines · จับคู่ชื่อซัพ/ชื่อสินค้าในแอปได้ (มีเดาอัตโนมัติ supSim — เทียบเสียงไทย↔อังกฤษ)
- **คลังข้อมูลเก่า (b24):** DB เก็บ 120 วันล่าสุด · เดือนเก่า → JSON รายเดือนใน Storage bucket `archive` ·
  หน้าดูย้อนหลัง/การใช้ของ อ่าน DB+คลังต่อกันอัตโนมัติ (archFetch/archDates) · ดูย้อนหลังได้ไม่จำกัด
- **รายงานการใช้ของ (openUsage):** inflow จาก stock_receipts เท่านั้น (received ?? ordered) เทียบวันของถึงตาม supHorizon lead
- **Dashboard:** เดิมเคยสั่งตัดออก แต่ผู้ใช้กลับคำ 8 ส.ค. 2026 — ให้เพิ่มแดชบอร์ดสไตล์ v2 (KPI+กราฟ ใช้ข้อมูลจริงจาก Supabase) เป็นเฟสถัดไป (**b48** — b43-b47 ถูกใช้ไปแล้ว)
- **ซอง→ลัง conversion:** เฉพาะ dispatch board + ข้อความ LINE — ไม่เอาในหน้า order review

## 6. โครง UI (b22 shell + โมดูล)

- **Shell:** body.jjshell → sidebar 264px ค้างซ้าย ≥1024px (มือถือ = drawer ☰) · `.modpage` z-index **350** — overlay ที่จะลอยเหนือเพจต้อง z-index ≥400
- **เมนู:** ข้อมูลสต็อก (นับ/ใบสั่งซื้อ/รายการสั่งของ/รับของ+ราคา/การใช้ของ/ดูย้อนหลัง/Safety-Max/ตั้งค่า) ·
  💵 **รายรับ** (=ใบปะหน้า, module 'sales') · 💸 **รายจ่าย Supplier** (module 'supbill') · 🧮 ข้อมูล Food Cost (โครงรอ) — โมดูลเงินเห็นเฉพาะ admin/owner (canMoney)
- **นำทาง:** goPage(g) จำหน้าล่าสุดใน localStorage `jj_last_page` → รีเฟรช (F5) กลับหน้าเดิม (restoreLastPage เช็คสิทธิ์ก่อน)
- ฟังก์ชันหลัก: openModule(), buildSidebar(), renderSalesPage() (ใบปะหน้า), renderSupBillPage(), openSupMapping(), openItemMapping(), moveSupDialog()

## 7. ระบบชื่อซัพ 2 โลก (สำคัญมากตอน integrate)

```
ชื่อในไฟล์บิล/ชีท (sup_sheet เช่น "makro")
   └─ supplier_map ─→ ชื่อซัพในแอป (suppliers.name = ชื่อบริษัทเต็ม เช่น "บริษัท ซีพี แอ็กตร้า จำกัด(มหาชน)")
รายการบิล (supplier_items.name เช่น "เอโร่ ผักรวมแช่แข็ง1กก.")
   └─ supplier_items.stock_name ─→ สินค้านับ (products.name เช่น "ผักรวมแช่แข็ง")
```
- สินค้านับกับรายการบิลตั้งใจแยกกัน (ชื่อนับสั้นไว้นับเร็ว / ชื่อบิลตรงกระดาษ) — เชื่อมด้วย mapping ไม่บังคับรวม
- ตัวเดาชื่อ: supNorm/supSkel (ถอดเสียงพยัญชนะไทย→ละติน)/supAbbr (เคซีจี=KCG)/supSim — threshold 0.62

## 8. NAS (Synology · shared folder "JingJai-System")

- `backup_jjmk.sh` — ทุกวันตี 4 (Task Scheduler, root): pg_dump ผ่าน docker → dump/ (.dump+.sql.gz) + csv/ ทุกตาราง · เก็บ 90 วัน
- `archive_jjmk.sh` — เดือนละครั้ง: ย้ายเดือนที่เก่ากว่า 120 วัน (stock_counts, stock_receipts) → NAS + Storage `archive` → เทียบ byte ตรงกันแล้วค่อยลบจาก DB · ไม่มี backup ใหม่ = ไม่ยอมลบ
- ต่อ DB ใช้ **Session pooler** (aws-1-ap-southeast-1.pooler.supabase.com:5432) — direct host เป็น IPv6 ต่อจากบ้านไม่ติด
- สคริปต์ใน repo ไม่มีรหัสผ่าน (placeholder) — ตัวจริงอยู่บน NAS ของผู้ใช้เท่านั้น

## 9. SQL ที่รันแล้ว / ค้างรัน

รันแล้ว: setup ทั้งหมดถึง b35 (cover sheet, edits, supplier_bills, catalog 494, rename b34, new6 b35), archive bucket
ต้องเช็ค/ค้าง: `setup_item_names_b36.sql` (stock_name), `setup_monthdays_b40.sql` (month_days), `setup_rename_b47.sql` (jj_rename_sup), deploy `order-reminders.ts` + `admin-reset-password.ts` ใหม่

## 10. กับดักที่เคยเจอ (จำไว้)

- Supabase default 1,000 แถว/query ฝั่งแอป → ใช้ sbAll(build,n) เสมอเมื่อดึงเยอะ · SQL Editor ตัด 100 แถวตอน export
- toISOString() เป็น UTC — ใช้ bizTodayISO() · วันที่ใน DB บางแถวเป็นปี พ.ศ. → isoFromAny()/dateVariants()
- `.modpage` z-index 350 — overlay ต่ำกว่านี้จะโดนบัง (เคยทำหน้าต่างจับคู่ "หาย")
- GitHub merge แบบ squash ทำ branch conflict — ใช้ merge commit ธรรมดา + sync branch หลัง merge ทุกครั้ง
- Claude session ต่อ Supabase/NAS ตรง ๆ ไม่ได้ (egress block) — ให้ผู้ใช้รัน SQL แล้วส่ง CSV กลับ
- suppliers ไม่มี id — เปลี่ยนชื่อซัพต้อง cascade 7 ตาราง: products.sup, stock_receipts.sup, stock_counts.sup, supplier_bills.sup, supplier_map.sup_app, reminder_log.sup — ใช้ปุ่ม ✏️ ในการ์ดซัพ (b47) หรือ RPC `jj_rename_sup` ตรง ๆ
- Edge Function ใช้ service_role ข้าม RLS แต่**ไม่ข้าม GRANT**
- Synology Task Scheduler ไม่รู้จัก PATH docker — สคริปต์เติม PATH เองแล้ว
- save() ฝั่งแอป = localStorage เท่านั้น — persistence จริงคือ call Supabase ตรง ๆ
- **PGRST303 `JWT issued at future`** = นาฬิกาเซิร์ฟเวอร์ Auth เดินล่วงหน้ากว่า PostgREST → ล็อกอินผ่านแต่อ่านตารางไม่ได้ทุกตาราง · เช็คด้วย `select last_sign_in_at - now() from auth.users` (บวก = Auth ล่วงหน้า) · แก้ถาวร = Restart project ใน Settings > General (28 ส.ค. 2026)
- **โควตา Supabase free = Cached Egress 5 GB/เดือน** — เกินแล้ว REST/Storage ถูกจำกัดทั้งที่ Auth ยังทำงาน อาการคือ "ล็อกอินผ่านแต่ไม่พบโปรไฟล์" (28 ส.ค. 2026 ชน 101%) · ตัวกินหลัก = รูปสินค้าใน bucket `product-images` · ดู Dashboard > Usage ก่อนโทษโค้ดเสมอ

## 11. คิวงานถัดไป

1. **b48: แดชบอร์ดสไตล์ v2** (KPI+กราฟ ข้อมูลจริง) + เก็บรายละเอียดรีสกินรายหน้า (อ้างอิง `design/jjmk-stockcheck-v2.html`)
2. **หน้า Food Cost จริง 3 มุมมอง** — FC% = มูลค่าใช้÷รายได้ (เป้า ~35-45%) · จับสั่งเกิน · ราคาย้อนหลัง —
   ข้อมูลพร้อมแล้ว: daily_revenue (จากใบปะหน้า) + supplier_bills + stock_receipts.unit_price
3. รอไฟล์จับคู่ชื่อสินค้า (จับคู่ชื่อสินค้า_JJMK.xlsx) กลับจากผู้ใช้ → gen SQL update stock_name + แก้ชื่อ "KCG Indoguna เนือ" + ผูกซัพให้สินค้า 4 ตัวที่ sup=null (ชีส, น้ำยาถังขาวฝาแดง, หมูยอ, หอยแมลงภู่ชิลี)
4. Promote โครงหลังบ้าน → production v25 (รอผู้ใช้สั่ง)
5. สูตรหักของค้างท่อ (pipeline deduction — KCG สั่งทุกวันของถึงช้า สั่งซ้ำซ้อน) — เสนอไว้ ยังไม่เคาะ
6. จูนอัตราใช้จากข้อมูลจริง — SQL วิเคราะห์ 3 ช่วงวันส่งให้ผู้ใช้แล้ว (29 ส.ค.) รอ CSV กลับมา → ทำตารางเทียบ → gen UPDATE safety/rate_fri/max (ไฟล์ v5 เดิมเลิกใช้)
7. เคลียร์สินค้าซ้ำ: ข้าวคั่ว ×2 ทั้งสองสาขา, น้ำมัน ×2 ลาดพร้าว
8. บันทึกบิลซัพ: แนบรูปบิล (เฟสถัดไปที่คุยไว้)
