
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
    if (!rateLimit(ip, 5, 60_000)) return json({ error: "rate_limited" }, 429);

    const url = new URL(req.url);
    const code = url.searchParams.get("code") ?? "";
    const lang = (url.searchParams.get("lang") ?? "en").slice(0,2);

    const admin = adminClient();
    // lookup user by code
    const { data: qr } = await admin.from("qr_codes").select("user_id, active, scan_ttl_seconds").eq("short_code", code).maybeSingle();
    if (!qr || !qr.active) return json({ error: "invalid_code" }, 404);

    // fetch profile & health
    const { data: profile } = await admin.from("profiles").select("id, full_name, country, locale, updated_at").eq("id", qr.user_id).single();
    const { data: health } = await admin.from("health_profiles").select("*").eq("user_id", qr.user_id).single();
    const { data: ice } = await admin.from("ice_contacts").select("name, relation, phone, is_primary").eq("user_id", qr.user_id).order("is_primary", { ascending: false });

    // server phrases
    const phrasesUrl = new URL(`/locales/server-phrases/${lang}.json`, req.url);
    let phrases: Record<string,string>;
    try {
      const res = await fetch(phrasesUrl);
      phrases = await res.json();
    } catch {
      const fallback = new URL(`/locales/server-phrases/en.json`, req.url);
      const res = await fetch(fallback);
      phrases = await res.json();
    }

    // consent filter
    const out:any = {
      labels: phrases,
      meta: {
        ttl_seconds: qr.scan_ttl_seconds,
        aid_disclaimer: phrases["Aid disclaimer"],
        updated: profile.updated_at
      },
      profile: { full_name: profile.full_name, country: profile.country },
      sections: {}
    };

    if (health.show_blood) out.sections.blood = { label: phrases["Blood type"], value: health.blood_type, donor: health.organ_donor };
    if (health.show_prefs) out.sections.prefs = {
      label: phrases["Life support"],
      life_support_pref: health.life_support_pref, resuscitation: health.resuscitation
    };
    if (health.show_allergies) out.sections.allergies = { label: phrases["Allergies"], items: (health.allergies || "").split(",").map(s=>s.trim()).filter(Boolean) };
    if (health.show_conditions) out.sections.conditions = { label: phrases["Conditions"], items: (health.conditions || "").split(",").map(s=>s.trim()).filter(Boolean) };
    if (health.show_meds) out.sections.meds = { label: phrases["Medications"], items: (health.meds || "").split(",").map(s=>s.trim()).filter(Boolean) };
    if (health.show_notes && health.care_notes) out.sections.notes = { label: phrases["Care notes"], text: health.care_notes };

    if (health.show_ice && ice) {
      out.sections.ice = { label: phrases["Emergency contact"], contacts: ice.slice(0,2) };
    }

    // include signed voice url if exists
    const { data: tts } = await admin.from("tts_assets").select("*").eq("user_id", qr.user_id).single();
    if (tts?.asset_path) {
      const { data: signed } = await admin.storage.from("voices").createSignedUrl(tts.asset_path, qr.scan_ttl_seconds);
      out.voice = { url: signed?.signedUrl, label: phrases["Voice"] };
    }

    // log access
    await admin.from("access_logs").insert({
      user_id: qr.user_id,
      kind: "responder",
      context: { short_code: code, ua: (req.headers.get("user-agent")||"").slice(0,80), ip_hash: ip.split(",")[0].trim().slice(-6) }
    });

    return json(out, 200);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
