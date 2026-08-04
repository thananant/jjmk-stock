# เก็บข้อมูล JJMK ลง NAS

มี 2 ระดับ — **ระดับ 1 ทำได้เลยวันนี้** / ระดับ 2 เป็นงานย้ายระบบเต็มตัว (ดู `MIGRATION.md`)

## ระดับ 1: สำรองข้อมูลทั้งหมดลง NAS อัตโนมัติทุกวัน (แนะนำให้ทำก่อน)

ข้อมูลจริงยังอยู่ Supabase (แอป/LINE/เตือนอัตโนมัติทำงานเหมือนเดิม ไม่มี downtime)
แต่ NAS จะมี**สำเนาครบทุกตารางของทุกวัน** ทั้งแบบกู้คืนได้ (.dump) และแบบเปิด Excel ได้ (.csv)

### สิ่งที่ต้องมี
- NAS ที่ลง Docker ได้ (Synology = Container Manager, QNAP = Container Station)
- รหัสผ่าน Database: Supabase dashboard → ⚙️ Project Settings → Database
  (ถ้าจำไม่ได้ กด Reset database password ได้)

### ติดตั้ง (Synology)
1. เปิด SSH หรือใช้ File Station วางไฟล์ `backup_jjmk.sh` ไว้เช่น `/volume1/scripts/`
2. แก้ 3 ค่าบนหัวไฟล์: `DB_URL` (copy จาก dashboard → **Connect → Session pooler** แล้วใส่รหัสผ่าน), `DEST`, `KEEP_DAYS`
3. Control Panel → **Task Scheduler** → Create → Scheduled Task → User-defined script
   - User: `root` · เวลา: ตี 4 ทุกวัน (ก่อนรีเซ็ต 06:00)
   - Script: `bash /volume1/scripts/backup_jjmk.sh >> /volume1/scripts/backup_jjmk.log 2>&1`
4. กด Run ทดสอบ 1 ครั้ง แล้วเช็คว่ามีไฟล์ใน `DEST`

### ติดตั้ง (QNAP)
เหมือนกัน แต่ตั้งเวลาใน crontab หรือใช้แอป "หลังบ้าน" ของ QNAP:
`0 4 * * * /bin/sh /share/scripts/backup_jjmk.sh >> /share/scripts/backup_jjmk.log 2>&1`

### สำคัญ: ใช้ connection string แบบ "Session pooler"
- ✅ `postgres.aikyxvluaiubdidqxwnd@aws-0-xxx.pooler.supabase.com:5432` — ใช้ได้กับเน็ตบ้าน
- ❌ `db.aikyxvluaiubdidqxwnd.supabase.co:5432` — เป็น IPv6 เน็ตบ้าน/NAS ส่วนใหญ่ต่อไม่ติด
- ❌ Transaction pooler พอร์ต `6543` — ใช้กับ pg_dump ไม่ได้

### กู้คืนข้อมูล (ถ้าวันไหน Supabase มีปัญหา)
```
docker run --rm -v /volume1/backup/jjmk/dump:/b postgres:17-alpine \
  pg_restore -d "<DB_URL ปลายทาง>" --clean --if-exists --no-owner /b/jjmk_YYYYMMDD_HHMM.dump
```

### ได้อะไรบ้างต่อวัน
```
/volume1/backup/jjmk/
├── dump/jjmk_20260804_0400.dump     ← กู้คืนทั้งก้อน
├── dump/jjmk_20260804_0400.sql.gz   ← SQL อ่านเองได้
└── csv/20260804_0400/               ← เปิด Excel ได้เลย
    ├── stock_counts.csv, stock_receipts.csv, daily_revenue.csv
    ├── products.csv, suppliers.csv, branches.csv ...
```

## ระดับ 2: ย้ายระบบทั้งหมดไปรันบน NAS

เลิกพึ่ง Supabase cloud — ดูแผน ข้อดี/ข้อเสีย และเงื่อนไขที่ต้องมีใน `MIGRATION.md` ก่อนตัดสินใจ
