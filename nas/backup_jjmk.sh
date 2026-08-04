#!/bin/sh
# ============================================================
# JJMK Stock -> NAS : สำรองข้อมูลทั้งหมดจาก Supabase ลง NAS
# รันวันละครั้งผ่าน Task Scheduler (Synology) / cron (QNAP)
# ต้องมี Docker บน NAS (ใช้ image postgres:17-alpine เป็นตัว pg_dump)
# ============================================================

set -eu

# --- ตั้งค่า 3 บรรทัดนี้ก่อนใช้งาน ---------------------------------
# 1) DB_URL: copy จาก Supabase dashboard -> Connect -> "Session pooler"
#    (แบบ pooler ใช้ได้กับเน็ตบ้าน IPv4 — แบบ db.xxx.supabase.co ตรง ๆ
#     มักต่อไม่ติดเพราะเป็น IPv6)
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres.aikyxvluaiubdidqxwnd:ใส่รหัสผ่านDBตรงนี้@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres}"
# 2) DEST: โฟลเดอร์ปลายทางบน NAS (= shared folder "JingJai-System")
DEST="${BACKUP_DIR:-/volume1/JingJai-System}"
# 3) KEEP_DAYS: เก็บย้อนหลังกี่วัน (เกินนี้ลบทิ้งอัตโนมัติ)
KEEP_DAYS="${KEEP_DAYS:-90}"
# -------------------------------------------------------------------

STAMP="$(date +%Y%m%d_%H%M)"
IMG="postgres:17-alpine"
mkdir -p "$DEST/dump" "$DEST/csv/$STAMP"

echo "[jjmk-backup] $STAMP start"

# 1) Full dump (custom format — ใช้ pg_restore กู้คืนได้ทั้งก้อน)
docker run --rm "$IMG" pg_dump "$DB_URL" \
  --format=custom --no-owner --no-privileges \
  > "$DEST/dump/jjmk_$STAMP.dump"

# 2) Plain SQL (เปิดอ่านเองได้ / วางใน SQL editor ได้)
docker run --rm "$IMG" pg_dump "$DB_URL" \
  --no-owner --no-privileges \
  | gzip > "$DEST/dump/jjmk_$STAMP.sql.gz"

# 3) CSV รายตาราง (เปิดด้วย Excel ได้ทันที)
for T in products branches suppliers stock_counts stock_receipts \
         stock_current daily_revenue config line_groups reminder_log units; do
  docker run --rm "$IMG" psql "$DB_URL" -q \
    -c "\\copy (select * from $T) to stdout with csv header" \
    > "$DEST/csv/$STAMP/$T.csv" \
    || echo "[jjmk-backup] warn: export $T failed (ข้ามไป)"
done

# 4) ลบไฟล์เก่าเกิน KEEP_DAYS
find "$DEST/dump" -name 'jjmk_*' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
find "$DEST/csv" -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true

SIZE="$(du -sh "$DEST" | cut -f1)"
echo "[jjmk-backup] done -> $DEST (รวม $SIZE)"
