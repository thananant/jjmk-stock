#!/bin/sh
# ============================================================
# JJMK Stock : ย้ายข้อมูลเก่าออกจาก Supabase DB -> คลัง (archive)
# ลำดับความปลอดภัย: มี backup ลง NAS ก่อน -> export เดือนเก่าเป็น JSON
#   -> อัปโหลดขึ้น Supabase Storage (ให้แอปยังเปิดดูย้อนหลังได้)
#   -> ตรวจว่าไฟล์บนคลังตรงกับของ NAS เป๊ะ ๆ -> ค่อยลบแถวนั้นออกจาก DB
# รันเดือนละครั้งผ่าน Task Scheduler (หลัง backup_jjmk.sh)
# ============================================================

set -u

# --- ตั้งค่าก่อนใช้งาน ----------------------------------------------
# DB_URL: อันเดียวกับใน backup_jjmk.sh (Session pooler + รหัสผ่าน DB)
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres.aikyxvluaiubdidqxwnd:ใส่รหัสผ่านDBตรงนี้@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres}"
# SERVICE_ROLE: Supabase dashboard -> Project Settings -> API -> service_role (secret)
SERVICE_ROLE="${SUPABASE_SERVICE_ROLE:-ใส่service_role_key}"
SB_URL="https://aikyxvluaiubdidqxwnd.supabase.co"
DEST="${BACKUP_DIR:-/volume1/JingJai-System}"
# เก็บข้อมูลใน DB กี่วันล่าสุด (เก่ากว่านี้ + เต็มเดือนแล้ว = ย้ายไปคลัง)
KEEP_DAYS="${KEEP_DAYS_DB:-120}"
# --------------------------------------------------------------------

IMG="postgres:17-alpine"
STATE="$DEST/archive"
mkdir -p "$STATE"
FAIL=0

PSQL(){ docker run --rm "$IMG" psql "$DB_URL" -X -q -t -A -c "$1"; }

# กันพลาด: ต้องมี full dump ที่ใหม่กว่า 48 ชม. ก่อน (จาก backup_jjmk.sh) ถึงจะยอมลบอะไร
if [ -z "$(find "$DEST/dump" -name 'jjmk_*.dump' -mtime -2 2>/dev/null | head -1)" ]; then
  echo "[jjmk-archive] ABORT: ไม่พบ backup ล่าสุด (รัน backup_jjmk.sh ให้ผ่านก่อน)"
  exit 1
fi

archive_table(){
  T="$1"; D="$2"; OC="$3"
  # normalize วันที่ปี พ.ศ. ที่ค้างจากโค้ดเก่า (2569 -> 2026)
  ND="(case when extract(year from $D)>2400 then ($D - interval '543 years')::date else $D::date end)"
  MONTHS="$(PSQL "select distinct to_char($ND,'YYYY-MM') from $T where $ND < current_date - $KEEP_DAYS order by 1")" || { echo "[jjmk-archive] $T: อ่านรายเดือนไม่ได้"; FAIL=1; return; }
  [ -n "$MONTHS" ] || { echo "[jjmk-archive] $T: ไม่มีเดือนเก่าให้ย้าย"; return; }
  for M in $MONTHS; do
    M1="$M-01"
    RANGE="$ND >= date '$M1' and $ND < date '$M1' + interval '1 month'"
    F="$STATE/${T}_${M}.json"
    # 1) export เดือนนั้นเป็น JSON เก็บบน NAS
    PSQL "select coalesce(json_agg(t order by t.$OC desc),'[]'::json) from (select * from $T where $RANGE) t" > "$F.tmp" \
      || { echo "[jjmk-archive] $T $M: export ไม่ผ่าน"; FAIL=1; continue; }
    [ -s "$F.tmp" ] || { echo "[jjmk-archive] $T $M: ไฟล์ว่าง ข้าม"; FAIL=1; continue; }
    mv "$F.tmp" "$F"
    # รายชื่อวันที่ (ใช้ทำ index ให้หน้าดูย้อนหลัง)
    PSQL "select distinct to_char($ND,'YYYY-MM-DD') from $T where $RANGE order by 1" > "$STATE/dates_${T}_${M}.txt" || true
    # 2) อัปโหลดขึ้นคลัง (Supabase Storage bucket: archive)
    curl -sf -X POST "$SB_URL/storage/v1/object/archive/${T}_${M}.json" \
      -H "Authorization: Bearer $SERVICE_ROLE" -H "apikey: $SERVICE_ROLE" \
      -H "Content-Type: application/json" -H "x-upsert: true" \
      --data-binary @"$F" > /dev/null \
      || { echo "[jjmk-archive] $T $M: อัปโหลดไม่ผ่าน (ยังไม่ลบอะไร)"; FAIL=1; continue; }
    # 3) ดาวน์โหลดกลับมาเทียบ byte ต่อ byte — ตรงเป๊ะเท่านั้นถึงลบ
    curl -sf "$SB_URL/storage/v1/object/public/archive/${T}_${M}.json" -o "$F.chk" \
      || { echo "[jjmk-archive] $T $M: ดึงกลับมาตรวจไม่ได้ (ยังไม่ลบอะไร)"; FAIL=1; continue; }
    if ! cmp -s "$F" "$F.chk"; then
      echo "[jjmk-archive] $T $M: ไฟล์บนคลังไม่ตรงกับ NAS (ยังไม่ลบอะไร)"; FAIL=1; rm -f "$F.chk"; continue
    fi
    rm -f "$F.chk"
    # 4) ผ่านทุกด่าน -> ลบเดือนนั้นออกจาก DB
    N="$(PSQL "with d as (delete from $T where $RANGE returning 1) select count(*) from d")" \
      || { echo "[jjmk-archive] $T $M: ลบไม่ผ่าน"; FAIL=1; continue; }
    echo "[jjmk-archive] $T $M: ย้ายแล้ว $N แถว (NAS + คลัง ✓, DB ลบแล้ว)"
  done
}

archive_table stock_counts   count_date created_at
archive_table stock_receipts order_date order_date

# 5) รวม index วันที่ทั้งหมดที่อยู่ในคลัง -> ให้หน้า "ดูข้อมูลย้อนหลัง" เห็นวันเก่า
if ls "$STATE"/dates_stock_counts_*.txt >/dev/null 2>&1; then
  cat "$STATE"/dates_stock_counts_*.txt | sort -u \
    | awk 'BEGIN{printf"["}NF{printf"%s\"%s\"",(c++?",":""),$1}END{print"]"}' > "$STATE/stock_counts_dates.json"
  curl -sf -X POST "$SB_URL/storage/v1/object/archive/stock_counts_dates.json" \
    -H "Authorization: Bearer $SERVICE_ROLE" -H "apikey: $SERVICE_ROLE" \
    -H "Content-Type: application/json" -H "x-upsert: true" \
    --data-binary @"$STATE/stock_counts_dates.json" > /dev/null \
    || { echo "[jjmk-archive] index: อัปโหลดไม่ผ่าน"; FAIL=1; }
fi

[ "$FAIL" = 0 ] && echo "[jjmk-archive] เสร็จสมบูรณ์" || echo "[jjmk-archive] เสร็จแบบมีบางรายการไม่ผ่าน (ดู log ด้านบน — รอบหน้าจะลองใหม่เอง)"
exit "$FAIL"
