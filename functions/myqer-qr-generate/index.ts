
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

import qrcodegen from "qrcode-generator";

function randomCode(len=7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// render QR as SVG and PNG (simple encoder)
function qrMatrix(data: string) {
  const qr = qrcodegen(0, 'M');
  qr.addData(data);
  qr.make();
  const size = qr.getModuleCount();
  const isDark = (x: number, y: number) => qr.isDark(y, x);
  return { size, isDark };
}

function svgFromMatrix(matrix: { size: number, isDark: (x:number,y:number)=>boolean }, scale=8, margin=4) {
  const n = matrix.size, s = scale;
  const dim = (n + margin*2) * s;
  let path = "";
  for (let y=0;y<n;y++) for (let x=0;x<n;x++) {
    if (matrix.isDark(x,y)) path += `M ${(x+margin)*s} ${(y+margin)*s} h ${s} v ${s} h ${-s} Z `;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// Simple PNG encoder (monochrome) using manual RIFF? -> We avoid complexity; store SVG only and let client rasterise if needed.
/* PNG generation in Edge runtime is non-trivial without heavy deps; SVG is sufficient and scalable. */

Deno.serve(async (req) => {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    if (!rateLimit(ip, 10, 60_000)) return json({ error: "rate_limited" }, 429);

    const client = userClient(req);
    const { data: { user }, error: uerr } = await client.auth.getUser();
    if (uerr || !user) return json({ error: "unauthorized" }, 401);

    const admin = adminClient();

    const code = randomCode();
    const url = `${APP_ORIGIN}/card.html?code=${code}`;

    // upsert qr_codes
    await admin.from("qr_codes").upsert({
      user_id: user.id, short_code: code, active: true, last_regenerated_at: new Date().toISOString()
    });

    // Build SVG
    const m = qrMatrix(url);
    const svg = svgFromMatrix(m);

    // store in bucket
    const svgPath = `qr/${user.id}/${code}.svg`;
    const upload = await admin.storage.from("qr").upload(svgPath, new Blob([svg], { type: "image/svg+xml" }), { upsert: true });
    if (upload.error) return json({ error: upload.error.message }, 500);

    // signed URL
    const { data: signed } = await admin.storage.from("qr").createSignedUrl(svgPath, 3600);

    // log
    await admin.from("access_logs").insert({ user_id: user.id, kind: "qr_regen", context: { short_code: code } });

    return json({ short_code: code, svg_url: signed?.signedUrl, url });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
