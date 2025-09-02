(function () {
  const sheet = document.getElementById('menuSheet');
  const toggle = document.getElementById('menuToggle');
  const closeBtn = document.getElementById('menuClose');

  function open() {
    if (!sheet) return;
    sheet.hidden = false;
    document.body.classList.add('no-scroll');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }
  function close() {
    if (!sheet) return;
    sheet.hidden = true;
    document.body.classList.remove('no-scroll');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  toggle && toggle.addEventListener('click', () => {
    sheet && (sheet.hidden ? open() : close());
  });
  closeBtn && closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  sheet && sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close(); // click outside card
  });
// QR Code generator logic
document.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("qrCanvas");
  const codeText = document.getElementById("codeUnderQR");
  if (!canvas || !codeText) return;

  try {
    // Call Supabase Edge Function to fetch short code
    const resp = await fetch("/c/test"); // test route, replace later with real user code
    const data = await resp.json();

    if (!data || !data.card) {
      codeText.textContent = "⚠️ No code generated yet";
      return;
    }

    const shortCode = data.card.code;
    codeText.textContent = shortCode;

    // Build QR pointing to your Render domain (short URL)
    const qrUrl = `https://www.myqer.com/c/${shortCode}`;

    // Use QRCode library
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    new QRCode(canvas, {
      text: qrUrl,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });

  } catch (err) {
    console.error("QR error:", err);
    codeText.textContent = "❌ Error loading QR";
  }
});
  // === QR Code rendering on dashboard ===
document.addEventListener('DOMContentLoaded', async () => {
  const supabase = window.supabaseClient;
  const canvas = document.getElementById('qrCanvas');
  const codeEl = document.getElementById('codeUnderQR');
  if (!supabase || !canvas || !codeEl) return;

  // helper to draw QR on canvas
  const drawQR = (url) => {
    // qrcodejs draws into an element; pass the canvas element directly
    // Clear any previous drawing (qrcodejs will overlay a <img>, so reset)
    const parent = canvas.parentElement;
    // remove previously inserted <img> if any
    Array.from(parent.querySelectorAll('img')).forEach(img => img.remove());
    // Render a fresh QR
    new QRCode(parent, {
      text: url,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  };

  try {
    // 1) Require login
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      codeEl.textContent = 'Please sign in to generate your QR.';
      return;
    }
    const userId = session.user.id;

    // 2) Load (or create) profile code
    // Try to read the code from profiles
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('id, code, full_name, country')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    // If the row doesn't exist yet, create it so we can store a code later
    if (!profile) {
      const { data: inserted, error: insErr } = await supabase
        .from('profiles')
        .insert({ id: userId })
        .select('id, code')
        .single();
      if (insErr) throw insErr;
      profile = inserted;
    }

    // If no code yet, generate a short one (client-side; server can also do this)
    let code = profile.code;
    if (!code) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
      const rand = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
      code = `${rand(3)}-${rand(4)}-${rand(3)}`;  // e.g., F7N-8PG2-MQ4

      // Save it
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ code })
        .eq('id', userId);
      if (upErr) throw upErr;
    }

    // 3) Build short URL + draw QR
    const shortUrl = `${window.MYQER.RENDER_BASE}/c/${code}`;
    codeEl.textContent = code;
    drawQR(shortUrl);

  } catch (e) {
    console.error('QR generate error:', e);
    codeEl.textContent = 'Error generating QR.';
  }
});
