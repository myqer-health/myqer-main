
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
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    if (!rateLimit(ip, 20, 60_000)) return json({ error: "rate_limited" }, 429);

    const url = new URL(req.url);
    const code = url.searchParams.get("code") ?? "";
    const orgId = url.searchParams.get("org") ?? "";
    const lang = (url.searchParams.get("lang") ?? "en").slice(0,2);

    const admin = adminClient();

    // authorization: require "x-org-user" header with the authenticated clinician user id (validated by RLS via org_members)
    const orgUser = req.headers.get("x-org-user");
    if (!orgUser) return json({ error: "unauthorized" }, 401);

    const { data: member } = await admin.from("org_members").select("*").eq("org_id", orgId).eq("user_id", orgUser).maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);

    const { data: qr } = await admin.from("qr_codes").select("user_id, active").eq("short_code", code).maybeSingle();
    if (!qr || !qr.active) return json({ error: "invalid_code" }, 404);

    // reuse public builder by calling internal endpoint (or inline minimal set)
    const internal = new URL(req.url);
    internal.pathname = internal.pathname.replace("card-dispatch","card-public");
    const res = await fetch(internal.toString());
    const data = await res.json();

    data.meta.ttl_seconds = 1800; // extend TTL
    data.meta.dispatch = true;

    await admin.from("access_logs").insert({
      user_id: qr.user_id,
      kind: "dispatch",
      context: { short_code: code, org_id: orgId, org_user: orgUser }
    });

    return json(data, 200);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
