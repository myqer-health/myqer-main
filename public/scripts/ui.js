(function () {
  // ===== menu sheet (your original 29 lines) =====
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

  // ===== QR code on dashboard (single source of truth) =====
  document.addEventListener('DOMContentLoaded', async () => {
    // expect these elements to exist in dashboard.html
    const canvas = document.getElementById('qrCanvas');      // the visual slot (a <canvas> or a <div> container)
    const codeEl = document.getElementById('codeUnderQR');   // text line under QR
    if (!canvas || !codeEl) return; // not on dashboard, do nothing

    // 1) Supabase client must already be created globally (config.js)
    //    window.supabase must exist, created with your anon + url
    const supabase = window.supabase;
    if (!supabase) {
      console.error('supabase client missing. Did you include config.js before ui.js?');
      codeEl.textContent = 'App error. Please reload.';
      return;
    }

    // 2) Require login
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      codeEl.textContent = 'Please sign in to generate your QR.';
      return;
    }
    const userId = session.user.id;

    // 3) Load (or create) a short code on the profile
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('id, code, full_name, country')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('profiles read error:', error);
      codeEl.textContent = 'Error reading profile.';
      return;
    }

    if (!profile) {
      const ins = await supabase
        .from('profiles')
        .insert({ id: userId })
        .select('id, code')
        .single();
      if (ins.error) {
        console.error('profiles insert error:', ins.error);
        codeEl.textContent = 'Error creating profile.';
        return;
      }
      profile = ins.data;
    }

    let code = profile.code;
    if (!code) {
      // generate readable, short, non-ambiguous code
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const rand = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
      code = `${rand(3)}-${rand(4)}-${rand(3)}`;  // e.g. F7N-8PG2-MQ4

      const up = await supabase.from('profiles').update({ code }).eq('id', userId);
      if (up.error) {
        console.error('profiles update error:', up.error);
        codeEl.textContent = 'Error saving code.';
        return;
      }
    }

    // 4) Draw QR for the short URL on your domain
    const shortUrl = `https://www.myqer.com/c/${code}`;
    codeEl.textContent = code;

    // qrcodejs draws an <img> into a container. If your "canvas" is a <canvas>,
    // render into its parent to avoid mixing contexts.
    const host = canvas.parentElement || canvas;

    // clean previous image(s)
    Array.from(host.querySelectorAll('img')).forEach(img => img.remove());

    // render fresh QR
    new QRCode(host, {
      text: shortUrl,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  });
})();
