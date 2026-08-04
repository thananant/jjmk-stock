# เก็บข้อมูล JJMK ลง NAS

มี 2 ระดับ — **ระดับ 1 ทำได้เลยวันนี้** / ระดับ 2 เป็นงานย้ายระบบเต็มตัว (ดู `MIGRATION.md`)

## ระดับ 1: สำรองข้อมูลทั้งหมดลง NAS อัตโนมัติทุกวัน (แนะนำให้ทำก่อน)

ข้อมูลจริงยังอยู่ Supabase (แอป/LINE/เตือนอัตโนมัติทำงานเหมือนเดิม ไม่มี downtime)
แต่ NAS จะมี**สำเนาครบทุกตารางของทุกวัน** ทั้งแบบกู้คืนได้ (.dump) และแบบเปิด Excel ได้ (.csv)

### สิ่งที่ต้องมี
- NAS ที่ลง Docker ได้ (Synology = Container Manager, QNAP = Container Station)
- รหัสผ่าน Database: Supabase dashboard → ⚙️ Project Settings → Database
  (ถ้าจำไม่ได้ กด Reset database password ได้)

### ติดตั้ง (Synology) — โฟลเดอร์ปลายทาง = shared folder `JingJai-System`
วางสคริปต์และเก็บ backup ไว้ในโฟลเดอร์ `JingJai-System` (path จริงปกติ = `/volume1/JingJai-System`
ถ้า NAS มีหลาย volume อาจเป็น `/volume2/...` เช็คที่ Control Panel → Shared Folder → ดู Location)
1. ใช้ File Station อัปโหลด `backup_jjmk.sh` เข้าโฟลเดอร์ `JingJai-System`
2. แก้ค่าบนหัวไฟล์: `DB_URL` (copy จาก dashboard → **Connect → Session pooler** แล้วใส่รหัสผ่าน)
   · `DEST` ตั้งไว้ให้แล้วเป็น `/volume1/JingJai-System` (แก้ถ้า volume ไม่ใช่ 1)
3. Control Panel → **Task Scheduler** → Create → Scheduled Task → User-defined script
   - User: `root` · เวลา: ตี 4 ทุกวัน (ก่อนรีเซ็ต 06:00)
   - Script: `bash /volume1/JingJai-System/backup_jjmk.sh >> /volume1/JingJai-System/backup.log 2>&1`
4. กด Run ทดสอบ 1 ครั้ง แล้วเช็คว่ามีโฟลเดอร์ `dump/` กับ `csv/` โผล่ใน `JingJai-System`

### ติดตั้ง (QNAP)
เหมือนกัน แต่ตั้งเวลาใน crontab หรือใช้แอป "หลังบ้าน" ของ QNAP:
`0 4 * * * /bin/sh /share/scripts/backup_jjmk.sh >> /share/scripts/backup_jjmk.log 2>&1`

### สำคัญ: ใช้ connection string แบบ "Session pooler"
- ✅ `postgres.aikyxvluaiubdidqxwnd@aws-0-xxx.pooler.supabase.com:5432` — ใช้ได้กับเน็ตบ้าน
- ❌ `db.aikyxvluaiubdidqxwnd.supabase.co:5432` — เป็น IPv6 เน็ตบ้าน/NAS ส่วนใหญ่ต่อไม่ติด
- ❌ Transaction pooler พอร์ต `6543` — ใช้กับ pg_dump ไม่ได้

### กู้คืนข้อมูล (ถ้าวันไหน Supabase มีปัญหา)
```
docker run --rm -v /volume1/JingJai-System/dump:/b postgres:17-alpine \
  pg_restore -d "<DB_URL ปลายทาง>" --clean --if-exists --no-owner /b/jjmk_YYYYMMDD_HHMM.dump
```

### ได้อะไรบ้างต่อวัน
```
/volume1/JingJai-System/
├── dump/jjmk_20260804_0400.dump     ← กู้คืนทั้งก้อน
├── dump/jjmk_20260804_0400.sql.gz   ← SQL อ่านเองได้
├── csv/20260804_0400/               ← เปิด Excel ได้เลย
│   ├── stock_counts.csv, stock_receipts.csv, daily_revenue.csv
│   ├── products.csv, suppliers.csv, branches.csv ...
└── archive/                         ← คลังข้อมูลเก่ารายเดือน (จาก archive_jjmk.sh)
```

## ระดับ 1.5: ย้ายข้อมูลเก่าออกจาก DB (เก็บบน NAS + คลัง) — แอปยังดูย้อนหลังได้

ทำต่อจากระดับ 1 เมื่อ backup รันนิ่งแล้ว — DB ใน Supabase จะเก็บเฉพาะ **120 วันล่าสุด**
เดือนที่เก่ากว่านั้นถูกย้ายไป 2 ที่: **NAS** (ต้นฉบับถาวร) + **คลัง** (ไฟล์รายเดือนใน
Supabase Storage ให้หน้า "ดูข้อมูลย้อนหลัง / การใช้ของ" ในแอปดึงไปแสดงต่อได้เหมือนเดิม)

```
ทุกวัน  : backup_jjmk.sh   Supabase DB ──สำเนาเต็ม──▶ NAS
เดือนละ : archive_jjmk.sh  เดือนเก่า ──JSON──▶ NAS + คลัง ──ตรวจตรงกัน──▶ ลบจาก DB
เปิดดู  : แอปอ่าน DB (120 วันล่าสุด) + อ่านคลัง (เก่ากว่านั้น) อัตโนมัติ
```

### ขั้นตอนเปิดใช้ (ครั้งเดียว)
1. รัน `setup_archive_bucket.sql` ใน Supabase SQL Editor (สร้างที่เก็บไฟล์คลัง)
2. ใช้แอปเวอร์ชัน **b24 ขึ้นไป** (มีตัวอ่านคลังในหน้าดูย้อนหลัง/การใช้ของแล้ว)
3. วาง `archive_jjmk.sh` ข้าง `backup_jjmk.sh` ในโฟลเดอร์ `JingJai-System` แก้หัวไฟล์: `DB_URL`, `SERVICE_ROLE`
   (dashboard → Project Settings → API → **service_role** — เป็นกุญแจลับ ห้ามเอาไปใส่ในหน้าเว็บ)
4. ตั้ง Task Scheduler เพิ่ม: เดือนละครั้ง เช่น วันที่ 1 ตี 5 (หลัง backup ตี 4):
   `bash /volume1/JingJai-System/archive_jjmk.sh >> /volume1/JingJai-System/archive.log 2>&1`

### กลไกกันข้อมูลหาย (ในสคริปต์)
- ไม่มี backup ใหม่กว่า 48 ชม. → **ไม่ยอมลบอะไรเลย** หยุดทันที
- ลบเฉพาะเดือนที่ (1) export ลง NAS สำเร็จ (2) อัปโหลดขึ้นคลังสำเร็จ
  (3) ดาวน์โหลดกลับมาเทียบแล้ว**ตรงกัน byte ต่อ byte** — พลาดข้อใดข้อหนึ่ง = ข้าม รอบหน้าลองใหม่
- ตารางที่ย้าย: `stock_counts`, `stock_receipts` เท่านั้น
  (`daily_revenue` ยอดขายเก็บใน DB ตลอด — เบามากและ Food Cost ต้องใช้)

### หมายเหตุ
- ข้อมูลเดือนล่าสุด ๆ ยังอยู่ใน DB ตามปกติ → สูตรสั่งของ, LINE, วิเคราะห์ safety/max (28 วัน) ไม่กระทบ
- แอปเป็นเว็บ static เข้าจากมือถือที่ร้าน — อ่านไฟล์จาก NAS ที่บ้านตรง ๆ ไม่ได้
  คลังจึงอยู่บน Supabase Storage (นับเป็นพื้นที่ไฟล์ ไม่กินโควตา Database) ส่วน NAS คือต้นฉบับสำรองถาวร
- อยากดูย้อนหลังไกลแค่ไหนก็ได้ — ไฟล์คลังเก็บสะสมไม่ลบ

## ระดับ 2: ย้ายระบบทั้งหมดไปรันบน NAS

เลิกพึ่ง Supabase cloud — ดูแผน ข้อดี/ข้อเสีย และเงื่อนไขที่ต้องมีใน `MIGRATION.md` ก่อนตัดสินใจ
