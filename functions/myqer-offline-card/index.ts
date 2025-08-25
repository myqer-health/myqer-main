
/**
 * MYQER Edge Function
 * Deno runtime
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://myqer.com";

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
function userClient(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false }
  });
}

// Simple in-memory rate limiter per IP
const hits = new Map<string, { count: number; ts: number }>();
function rateLimit(ip: string, limit=5, windowMs=60_000) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, ts: now };
  if (now - rec.ts > windowMs) { rec.count = 0; rec.ts = now; }
  rec.count++; hits.set(ip, rec);
  return rec.count <= limit;
}

function json(data: any, init: number | ResponseInit = 200) {
  const status = typeof init === "number" ? init : (init as ResponseInit).status ?? 200;
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  return new Response(JSON.stringify(data), { status, headers });
}

Deno.serve(async (req) => {
  try {
    const client = userClient(req);
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = adminClient();
    const [{ data: profile }, { data: health }, { data: ice }] = await Promise.all([
      admin.from("profiles").select("full_name, country, locale, updated_at").eq("id", user.id).single(),
      admin.from("health_profiles").select("*").eq("user_id", user.id).single(),
      admin.from("ice_contacts").select("name, relation, phone, is_primary").eq("user_id", user.id).order("is_primary", { ascending: false })
    ]);

    const snapshot = {
      updated_at: profile.updated_at,
      profile,
      health,
      ice
    };
    return json(snapshot, 200);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
