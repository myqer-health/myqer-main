
// MYQER backend hooks for Edge Functions integration
// Include after your existing /scripts/app.js on app.html
// Adds: Regenerate QR, Build Voice, and Responder Preview

const MYQER = (() => {
  const state = { jwt: null, projectUrl: null };

  async function init() {
    // Grab JWT from localStorage and Supabase project URL from config.js global
    state.jwt = localStorage.getItem('myqer_jwt');
    // Optional: set a global window.MYQER_SUPABASE_URL in config.js; fallback to env-like meta
    state.projectUrl = window.SUPABASE_URL || (document.querySelector('meta[name="supabase-url"]')?.content) || '';
    bindUI();
  }

  function bindUI() {
    document.getElementById('btnRegenQR')?.addEventListener('click', regenQR);
    document.getElementById('btnBuildVoice')?.addEventListener('click', buildVoice);
    document.getElementById('btnPreviewResponder')?.addEventListener('click', previewResponder);
  }

  async function regenQR() {
    const out = document.getElementById('previewOut');
    try {
      const res = await fetch(`${state.projectUrl}/functions/v1/myqer-qr-generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.jwt}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      // Update QR section if present
      const link = document.getElementById('cardLink');
      if (link && data.url) { link.href = data.url; link.textContent = data.url; }
      const qrBox = document.getElementById('qr');
      if (qrBox && data.svg_url) {
        const img = document.createElement('img');
        img.alt = 'QR';
        img.src = data.svg_url;
        img.style.maxWidth = '240px';
        qrBox.innerHTML = ''; qrBox.appendChild(img);
      }
      if (out) { out.textContent = JSON.stringify(data, null, 2); }
    } catch (e) {
      if (out) out.textContent = `Error: ${e.message}`;
      console.error(e);
    }
  }

  async function buildVoice() {
    const out = document.getElementById('previewOut');
    const lang = (localStorage.getItem('myqer_lang')||'en').slice(0,2);
    try {
      const res = await fetch(`${state.projectUrl}/functions/v1/myqer-tts-build`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (out) out.textContent = JSON.stringify({ voice_ready: !!data.url, url: data.url }, null, 2);
      // Optionally auto-play
      if (data.url) {
        const audio = document.getElementById('voicePlayer') || document.createElement('audio');
        audio.id = 'voicePlayer'; audio.controls = true; audio.src = data.url;
        (document.getElementById('voiceWrap') || document.body).appendChild(audio);
        try { await audio.play(); } catch {}
      }
    } catch (e) {
      if (out) out.textContent = `Error: ${e.message}`;
      console.error(e);
    }
  }

  async function previewResponder() {
    const out = document.getElementById('previewOut');
    try {
      // If your page shows the short code in the link (?code=XXXX), reuse it
      const link = document.getElementById('cardLink');
      let code = null;
      if (link?.href) {
        const u = new URL(link.href);
        code = u.searchParams.get('code');
      }
      if (!code) {
        // attempt to ask backend for latest code by regenerating (safe op for preview)
        const regen = await fetch(`${state.projectUrl}/functions/v1/myqer-qr-generate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${state.jwt}` }
        });
        const data = await regen.json();
        if (!regen.ok) throw new Error(data.error || 'No code');
        code = data.short_code;
      }
      const lang = (localStorage.getItem('myqer_lang')||'en').slice(0,2);
      const res = await fetch(`${state.projectUrl}/functions/v1/myqer-card-public?code=${encodeURIComponent(code)}&lang=${lang}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (out) out.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      if (out) out.textContent = `Error: ${e.message}`;
      console.error(e);
    }
  }

  // Optional: call buildVoice automatically after saving health (listen for a custom event)
  window.addEventListener('myqer:healthSaved', () => {
    // Throttle build to avoid spamming provider; delay a bit
    clearTimeout(window.__MYQER_TTS_TM);
    window.__MYQER_TTS_TM = setTimeout(buildVoice, 800);
  });

  init();
  return { regenQR, buildVoice, previewResponder };
})();
