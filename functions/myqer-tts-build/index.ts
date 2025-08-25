
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

// Pluggable TTS providers: azure or elevenlabs
const TTS_PROVIDER = Deno.env.get("TTS_PROVIDER") || "azure";
const TTS_API_KEY = Deno.env.get("TTS_API_KEY") || "";
const TTS_REGION = Deno.env.get("TTS_REGION") || ""; // azure

type Snapshot = {
  profile: { full_name?: string },
  health: any,
  ice?: Array<{name:string, phone:string}>
};

function buildSSML(lang: string, snap: Snapshot) {
  const name = snap.profile.full_name || "Unknown";
  const allergies = (snap.health.allergies || "").split(",").map((s:string)=>s.trim()).filter(Boolean).slice(0,3).join(", ");
  const conditions = (snap.health.conditions || "").split(",").map((s:string)=>s.trim()).filter(Boolean).slice(0,3).join(", ");
  const meds = (snap.health.meds || "").split(",").map((s:string)=>s.trim()).filter(Boolean).slice(0,3).join(", ");
  const ice = snap.ice?.[0];

  const parts = [
    `Emergency card for ${name}.`,
    allergies ? `Allergies: ${allergies}.` : "",
    conditions ? `Conditions: ${conditions}.` : "",
    meds ? `Medications: ${meds}.` : "",
    ice ? `Emergency contact ${ice.name}, ${ice.phone}.` : ""
  ].filter(Boolean).join(" ");
  return `<speak version="1.0" xml:lang="${lang}"><p>${parts}</p></speak>`;
}

async function ttsAzure(ssml: string, lang: string): Promise<Uint8Array> {
  const voice = {
    "en": "en-GB-SoniaNeural","es":"es-ES-ElviraNeural","fr":"fr-FR-DeniseNeural","de":"de-DE-KatjaNeural",
    "it":"it-IT-ElsaNeural","pt":"pt-PT-FernandaNeural","ro":"ro-RO-AlinaNeural","ar":"ar-EG-SalmaNeural",
    "hi":"hi-IN-SwaraNeural","zh":"zh-CN-XiaoxiaoNeural"
  }[lang] ?? "en-GB-SoniaNeural";
  const endpoint = `https://${TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml",
      "Ocp-Apim-Subscription-Key": TTS_API_KEY,
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3"
    },
    body: ssml.replace("<speak", `<speak><voice name="${voice}"` ).replace("</speak>", "</voice></speak>")
  });
  if (!res.ok) throw new Error(`Azure TTS failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf;
}

async function ttsEleven(ssml: string, lang: string): Promise<Uint8Array> {
  // Basic text fallback (strip SSML)
  const text = ssml.replace(/<[^>]+>/g," ");
  const voiceId = "21m00Tcm4TlvDq8ikWAM"; // default
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": TTS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.7 } })
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf;
}

Deno.serve( async (req) => {
  try {
    const client = userClient(req);
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = adminClient();
    const { lang } = await req.json().catch(()=>({ lang: "en" }));
    const lang2 = (lang || "en").slice(0,2);

    const [{ data: profile }, { data: health }, { data: ice }] = await Promise.all([
      admin.from("profiles").select("full_name, locale").eq("id", user.id).single(),
      admin.from("health_profiles").select("*").eq("user_id", user.id).single(),
      admin.from("ice_contacts").select("name, phone, is_primary").eq("user_id", user.id).order("is_primary", { ascending: false })
    ]);

    const snap: Snapshot = { profile, health, ice };
    const ssml = buildSSML(lang2, snap);

    let audio: Uint8Array;
    if (TTS_PROVIDER === "elevenlabs") audio = await ttsEleven(ssml, lang2);
    else audio = await ttsAzure(ssml, lang2);

    // store
    const path = `voices/${user.id}/${lang2}.mp3`;
    const up = await admin.storage.from("voices").upload(path, new Blob([audio], { type: "audio/mpeg" }), { upsert: true });
    if (up.error) throw new Error(up.error.message);

    await admin.from("tts_assets").upsert({ user_id: user.id, lang: lang2, status: "ready", asset_path: path, last_build_at: new Date().toISOString(), error: null });

    const { data: signed } = await admin.storage.from("voices").createSignedUrl(path, 3600);
    await admin.from("access_logs").insert({ user_id: user.id, kind: "tts_build", context: { lang: lang2, ok: true } });

    return json({ url: signed?.signedUrl });
  } catch (e) {
    const admin = adminClient();
    const { data: { user } } = await admin.auth.getUser(); // may be null in error path
    if (user?.id) await admin.from("tts_assets").upsert({ user_id: user.id, status: "error", error: String(e) });
    return json({ error: String(e?.message || e) }, 500);
  }
});
