// /public/scripts/app.js
// One-file dashboard logic. QR now uses external lib like the MVP demo; 6-char codes.

(function () {
  /* ---------- tiny helpers ---------- */
  const $  = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn, { passive: true });
  const withTimeout = (p, ms, label) =>
    Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error((label||'promise')+' timed out')), ms))]);

  // Merge only non-empty values from src into target (prevents blanking fields)
  function mergeNonEmpty(target, src){
    const out = { ...(target || {}) };
    for (const k in src){
      const v = src[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = v;
    }
    return out;
  }

  // Normalize date input to YYYY-MM-DD (for <input type="date"> + server)
  function normalizeDOB(s) {
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
    if (m) {
      const M = String(+m[1]).padStart(2,'0');
      const D = String(+m[2]).padStart(2,'0');
      const Y = +m[3];
      if (Y > 1900) return `${Y}-${M}-${D}`;
    }
    return s;
  }

  /* ---------- global state ---------- */
  let supabase, isSupabaseAvailable = false;
  let isOnline = navigator.onLine;
  let userData = { profile: {}, health: {} };
  let iceContacts = [];

  // Allowed chars (no O/0/I/1). We now use a 6-character code.
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const autoSaveTimers = {}; // needed for autosave debounce
  window.userData = userData; window.iceContacts = iceContacts;

  /* ---------- Supabase init ---------- */
  try {
    const URL = 'https://dmntmhkncldgynufajei.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtbnRtaGtuY2xkZ3ludWZhamVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MzQ2MzUsImV4cCI6MjA3MjQxMDYzNX0.6DzOSb0xu5bp4g2wKy3SNtEEuSQavs_ohscyawvPmrY';
    if (window.supabase && URL && KEY) {
      supabase = window.supabase.createClient(URL, KEY);
      isSupabaseAvailable = true;
    }
  } catch(e){ console.warn('Supabase init failed:', e); }

  const getUserId = () => !isSupabaseAvailable
    ? Promise.resolve(null)
    : supabase.auth.getUser().then(r => { if (r.error) throw r.error; return r.data?.user?.id || null; });

  /* ---------- toasts ---------- */
  function toast(msg, type='success', ms=2200){
    let area = $('toastArea');
    if (!area) { area = document.createElement('div'); area.id='toastArea'; area.setAttribute('aria-live','polite'); document.body.appendChild(area); }
    const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg;
    area.appendChild(el);
    requestAnimationFrame(()=> el.classList.add('show'));
    setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 250); }, ms);
  }

  /* ---------- network ---------- */
  function updateNetworkStatus(){
    const badge = $('netStatus'), banner = $('offlineBanner');
    if (navigator.onLine){
      if (badge){ badge.textContent='ONLINE'; badge.className='online'; }
      if (banner) banner.style.display='none';
      isOnline = true;
    } else {
      if (badge){ badge.textContent='OFFLINE'; badge.className='offline'; }
      if (banner) banner.style.display='block';
      isOnline = false;
    }
  }

  /* ---------- triage ---------- */
  const TRIAGE = ['green','amber','red','black'];
  function updateTriagePill(level='green'){
    const pill = $('triagePill'); if (!pill) return;
    TRIAGE.forEach(c=>pill.classList.remove(c)); pill.classList.add(level); pill.textContent = level.toUpperCase();
  }
  function calculateTriage(){
    const over = $('triageOverride')?.value || 'auto';
    if (over !== 'auto') return updateTriagePill(over);
    const allergies  = ($('hfAllergies')?.value || '').toLowerCase();
    const conditions = ($('hfConditions')?.value || '').toLowerCase();
    if (allergies.includes('anaphylaxis') || allergies.includes('severe')) return updateTriagePill('red');
    updateTriagePill((allergies || conditions) ? 'amber' : 'green');
  }

  /* ---------- SHORT CODE / URL (UPDATED: 6-char permanent code) ---------- */
 // 6-char maker stays the same
function makeShort6(){
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1
  return Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('');
}

async function ensureShortCode(){
  const valid = /^[A-HJ-NP-Z2-9]{6}$/;
  let local = localStorage.getItem('myqer_shortcode');

  // If we’re offline / no Supabase, keep local (or mint once)
  if (!(isSupabaseAvailable && isOnline)) {
    if (!valid.test(local||'')) { local = makeShort6(); localStorage.setItem('myqer_shortcode', local); }
    return local;
  }

  const uid = await getUserId().catch(()=>null);
  if (!uid) {
    if (!valid.test(local||'')) { local = makeShort6(); localStorage.setItem('myqer_shortcode', local); }
    return local;
  }

  // 1) Try to read existing code from server and adopt it
  const { data: prof } = await supabase.from('profiles').select('code').eq('user_id', uid).maybeSingle();
  if (prof && valid.test(prof.code||'')) {
    localStorage.setItem('myqer_shortcode', prof.code);
    return prof.code;
  }

  // 2) No server code -> create one (respecting uniqueness)
  let code = valid.test(local||'') ? local : makeShort6();
  localStorage.setItem('myqer_shortcode', code);

  let attempt = 0;
  while (attempt < 6) {
    const { error } = await supabase.from('profiles').upsert({ user_id: uid, code }, { onConflict: 'user_id' });
    if (!error) return code;
    const msg = (error.message||'').toLowerCase() + ' ' + (error.details||'').toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique')) {
      code = makeShort6();
      localStorage.setItem('myqer_shortcode', code);
      attempt++;
      continue;
    }
    console.warn('shortcode upsert err:', error);
    return code; // fall back to local (shouldn’t happen often)
  }
  return code;
}
  /* ============= QR CODE (UPDATED: use library like MVP, robust loader) =============
     - We load the same browser build you used in the minimal snippet.
     - If the first CDN fails, we try another, so a broken link won’t leave a blank canvas.
     - We always draw a proper QR with 3 finder squares and real data.
  */
  let qrLibReady = null;
  function loadQRCodeLib(){
    if (window.QRCode) return Promise.resolve();
    if (qrLibReady) return qrLibReady;
    const srcs = [
      // Primary
      'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
      // Fallbacks
      'https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js',
      'https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'
    ];
    qrLibReady = new Promise((resolve, reject)=>{
      let i=0;
      const tryNext=()=>{
        if (i>=srcs.length) return reject(new Error('QRCode library failed to load'));
        const s=document.createElement('script');
        s.src=srcs[i++]; s.async=true; s.onload=()=> resolve(); s.onerror=tryNext;
        document.head.appendChild(s);
      };
      tryNext();
    });
    return qrLibReady;
  }

  /* ---------- Offline text builder ---------- */
  function buildOfflineText(shortUrl) {
    const pf = userData?.profile || {};
    const hd = userData?.health  || {};
    const name    = pf.full_name ?? pf.fullName ?? '';
    const dob     = pf.date_of_birth ?? pf.dob ?? '';
    const nat     = pf.national_id ?? pf.healthId ?? '';
    const country = pf.country ?? '';
    const donor   = hd.organDonor ? 'Y' : 'N';

    const L = [];
    const L1 = []; if (name) L1.push('Name: '+name); if (dob) L1.push('DOB: '+dob); if (country) L1.push('C: '+country); if (nat) L1.push('ID: '+nat);
    if (L1.length) L.push(L1.join(' | '));
    const L2 = []; if (hd.bloodType) L2.push('BT: '+hd.bloodType); if (hd.allergies) L2.push('ALG: '+hd.allergies);
    if (L2.length) L.push(L2.join(' | '));
    const L3 = []; if (hd.conditions) L3.push('COND: '+hd.conditions); if (hd.medications) L3.push('MED: '+hd.medications); if (hd.implants) L3.push('IMP: '+hd.implants);
    L3.push('DONOR: '+donor); if (L3.length) L.push(L3.join(' | '));
    const ice = Array.isArray(iceContacts) ? iceContacts : [];
    const iceLines = ice.filter(c => c && (c.name || c.phone)).map(c => `${c.name||''} — ${c.relationship||''} — ${c.phone||''}`.replace(/\s+—\s+—\s*$/,'').trim());
    if (iceLines.length) L.push('ICE: '+iceLines.join(' | '));
    L.push('URL: '+shortUrl);
    return L.join('\n').slice(0,1200);
  }

  /* ---------- QR (UPDATED draw using the library) ---------- */
async function generateQRCode() {
  const qrCanvas = $('qrCanvas');
  const qrPlaceholder = $('qrPlaceholder');
  const codeUnderQR = $('codeUnderQR');
  const cardUrlInput = $('cardUrl');
  const qrStatus = $('qrStatus');
  if (!qrCanvas) return;

  try {
    await loadQRCodeLib();
const code = await ensureShortCode();

// Always non-www; strip trailing slash just in case
const base = (location?.origin || 'https://myqer.com').replace(/\/$/, '').replace('://www.', '://');
const shortUrl = `${base}/c/${code}`;

// URL-ONLY QR for now
const payload = shortUrl;

if (codeUnderQR) codeUnderQR.textContent = code;
if (cardUrlInput) cardUrlInput.value = shortUrl;

await new Promise((resolve, reject) =>
  window.QRCode.toCanvas(
    qrCanvas,
    payload,
    { width: 220, margin: 2, errorCorrectionLevel: 'M' }, // easier to scan
    err => err ? reject(err) : resolve()
  )
);

    if ($('offlineText')) $('offlineText').value = payload; // keep box in sync

    qrCanvas.style.display = 'block';
    if (qrPlaceholder) qrPlaceholder.style.display = 'none';
    if (qrStatus) { qrStatus.textContent = 'QR Code generated successfully'; qrStatus.hidden = false; }
  } catch (err) {
    console.error('QR render error:', err);
    if (qrPlaceholder) qrPlaceholder.style.display = 'flex';
    if (qrCanvas) qrCanvas.style.display = 'none';
    if (qrStatus) { qrStatus.textContent='⚠️ Couldn’t draw QR. Please try again.'; qrStatus.hidden=false; }
  }
}
function buildOfflineText(shortUrl) {
  const pf = userData?.profile || {};
  const hd = userData?.health  || {};
  const name    = pf.full_name ?? pf.fullName ?? '';
  const dob     = pf.date_of_birth ?? pf.dob ?? '';
  const nat     = pf.national_id ?? pf.healthId ?? '';
  const country = pf.country ?? '';
  const donor   = hd.organDonor ? 'Y' : 'N';

  const L = [];
  L.push(shortUrl); // ← URL FIRST so iOS recognizes it
  const L1 = []; if (name) L1.push('Name: '+name); if (dob) L1.push('DOB: '+dob); if (country) L1.push('C: '+country); if (nat) L1.push('ID: '+nat);
  if (L1.length) L.push(L1.join(' | '));
  const L2 = []; if (hd.bloodType) L2.push('BT: '+hd.bloodType); if (hd.allergies) L2.push('ALG: '+hd.allergies);
  if (L2.length) L.push(L2.join(' | '));
  const L3 = []; if (hd.conditions) L3.push('COND: '+hd.conditions); if (hd.medications) L3.push('MED: '+hd.medications); if (hd.implants) L3.push('IMP: '+hd.implants);
  L3.push('DONOR: '+donor);
  if (L3.length) L.push(L3.join(' | '));
  const ice = Array.isArray(iceContacts) ? iceContacts : [];
  const iceLines = ice.filter(c => c && (c.name || c.phone))
                      .map(c => `${c.name||''} — ${c.relationship||''} — ${c.phone||''}`.replace(/\s+—\s+—\s*$/,'').trim());
  if (iceLines.length) L.push('ICE: '+iceLines.join(' | '));
  // we already put the raw URL first; no need to repeat "URL: ..."
  return L.join('\n').slice(0, 900); // keep it lighter so the QR isn’t too dense
}
  /* ---------- ICE ---------- */
  function renderIceContacts(){
    const box=$('iceContactsList'); if (!box) return;
    box.innerHTML='';
    (Array.isArray(iceContacts)?iceContacts:[]).forEach((c,idx)=>{
      const row=document.createElement('div'); row.className='ice-row'; row.dataset.index=String(idx);
      row.innerHTML =
      `<div class="ice-contact-header">
         <div class="contact-number">${idx+1}</div>
         <div class="ice-actions">
           <button class="iceSaveBtn" data-act="save" data-idx="${idx}">Save</button>
           <button class="iceDeleteBtn" data-act="del" data-idx="${idx}" aria-label="Delete contact">✖</button>
         </div>
       </div>
       <div class="ice-form-grid">
         <div class="form-group"><label>Name</label>
           <input type="text" class="iceName" data-field="name" data-idx="${idx}" value="${c.name||''}" placeholder="Name">
         </div>
         <div class="form-group"><label>Relationship</label>
           <input type="text" class="iceRelation" data-field="relationship" data-idx="${idx}" value="${c.relationship||''}" placeholder="Spouse, Parent">
         </div>
         <div class="form-group"><label>Phone</label>
           <input type="tel" class="icePhone" data-field="phone" data-idx="${idx}" value="${c.phone||''}" placeholder="+1 555 123 4567">
         </div>
       </div>`;
      box.appendChild(row);
    });
    const addBtn=$('addIce');
    if (addBtn){ if (iceContacts.length>=3){ addBtn.disabled=true; addBtn.textContent='Maximum 3 contacts reached'; } else { addBtn.disabled=false; addBtn.textContent='Add Emergency Contact'; } }
  }
  const persistIceLocally = ()=>{ localStorage.setItem('myqer_ice', JSON.stringify(iceContacts||[])); window.iceContacts=iceContacts; };
  function addIceContact(){ if (!Array.isArray(iceContacts)) iceContacts=[]; if (iceContacts.length>=3) return toast('Maximum 3 emergency contacts allowed','error'); iceContacts.push({name:'',relationship:'',phone:''}); persistIceLocally(); renderIceContacts(); }
  function updateIceContact(idx, field, value){ if (!iceContacts[idx]) return; iceContacts[idx][field]=value; persistIceLocally(); }
  function saveICEToServer(){
    if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
    return getUserId().then(uid=>{
      if (!uid) return;
      return supabase.from('ice_contacts').delete().eq('user_id', uid).then(()=>{
        const rows=(iceContacts||[]).filter(c=>c.name||c.phone).map((c,i)=>({ user_id: uid, contact_order:i, name:c.name||'', relationship:c.relationship||'', phone:c.phone||'' }));
        if (!rows.length) return;
        return supabase.from('ice_contacts').insert(rows);
      });
    });
  }
  function saveICE(){
    const entries=(iceContacts||[]).map(c=>({ name:(c.name||'').trim(), relationship:(c.relationship||'').trim(), phone:(c.phone||'').trim() })).filter(c=>c.name||c.phone);
    if (entries.length>3) return toast('Maximum 3 emergency contacts allowed','error');
    for (const e of entries){ if (!(e.name && e.phone)) return toast('Each contact needs a name and phone','error'); }
    iceContacts=entries; persistIceLocally();
    saveICEToServer().then(()=>{ toast('Emergency contacts saved','success'); generateQRCode(); }).catch(e=>{ console.error(e); toast('Error saving emergency contacts','error'); });
  }

  /* ---------- Profile & Health ---------- */
  // Upsert profile (identity) for both schema variants, without ever regenerating code
  function upsertProfileSmart(rowBase){
    return getUserId().then(async (uid)=>{
      if (!uid) return;

      // Permanent code: generate once if missing, otherwise keep as-is
      const code = await ensureShortCode();

      // Detect schema: try a snake-only column; if it errors, assume camel
      let schema = 'snake';
      try {
        const probe = await supabase.from('profiles').select('user_id').limit(1);
        if (probe.error && /does not exist/i.test(probe.error.message)) schema = 'camel';
      } catch (_) { schema = 'camel'; }

      const snakeRow = {
        user_id:       uid,
        code,
        full_name:     rowBase.full_name,
        date_of_birth: rowBase.date_of_birth,
        country:       rowBase.country,
        national_id:   rowBase.national_id
      };
      const camelRow = {
        userId:   uid,
        code,
        fullName: rowBase.full_name,
        dob:      rowBase.date_of_birth,
        country:  rowBase.country,
        healthId: rowBase.national_id
      };

      async function upsertSnake(){
        const existing = await supabase.from('profiles').select('user_id').eq('user_id', uid).maybeSingle();
        if (existing.error && !/no rows/i.test(existing.error.message)) throw existing.error;

        if (existing.data){
          const { error } = await supabase.from('profiles')
            .update({
              full_name:     snakeRow.full_name,
              date_of_birth: snakeRow.date_of_birth,
              country:       snakeRow.country,
              national_id:   snakeRow.national_id,
              code:          snakeRow.code
            })
            .eq('user_id', uid);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('profiles').insert(snakeRow);
          if (error) throw error;
        }
      }

      async function upsertCamel(){
        const existing = await supabase.from('profiles').select('userId').eq('userId', uid).maybeSingle();
        if (existing.error && !/no rows/i.test(existing.error.message)) throw existing.error;

        if (existing.data){
          const { error } = await supabase.from('profiles')
            .update({
              fullName: camelRow.fullName,
              dob:      camelRow.dob,
              country:  camelRow.country,
              healthId: camelRow.healthId,
              code:     camelRow.code
            })
            .eq('userId', uid);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('profiles').insert(camelRow);
          if (error) throw error;
        }
      }

      if (schema === 'snake') { await upsertSnake(); } else { await upsertCamel(); }
      return code;
    });
  }

  // Save Identity (the function that was missing in your last paste)
  function saveProfile(){
    const profile={
      full_name:     $('profileFullName')?.value.trim() || '',
      date_of_birth: $('profileDob') ? normalizeDOB($('profileDob').value.trim()) : '',
      country:       $('profileCountry')?.value.trim() || '',
      national_id:   $('profileHealthId')?.value.trim() || ''
    };
    userData.profile = profile;
    window.userData  = userData;
    localStorage.setItem('myqer_profile', JSON.stringify(profile));

    if (!isSupabaseAvailable){ toast('Saved locally (offline mode)','info'); generateQRCode(); return; }

    supabase.auth.getSession().then(r=>{
      const session=r?.data?.session || null;
      if (!session){ toast('Saved locally — please sign in to sync','info'); generateQRCode(); return; }
      upsertProfileSmart(profile)
        .then(()=>{ toast('Profile saved','success'); generateQRCode(); })
        .catch(e=>{ console.error(e); toast('Error saving profile: ' + (e?.message || 'Unknown'), 'error'); });
    });
  }

  function saveHealth() {
    const health = {
      bloodType:      $('hfBloodType')?.value || '',
      allergies:      $('hfAllergies')?.value || '',
      conditions:     $('hfConditions')?.value || '',
      medications:    $('hfMeds')?.value || '',
      implants:       $('hfImplants')?.value || '',
      organDonor:     !!$('hfDonor')?.checked,
      triageOverride: $('triageOverride')?.value || 'auto'
    };

    userData.health = health;
    localStorage.setItem('myqer_health', JSON.stringify(health));

    if (!isSupabaseAvailable) { calculateTriage(); toast('Saved locally (offline mode)','info'); generateQRCode(); return; }

    supabase.auth.getSession()
      .then((r) => {
        const session = r?.data?.session;
        if (!session) { calculateTriage(); toast('Saved locally — please sign in to sync','info'); generateQRCode(); throw new Error('no session'); }
        return getUserId();
      })
      .then((uid) => {
        if (!uid) { calculateTriage(); toast('Saved locally — please sign in to sync','info'); generateQRCode(); throw new Error('no uid'); }

        const snake = { user_id: uid, blood_type: health.bloodType, allergies: health.allergies, conditions: health.conditions, medications: health.medications, implants: health.implants, organ_donor: health.organDonor, triage_override: health.triageOverride };
        const camel = { user_id: uid, bloodType:   health.bloodType, allergies: health.allergies, conditions: health.conditions, medications: health.medications, implants: health.implants, organDonor: health.organDonor, triageOverride: health.triageOverride };

        return supabase.from('health_data').upsert(snake, { onConflict: 'user_id' })
          .then(({ error }) => { if (!error) return; return supabase.from('health_data').upsert(camel, { onConflict: 'user_id' }).then(({ error:e2 }) => { if (e2) throw e2; }); });
      })
      .then(() => { calculateTriage(); toast('Health info saved','success'); generateQRCode(); })
      .catch((e) => { if (e && (e.message==='no session' || e.message==='no uid')) return; console.error(e); toast('Error saving health','error'); });
  }

  /* ---------- Load (local-first, server-sync) ---------- */
  function fillFromLocal(){
    try{
      // profile
      const lp=localStorage.getItem('myqer_profile'); if (lp) userData.profile=JSON.parse(lp)||{};
      window.userData=userData;
      const p=userData.profile; const set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
      set('profileFullName', p.full_name ?? p.fullName);
      set('profileDob',      p.date_of_birth ?? p.dob);
      set('profileCountry',  p.country);
      set('profileHealthId', p.national_id ?? p.healthId);

      // health
      const lh = localStorage.getItem('myqer_health');
      if (lh) {
        try {
          const raw = JSON.parse(lh) || {};
          userData.health = {
            bloodType:      raw.bloodType      != null ? raw.bloodType      : raw.blood_type,
            allergies:      raw.allergies      != null ? raw.allergies      : raw.allergy_list,
            conditions:     raw.conditions     != null ? raw.conditions     : raw.medical_conditions,
            medications:    raw.medications    != null ? raw.medications    : raw.meds,
            implants:       raw.implants       != null ? raw.implants       : raw.implants_devices,
            organDonor:     raw.organDonor     != null ? raw.organDonor     : raw.organ_donor,
            triageOverride: raw.triageOverride != null ? raw.triageOverride : raw.triage_override
          };
        } catch (_) { userData.health = {}; }
      }
      window.userData = userData;
      const h = userData.health;
      set('hfBloodType',  h.bloodType);
      set('hfAllergies',  h.allergies);
      set('hfConditions', h.conditions);
      set('hfMeds',       h.medications);
      set('hfImplants',   h.implants);
      if ($('hfDonor')) $('hfDonor').checked = !!h.organDonor;
      if ($('triageOverride')) $('triageOverride').value = h.triageOverride || 'auto';
      calculateTriage();

      // ice
      const li=localStorage.getItem('myqer_ice'); iceContacts=li ? (JSON.parse(li)||[]) : []; window.iceContacts=iceContacts; renderIceContacts();
    }catch(e){ console.warn('Local fill failed', e); }
  }

  function loadFromServer(){
    if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
    return withTimeout(supabase.auth.getSession(),3000,'getSession').then(res=>{
      if (!res.data?.session) return;
      return withTimeout(getUserId(),3000,'getUserId').then(uid=>{
        if (!uid) return;

        // profiles (try snake first, then camel; merge non-empty)
        const selSnake = supabase.from('profiles').select('*').eq('user_id',uid).maybeSingle();
        return withTimeout(selSnake,4000,'profiles.select.snake').then(rp=>{
          if (rp?.data) return rp;
          const selCamel = supabase.from('profiles').select('*').eq('userId',uid).maybeSingle();
          return withTimeout(selCamel,4000,'profiles.select.camel');
        }).then(rp=>{
          const prof = rp?.data || null;
          if (prof){
            const serverProfile = {
              full_name:     prof.full_name     ?? prof.fullName     ?? '',
              date_of_birth: prof.date_of_birth ?? prof.dob          ?? '',
              country:       prof.country       ?? '',
              national_id:   prof.national_id   ?? prof.healthId     ?? '',
              code:          prof.code          ?? ''
            };
            userData.profile = mergeNonEmpty(userData.profile || {}, serverProfile);
            window.userData=userData;
            if (userData.profile && userData.profile.code) {
  localStorage.setItem('myqer_shortcode', userData.profile.code);
}
            localStorage.setItem('myqer_profile', JSON.stringify(userData.profile));
            const p=userData.profile; const set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
            set('profileFullName', p.full_name);
            set('profileDob',      p.date_of_birth);
            set('profileCountry',  p.country);
            set('profileHealthId', p.national_id);
          }
        }).then(()=>{
          // health
          return withTimeout(supabase.from('health_data').select('*').eq('user_id', uid).maybeSingle(),4000,'health_data.select')
            .then((rh) => {
              const raw = rh?.data || null; if (!raw) return;
              const norm = {
                bloodType:      raw.bloodType      != null ? raw.bloodType      : raw.blood_type,
                allergies:      raw.allergies      != null ? raw.allergies      : raw.allergy_list,
                conditions:     raw.conditions     != null ? raw.conditions     : raw.medical_conditions,
                medications:    raw.medications    != null ? raw.medications    : raw.meds,
                implants:       raw.implants       != null ? raw.implants       : raw.implants_devices,
                organDonor:     raw.organDonor     != null ? raw.organDonor     : raw.organ_donor,
                triageOverride: raw.triageOverride != null ? raw.triageOverride : raw.triage_override
              };
              userData.health = Object.assign({}, userData.health, norm);
              localStorage.setItem('myqer_health', JSON.stringify(userData.health));

              const h=userData.health; const set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
              set('hfBloodType',  h.bloodType);
              set('hfAllergies',  h.allergies);
              set('hfConditions', h.conditions);
              set('hfMeds',       h.medications);
              set('hfImplants',   h.implants);
              if ($('hfDonor')) $('hfDonor').checked = !!h.organDonor;
              if ($('triageOverride')) $('triageOverride').value = h.triageOverride || 'auto';
              calculateTriage();
            });
        }).then(()=>{
          // ice
          return withTimeout(supabase.from('ice_contacts').select('*').eq('user_id',uid).order('contact_order',{ascending:true}),4000,'ice_contacts.select').then(ri=>{
            const ice=ri?.data||[];
            if (Array.isArray(ice)){
              iceContacts=ice.map(r=>({name:r.name||'',relationship:r.relationship||'',phone:r.phone||''})); window.iceContacts=iceContacts;
              localStorage.setItem('myqer_ice', JSON.stringify(iceContacts)); renderIceContacts();
            }
          });
        });
      });
    }).catch(e=>console.warn('Server load failed', e));
  }

  /* ---------- buttons ---------- */
  function wireQRButtons(){
    on($('copyLink'),'click',()=>{ const url=$('cardUrl')?.value||''; if(!url) return toast('No link to copy','error'); navigator.clipboard.writeText(url).then(()=>toast('Link copied','success')).catch(()=>toast('Copy failed','error')); });
    on($('openLink'),'click',()=>{ const url=$('cardUrl')?.value||''; if(!url) return toast('No link to open','error'); window.open(url,'_blank','noopener'); });
    on($('dlPNG'),'click',()=>{ const c=$('qrCanvas'); if(!c||c.style.display==='none') return toast('Generate QR first','error'); const a=document.createElement('a'); a.download='myqer-emergency-qr.png'; a.href=c.toDataURL('image/png'); a.click(); toast('PNG downloaded','success'); });

// inside wireQRButtons() -> dlSVG handler
on($('dlSVG'),'click', async ()=>{
  const shortUrl = $('cardUrl')?.value || '';
  if (!shortUrl) return toast('Generate QR first','error');
  const payload = $('offlineText')?.value || buildOfflineText(shortUrl); // use hybrid
  try {
    await loadQRCodeLib();
    window.QRCode.toString(payload, { type: 'svg', width: 220, margin: 1, errorCorrectionLevel: 'Q' }, (err, svg)=>{
      if (err) { console.error(err); return toast('SVG build failed','error'); }
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'myqer-emergency-qr.svg';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      toast('SVG downloaded','success');
    });
  } catch(e) {
    console.error(e); toast('QR library not loaded','error');
  }
});

    on($('printQR'),'click',()=>{ const canvas=$('qrCanvas'); const code=$('codeUnderQR')?.textContent||''; if(!canvas||canvas.style.display==='none'||!code) return toast('Generate QR first','error'); const dataUrl=canvas.toDataURL('image/png'); const w=window.open('','_blank','noopener'); if(!w) return toast('Pop-up blocked','error'); w.document.write(`<html><head><title>MYQER Emergency Card - ${code}</title><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;text-align:center;padding:2rem}.code{font-weight:700;letter-spacing:.06em}img{width:300px;height:300px;image-rendering:pixelated}@media print{@page{size:auto;margin:12mm}}</style></head><body><h1>MYQER™ Emergency Card</h1><p class="code">Code: ${code}</p><img alt="QR Code" src="${dataUrl}"><p>Scan this QR code for emergency information</p><p style="font-size:.8em;color:#666">www.myqer.com</p><script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script></body></html>`); w.document.close(); });
    on($('copyOffline'),'click',()=>{ const t=$('offlineText')?.value||''; if(!t.trim()) return toast('No offline text to copy','error'); navigator.clipboard.writeText(t).then(()=>toast('Offline text copied','success')).catch(()=>toast('Copy failed','error')); });
    on($('dlOffline'),'click',()=>{ const t=$('offlineText')?.value||''; if(!t.trim()) return toast('No offline text to download','error'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([t],{type:'text/plain'})); a.download='myqer-offline.txt'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Offline text downloaded','success'); });
  }

 /* ---------- delete / logout (now clears the local 6-char code too) ---------- */
function deleteAccount(){
  const phrase = ($('deletePhrase')?.value || '').trim().toUpperCase();
  if (phrase !== 'DELETE MY ACCOUNT') return toast('Type the phrase exactly','error');
  if (!confirm('Are you sure? This permanently deletes your data.')) return;

  // helper: nuke local cache & code
  const wipeLocal = () => {
    try {
      localStorage.removeItem('myqer_shortcode');   // 🔥 remove permanent QR code
      localStorage.removeItem('myqer_profile');
      localStorage.removeItem('myqer_health');
      localStorage.removeItem('myqer_ice');
      // fallback sledgehammer
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
  };

  // server-side purge then sign out
  (function(){
    if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
    return getUserId().then(uid=>{
      if (!uid) return;
      // delete child tables first, then profile
      return supabase.from('ice_contacts').delete().eq('user_id',uid)
        .then(()=> supabase.from('health_data').delete().eq('user_id',uid))
        .then(()=> supabase.from('profiles').delete().eq('user_id',uid))
        .catch(e => { console.warn('server delete failed', e); });
    }).then(()=> {
      // try to sign out (ignore errors)
      return supabase.auth.signOut().catch(()=>{});
    });
  })()
  .finally(()=>{
    wipeLocal();                              // ✅ clears shortcode so a fresh one will be generated
    location.href = 'index.html';             // back to landing / login
  });
}

  /* ---------- autosave wiring ---------- */
  function setupAutoSave(id, fn, delay) {
    if (!delay && delay !== 0) delay = 600;
    const el = $(id);
    if (!el) return;
    function run() {
      clearTimeout(autoSaveTimers[id]);
      autoSaveTimers[id] = setTimeout(() => {
        Promise.resolve(fn()).catch(e => console.warn('autosave err', e));
      }, delay);
    }
    el.addEventListener('input',  run);
    el.addEventListener('change', run); // important for date/select/checkbox/iOS
  }

  /* ---------- DOM ready ---------- */
  document.addEventListener('DOMContentLoaded', ()=>{
    updateNetworkStatus();
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    on($('saveProfile'),'click',saveProfile);
    on($('saveHealth'),'click',saveHealth);
    on($('saveIce'),'click',saveICE);
    on($('addIce'),'click',addIceContact);
    on($('deleteBtn'),'click',deleteAccount);
    on($('btnSignOut'),'click',()=> (isSupabaseAvailable ? supabase.auth.signOut().catch(()=>{}) : Promise.resolve()).then(()=>{ location.href='index.html'; }));

    on($('iceContactsList'),'input',(e)=>{ const t=e.target, idx=+t.dataset.idx, field=t.dataset.field; if(Number.isInteger(idx)&&field) updateIceContact(idx, field, t.value); });
    on($('iceContactsList'),'click',(e)=>{ const btn=e.target.closest?.('[data-act]'); if(!btn) return; const idx=+btn.dataset.idx; if(btn.dataset.act==='del'){ iceContacts.splice(idx,1); persistIceLocally(); renderIceContacts(); saveICEToServer().catch(()=>{}); generateQRCode(); toast('Contact removed','success'); } else if(btn.dataset.act==='save'){ saveICE(); } });

    ['hfAllergies','hfConditions'].forEach(id=> on($(id),'input',calculateTriage));
    on($('triageOverride'),'change',()=>{ calculateTriage(); saveHealth(); });

    ['profileFullName','profileDob','profileCountry','profileHealthId'].forEach(id=> setupAutoSave(id, saveProfile));
    ['hfBloodType','hfAllergies','hfConditions','hfMeds','hfImplants','hfDonor'].forEach(id=> setupAutoSave(id, saveHealth));

    wireQRButtons();

    fillFromLocal();
    generateQRCode();              // draw from whatever we have
    loadFromServer().then(()=> generateQRCode()); // redraw after server sync

    const loading=$('loadingState'); if (loading) loading.style.display='none';
    setTimeout(()=>{ const l=$('loadingState'); if (l) l.style.display='none'; }, 4000);
  });

  // never-stuck loader guards
  window.addEventListener('error', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });
  window.addEventListener('unhandledrejection', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });

  // light heartbeat (helps some hosting keep the worker warm)
  setInterval(()=>{ try{ navigator.sendBeacon?.('/ping',''); }catch{} }, 120000);
})();
