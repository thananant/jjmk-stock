// Supabase Edge Function: order-reminders
// เตือน LINE ก่อนเวลาตัดรอบสั่งของซัพโหมด "วันบังคับ" — เรียกโดย pg_cron ทุก 15 นาที (body {})
// Deploy: Dashboard > Edge Functions > สร้างชื่อ order-reminders > วางโค้ดนี้ > Deploy > Verify JWT ปิด
// Secrets ที่ใช้ (มีอยู่แล้วในโปรเจกต์): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINE_TOKEN
// Config ใน DB: remind_before_min (นาทีเตือนล่วงหน้า), remind_nocut_time (เวลาเตือนซัพไม่มี cutoff),
//               remind_line_group (group_id ปลายทาง — ว่าง = ไม่ส่ง แค่รายงานผล)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseHM(s: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)/.exec((s || "").trim());
  return m ? +m[1] * 60 + +m[2] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const LINE = Deno.env.get("LINE_TOKEN") || "";

    // เวลาไทย (UTC+7, ไม่มี DST)
    const th = new Date(Date.now() + 7 * 3600 * 1000);
    const todayISO = th.toISOString().slice(0, 10);
    const nowMin = th.getUTCHours() * 60 + th.getUTCMinutes();
    const dowKey = DK[th.getUTCDay()];

    // config
    const { data: cfgRows } = await db.from("config").select("*")
      .in("key", ["remind_before_min", "remind_nocut_time", "remind_line_group"]);
    const cfg: Record<string, string> = {};
    (cfgRows || []).forEach((r: { key: string; value: string }) => (cfg[r.key] = String(r.value ?? "")));
    const beforeMin = Math.max(15, parseInt(cfg.remind_before_min || "180", 10) || 180);
    const nocutMin = parseHM(cfg.remind_nocut_time || "18:00") ?? 1080;
    const groupId = (cfg.remind_line_group || "").trim();

    // ซัพทั้งหมด → คัดโหมดบังคับที่วันนี้เป็นวันสั่ง และตอนนี้อยู่ในช่วงเตือน
    const { data: sups, error: serr } = await db.from("suppliers").select("name,order_mode,lead_days,cutoff,schedule,cycle_days,month_days");
    if (serr) return json({ error: serr.message }, 500);

    type Cand = { name: string; cutoff: string | null };
    const cands: Cand[] = [];
    const pushIfInWindow = (s: { name: string; cutoff?: string | null }) => {
      const cm = parseHM(s.cutoff || "");
      if (cm != null) {
        if (nowMin >= cm - beforeMin && nowMin < cm) cands.push({ name: s.name, cutoff: (s.cutoff || "").trim().slice(0, 5) });
      } else {
        if (nowMin >= nocutMin) cands.push({ name: s.name, cutoff: null });
      }
    };
    // วันส่งใบสั่งล่าสุดต่อซัพ (anchor ของโหมดรอบทุก N วัน)
    const lastSent: Record<string, string> = {};
    if ((sups || []).some((s) => s.order_mode === "interval")) {
      const since = new Date(Date.now() + 7 * 3600e3 - 120 * 86400000).toISOString().slice(0, 10);
      const { data: rs } = await db.from("stock_receipts").select("sup,order_date").gte("order_date", since);
      (rs || []).forEach((r: { sup: string; order_date: string }) => {
        const d = String(r.order_date).slice(0, 10); const k = (r.sup || "").trim();
        if (k && (!lastSent[k] || d > lastSent[k])) lastSent[k] = d;
      });
    }
    for (const s of sups || []) {
      if (s.order_mode === "interval") {
        // รอบทุก N วัน: ครบรอบ (หรือยังไม่เคยส่ง) = ต้องสั่งวันนี้
        const cyc = Math.max(2, Math.min(90, parseInt(s.cycle_days, 10) || 15));
        const l = lastSent[(s.name || "").trim()];
        let due = true;
        if (l) {
          const nd = new Date(l + "T00:00:00"); nd.setDate(nd.getDate() + cyc);
          const p = (n: number) => String(n).padStart(2, "0");
          due = todayISO >= nd.getFullYear() + "-" + p(nd.getMonth() + 1) + "-" + p(nd.getDate());
        }
        if (due) pushIfInWindow(s);
        continue;
      }
      if (s.order_mode === "monthdays") {
        // b40: order on fixed days of month, e.g. "1,16" (short months roll to last day)
        const md = String(s.month_days || "").split(",").map((x: string) => parseInt(x, 10)).filter((n: number) => n >= 1 && n <= 31);
        if (md.length) {
          const y = parseInt(todayISO.slice(0, 4), 10), m = parseInt(todayISO.slice(5, 7), 10), dom = parseInt(todayISO.slice(8, 10), 10);
          const lastDay = new Date(y, m, 0).getDate();
          const due = md.includes(dom) || (dom === lastDay && md.some((x: number) => x > lastDay));
          if (due) pushIfInWindow(s);
        }
        continue;
      }
      const sc = s.schedule;
      const hasSched = sc && typeof sc === "object" && Object.keys(sc).some((k) => DK.includes(k) && sc[k]);
      const mode = s.order_mode === "any" ? "any" : s.order_mode === "fixed" ? "fixed" : (hasSched ? "fixed" : "any");
      if (mode !== "fixed" || !hasSched || !sc[dowKey]) continue; // ไม่ใช่วันบังคับของซัพนี้
      pushIfInWindow(s);
    }
    if (!cands.length) return json({ ok: true, sent: 0, note: "no supplier in reminder window" });

    // ตัดตัวที่เตือนไปแล้ววันนี้
    const { data: logged } = await db.from("reminder_log").select("sup")
      .eq("remind_date", todayISO).eq("kind", "cutoff")
      .in("sup", cands.map((c) => c.name));
    const done = new Set((logged || []).map((r: { sup: string }) => r.sup));
    const todo = cands.filter((c) => !done.has(c.name));
    if (!todo.length) return json({ ok: true, sent: 0, note: "already reminded" });

    // เช็คว่าซัพไหนมียอดสั่งของวันนี้แล้ว (สาขาไหนก็ได้) — ใช้ประกอบข้อความ ไม่ตัดออก
    const { data: ords } = await db.from("stock_counts").select("sup")
      .eq("count_date", todayISO).gt("ordered", 0)
      .in("sup", todo.map((c) => c.name));
    const hasOrder = new Set((ords || []).map((r: { sup: string }) => r.sup));

    // ประกอบข้อความเดียว
    const lines = todo.map((c) =>
      "• " + c.name + (c.cutoff ? " — สั่งก่อน " + c.cutoff : " — ต้องสั่งภายในวันนี้") +
      (hasOrder.has(c.name) ? " (มียอดสั่งแล้วบางส่วน)" : " (ยังไม่มียอดสั่งวันนี้)"));
    const hh = String(th.getUTCHours()).padStart(2, "0"), mm = String(th.getUTCMinutes()).padStart(2, "0");
    const text = "⏰ เตือนสั่งของ " + hh + ":" + mm + " น.\nวันนี้ต้องสั่ง " + todo.length + " ซัพ:\n" + lines.join("\n");

    // ส่ง LINE (ถ้าตั้งกลุ่มไว้)
    let sent = 0, lineErr: string | null = null;
    if (groupId && LINE) {
      const r = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + LINE },
        body: JSON.stringify({ to: groupId, messages: [{ type: "text", text }] }),
      });
      if (r.ok) sent = 1; else lineErr = "LINE " + r.status + ": " + (await r.text()).slice(0, 200);
    }

    // log กันซ้ำ — เฉพาะเมื่อส่งสำเร็จ หรือไม่ได้ตั้งกลุ่ม (dry-run ก็ log กันสแปมผลลัพธ์)
    if (sent || !groupId) {
      await db.from("reminder_log").upsert(
        todo.map((c) => ({ sup: c.name, remind_date: todayISO, kind: "cutoff" })),
        { onConflict: "sup,remind_date,kind" });
    }

    return json({ ok: true, sent, suppliers: todo.map((c) => c.name), text, lineErr });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
