<script>
(function () {
  // ===== MENU SHEET (unchanged) =========================================
  const sheet  = document.getElementById('menuSheet');
  const toggle = document.getElementById('menuToggle');
  const closeBtn = document.getElementById('menuClose');

  function openSheet() {
    if (!sheet) return;
    sheet.hidden = false;
    document.body.classList.add('no-scroll');
    toggle && toggle.setAttribute('aria-expanded', 'true');
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    document.body.classList.remove('no-scroll');
    toggle && toggle.setAttribute('aria-expanded', 'false');
  }
  toggle && toggle.addEventListener('click', () => sheet.hidden ? openSheet() : closeSheet());
  closeBtn && closeBtn.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());
  sheet && sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  // ===== DASHBOARD QR ====================================================
  document.addEventListener('DOMContentLoaded', async () => {
    // Elements expected on dashboard.html
    const hostEl = document.getElementById('qrCanvas');   // a <div> or <canvas> container
    const codeEl = document.getElementById('codeUnderQR'); // the text shown under the QR
    if (!hostEl || !codeEl) return; // not on dashboard

    // 1) Supabase client (created in auth.js/config.js)
    const sb = window.supabaseClient || window.supabase;
    if (!sb) {
      console.error('Supabase client missing. Load config.js + auth.js before this script.');
      codeEl.textContent = 'App error. Please reload.';
      return;
    }

    // 2) Require an active session
    const { data: { session }, error: sessErr } = await sb.auth.getSession();
    if (sessErr) console.error('getSession error:', sessErr);
    if (!session) { codeEl.textContent = 'Please sign in to generate your QR.'; return; }
    const userId = session.user.id;

    // 3) Ensure profile row exists and fetch code
    const { data: prof, error: selErr } = await sb
      .from('profiles')
      .select('id, code')
      .eq('id', userId)
      .maybeSingle();

    if (selErr) { console.error('profiles read error:', selErr); codeEl.textContent = 'Error reading profile.'; return; }

    let profile = prof;
    if (!profile) {
      const ins = await sb.from('profiles').insert({ id: userId }).select('id, code').single();
      if (ins.error) { console.error('profiles insert error:', ins.error); codeEl.textContent = 'Error creating profile.'; return; }
      profile = ins.data;
    }

    // 4) Generate a unique, human-readable code if missing
    let code = profile.code;
    if (!code) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1
      const rnd = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
      let attempts = 0, ok = false, candidate = '';
      while (!ok && attempts < 6) {
        candidate = `${rnd(3)}-${rnd(4)}-${rnd(3)}`; // e.g. F7N-8PG2-MQ4
        const { data: exists, error: chkErr } = await sb.from('profiles').select('id').eq('code', candidate).maybeSingle();
        if (chkErr) { console.error('code check error:', chkErr); break; }
        ok = !exists;
        attempts++;
      }
      if (!ok) { codeEl.textContent = 'Could not generate code. Try again.'; return; }

      const up = await sb.from('profiles').update({ code: candidate }).eq('id', userId);
      if (up.error) { console.error('profiles update error:', up.error); codeEl.textContent = 'Error saving code.'; return; }
      code = candidate;
    }

    // 5) Ensure QRCode lib is available (loads once if missing)
    async function ensureQRCode() {
      if (window.QRCode) return;
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    try { await ensureQRCode(); } catch { codeEl.textContent = 'QR library failed to load.'; return; }

    // 6) Render QR
    const shortUrl = `https://www.myqer.com/c/${encodeURIComponent(code)}`;
    codeEl.textContent = code;

    const container = hostEl.tagName === 'CANVAS' ? hostEl.parentElement || hostEl : hostEl;
    container.innerHTML = ''; // clear any previous image
    new QRCode(container, {
      text: shortUrl,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  });
})();
</script>
