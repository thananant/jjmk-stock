// admin-reset-password v2 (b43)
// - lookup target by auth_uid OR username (old accounts may miss auth_uid)
// - auto-repair: if profile has no auth user, create one (email = username@jjmk.local) and link it
// - clear error messages so the app toast tells exactly what failed
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const EMAIL_DOMAIN = "@jjmk.local";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, srk, { auth: { persistSession: false } });

    // 1) who is calling
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "no token" }, 401);
    const { data: caller, error: cerr } = await admin.auth.getUser(jwt);
    if (cerr || !caller?.user) return json({ error: "invalid session - login again" }, 401);

    // 2) caller must be admin/owner in app_users
    const { data: cprof, error: cperr } = await admin.from("app_users")
      .select("role").eq("auth_uid", caller.user.id).maybeSingle();
    if (cperr) return json({ error: "read app_users failed: " + cperr.message }, 500);
    if (!cprof) return json({ error: "caller profile not found" }, 403);
    if (!["admin", "owner"].includes(String(cprof.role))) return json({ error: "not allowed" }, 403);

    // 3) input
    const body = await req.json().catch(() => ({}));
    const targetUid = body.target_uid ? String(body.target_uid).trim() : "";
    const username = String(body.username || "").trim();
    const pw = String(body.new_password || "");
    if (pw.length < 6) return json({ error: "password too short" }, 400);

    // 4) find target profile: auth_uid first, then username (case-insensitive)
    let prof: { auth_uid: string | null; username: string } | null = null;
    if (targetUid) {
      const { data } = await admin.from("app_users")
        .select("auth_uid,username").eq("auth_uid", targetUid).maybeSingle();
      prof = data ?? null;
    }
    if (!prof && username) {
      const { data } = await admin.from("app_users")
        .select("auth_uid,username").ilike("username", username).maybeSingle();
      prof = data ?? null;
    }
    if (!prof) return json({ error: "target profile not found (app_users): " + (username || targetUid) }, 404);

    // 5) profile has no linked auth user -> create & link (repairs old accounts)
    let uid = prof.auth_uid;
    if (!uid) {
      const email = (prof.username || username).toLowerCase() + EMAIL_DOMAIN;
      const { data: created, error: mkerr } = await admin.auth.admin.createUser({
        email, password: pw, email_confirm: true,
      });
      if (mkerr) {
        const { data: list, error: lerr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (lerr) return json({ error: "list users failed: " + lerr.message }, 500);
        const hit = (list?.users || []).find((u) => (u.email || "").toLowerCase() === email);
        if (!hit) return json({ error: "no auth user and create failed: " + mkerr.message }, 500);
        uid = hit.id;
      } else {
        uid = created.user.id;
      }
      await admin.from("app_users").update({ auth_uid: uid }).ilike("username", prof.username);
      if (!mkerr) return json({ ok: true, repaired: true }); // created with the new password already
    }

    // 6) set the new password
    const { error: uerr } = await admin.auth.admin.updateUserById(uid!, { password: pw });
    if (uerr) return json({ error: "update password failed: " + uerr.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
