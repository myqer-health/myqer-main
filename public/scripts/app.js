/* Minimal dashboard: 6-char codes, save to Supabase, working QR & logout */
(() => {
  // ---- config ----
  const SUPABASE_URL = 'https://dmntmhkncldgynufajei.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtbnRtaGtuY2xkZ3ludWZhamVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MzQ2MzUsImV4cCI6MjA3MjQxMDYzNX0.6DzOSb0xu5bp4g2wKy3SNtEEuSQavs_ohscyawvPmrY';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ---- tiny helpers ----
  const $ = id => document.getElementById(id);
  const toast = (m) => { const t=$('toast'); t.textContent=m; t.style.display='block'; setTimeout(()=>t.style.display='none',1500); };
  const CODE_VALID = /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/;  // ABC-123
  const CLEAN = s => (s||'').replace(/[\u2010-\u2015\u2212]/g,'-').toUpperCase();

  function makeCode() {
    const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1
    const pick = n => Array.from({length:n}, ()=> CH[Math.floor(Math.random()*CH.length)]).join('');
    return `${pick(3)}-${pick(3)}`;
  }
  function getOrCreateCode() {
    let c = CLEAN(localStorage.getItem('myqer_shortcode'));
    if (!CODE_VALID.test(c)) c = makeCode();
    localStorage.setItem('myqer_shortcode', c);
    return c;
  }
  async function ensureCodePersisted() {
    const { data: sess } = await sb.auth.getSession();
    const user = sess?.session?.user;
    if (!user) return getOrCreateCode();
    let code = getOrCreateCode();
    // try to upsert; if unique conflict, generate once more
    const up = await sb.from('profiles').upsert({ user_id:user.id, code }, { onConflict:'user_id' });
    if (up.error && /duplicate|unique/i.test(`${up.error.message} ${up.error.details}`)) {
      code = makeCode(); localStorage.setItem('myqer_shortcode', code);
      await sb.from('profiles').upsert({ user_id:user.id, code }, { onConflict:'user_id' });
    }
    return code;
  }

  // ---- QR ----
  async function drawQR() {
    const base = `https://${location.hostname.replace(/^www\./,'')}`;
    const code = await ensureCodePersisted();
    const url  = `${base}/c/${code}`;
    $('cardUrl').value = url;
    $('code').textContent = code;

    await new Promise((res, rej) => {
      QRCode.toCanvas(
        $('qrCanvas'),
        url,
        { errorCorrectionLevel:'M', margin:4, width:260 },
        err => err ? rej(err) : res()
      );
    });
  }

  // ---- save profile / health / ice (snake_case) ----
  async function getUser() {
    const { data } = await sb.auth.getUser();
    return data?.user || null;
  }

  async function saveProfile() {
    const u = await getUser(); if (!u) { toast('Saved locally (not signed in)'); return drawQR(); }
    const row = {
      user_id: u.id,
      code: getOrCreateCode(),
      full_name: $('fullName').value.trim(),
      date_of_birth: $('dob').value.trim(),
      country: $('country').value.trim(),
      national_id: $('nationalId').value.trim()
    };
    const { error } = await sb.from('profiles').upsert(row, { onConflict:'user_id' });
    if (error) return toast('Profile error');
    toast('Profile saved'); drawQR();
  }

  async function saveHealth() {
    const u = await getUser(); if (!u) { toast('Saved locally (not signed in)'); return drawQR(); }
    const row = {
      user_id: u.id,
      blood_type: $('bloodType').value.trim(),
      allergies: $('allergies').value.trim(),
      conditions: $('conditions').value.trim(),
      medications: $('medications').value.trim(),
      implants: $('implants').value.trim(),
      organ_donor: !!$('organDonor').checked,
      triage_override: 'auto'
    };
    const { error } = await sb.from('health_data').upsert(row, { onConflict:'user_id' });
    if (error) return toast('Health error');
    toast('Health saved'); drawQR();
  }

  async function saveICE() {
    const u = await getUser(); if (!u) { toast('Saved locally (not signed in)'); return drawQR(); }
    // MVP: wipe & insert one row
    await sb.from('ice_contacts').delete().eq('user_id', u.id);
    const row = {
      user_id: u.id,
      contact_order: 0,
      name: $('iceName').value.trim(),
      phone: $('icePhone').value.trim(),
      relationship: $('iceRelation').value.trim()
    };
    if (row.name || row.phone) await sb.from('ice_contacts').insert(row);
    toast('ICE saved'); drawQR();
  }

  // ---- logout ----
  async function doLogout() {
    try { await sb.auth.signOut(); } catch {}
    localStorage.removeItem('myqer_shortcode');
    location.href = './index.html';
  }

  // ---- wire ----
  window.addEventListener('DOMContentLoaded', () => {
    $('saveProfile').onclick = saveProfile;
    $('saveHealth').onclick  = saveHealth;
    $('saveICE').onclick     = saveICE;
    $('copyLink').onclick    = () => { navigator.clipboard.writeText($('cardUrl').value); toast('Link copied'); };
    $('openLink').onclick    = () => window.open($('cardUrl').value, '_blank', 'noopener');
    $('logout').onclick      = doLogout;

    $('net').textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE';
    window.addEventListener('online',  () => $('net').textContent='ONLINE');
    window.addEventListener('offline', () => $('net').textContent='OFFLINE');

    drawQR().catch(() => toast('QR error'));
  });
})();
