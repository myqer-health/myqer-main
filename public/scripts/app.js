// /public/scripts/app.js
// Dashboard logic with stable URL QR + separate offline vCard QR (200px).
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

  /* ---------- SHORT CODE / URL (permanent 6-char code) ---------- */
  function makeShort6(){
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
      const { error } = await supabase.from('profiles')
        .upsert({ user_id: uid, code }, { onConflict: 'user_id' });
      if (!error) return code;
      const msg = (error.message||'').toLowerCase() + ' ' + (error.details||'').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique')) {
        code = makeShort6();
        localStorage.setItem('myqer_shortcode', code);
        attempt++;
        continue;
      }
      console.warn('shortcode upsert err:', error);
      return code; // fallback
    }
    return code;
  }

  /* ============= QR CODE loader ============= */
  let qrLibReady = null;
  function loadQRCodeLib(){
    if (window.QRCode) return Promise.resolve();
    if (qrLibReady) return qrLibReady;
    const srcs = [
      'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
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

  /* ---------- OFFLINE VCARD HELPERS ---------- */
  // NEW: readiness + triage color (the missing bits that stopped drawing)
  function buildVCardPayload(shortUrl) {
  const p   = (window.userData && window.userData.profile) || {};
  const h   = (window.userData && window.userData.health)  || {};
  const ice = Array.isArray(window.iceContacts) ? window.iceContacts[0] : null;

  const fullName = (p.full_name ?? p.fullName ?? '').trim();
  const [first = '', ...rest] = fullName.split(/\s+/);
  const last = rest.length ? rest[rest.length - 1] : '';

  // Pill -> TRIAGE text
  const triageText = (() => {
    const pill = document.getElementById('triagePill');
    if (!pill) return 'GREEN';
    if (pill.classList.contains('red'))   return 'RED';
    if (pill.classList.contains('amber')) return 'AMBER';
    if (pill.classList.contains('black')) return 'BLACK';
    return 'GREEN';
  })();

  // Compose a multiline NOTE first (real \n), then escape to vCard-safe with \n -> \\n
  const rawNote = [
    `Country: ${p.country || '—'}`,
    `Blood type: ${h.bloodType || '—'}`,
    `Donor: ${h.organDonor ? 'Y' : 'N'}`,
    `Triage: ${triageText}`,
    h.allergies   ? `Allergies: ${h.allergies}`     : '',
    h.conditions  ? `Conditions: ${h.conditions}`   : '',
    h.medications ? `Medication: ${h.medications}`  : '',
    ice?.phone    ? `ICE: ${ice.phone}`             : ''
  ].filter(Boolean).join('\n');

  // Keep QR compact; then escape (vCard 3.0: \\, \;, \,, \n)
  let trimmed = rawNote.length > 400 ? (rawNote.slice(0, 397) + '…') : rawNote;
  const note = trimmed
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

  const bday = (() => {
    const d = p.date_of_birth ?? p.dob ?? '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    return m ? `${m[1]}${m[2]}${m[3]}` : (d || '');
  })();

  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${last.replace(/,/g,'\\,')};${first.replace(/,/g,'\\,')};;;`,
    `FN:${(fullName || `${first} ${last}`.trim()).replace(/,/g,'\\,')}`,
    `BDAY:${bday}`,
    `TEL;TYPE=CELL:${(ice?.phone || '').replace(/,/g,'\\,')}`,
    `URL:${(shortUrl || '').replace(/,/g,'\\,')}`,
    `NOTE:${note}`,
    'END:VCARD'
  ].join('\r\n');
}
  // Make offline canvas visually match main QR tile (rounded, white, shadow)
// Make offline canvas visually match the main QR tile (rounded, white, shadow)
function styleVcardCanvas () {
  const c = $('vcardCanvas');
  if (!c) return;

  // visual style (same look as black QR tile)
  c.style.background      = '#fff';
  c.style.borderRadius    = '12px';
  c.style.padding         = '8px';
  c.style.boxShadow       = '0 8px 32px rgba(220, 38, 38, 0.10)';

  // size (CSS size – QR is drawn at same width in toCanvas below)
  c.style.width           = '300px';
  c.style.height          = '300px';
  c.style.imageRendering  = 'pixelated';
  c.style.display         = 'block';
}
  /* ---------- Offline vCard readiness + triage color ---------- */
function isOfflineReady() {
  const p = (window.userData && window.userData.profile) || {};
  const h = (window.userData && window.userData.health)  || {};
  const hasICE =
    Array.isArray(window.iceContacts) &&
    window.iceContacts[0] &&
    window.iceContacts[0].phone &&
    window.iceContacts[0].name;

  // Must have Country, Blood type, explicit Donor (true/false), and one ICE contact
  const donorSet = (h.organDonor === true || h.organDonor === false);
  return Boolean(p.country && h.bloodType && donorSet && hasICE);
}

const TRIAGE_COLOR = { RED:'#E11D48', AMBER:'#F59E0B', GREEN:'#16A34A', BLACK:'#111827' };
function currentTriageHex() {
  const pill = document.getElementById('triagePill');
  if (!pill) return TRIAGE_COLOR.GREEN;
  if (pill.classList.contains('red'))   return TRIAGE_COLOR.RED;
  if (pill.classList.contains('amber')) return TRIAGE_COLOR.AMBER;
  if (pill.classList.contains('black')) return TRIAGE_COLOR.BLACK;
  return TRIAGE_COLOR.GREEN;
}

  /* ---------- URL QR (online) ---------- */
  async function renderUrlQR() {
    const qrCanvas    = $('qrCanvas');
    const codeUnderQR = $('codeUnderQR');
    const cardUrlInput= $('cardUrl');
    const qrStatus    = $('qrStatus');
    if (!qrCanvas) return;

    try {
      await loadQRCodeLib();
      const code = await ensureShortCode();
      const base = (location?.origin || 'https://myqer.com')
        .replace(/\/$/, '')
        .replace('://www.', '://');
      const shortUrl = `${base}/c/${code}`;

      if (codeUnderQR) codeUnderQR.textContent = code;
      if (cardUrlInput) cardUrlInput.value = shortUrl;

      await new Promise((resolve, reject) =>
        window.QRCode.toCanvas(
          qrCanvas,
          shortUrl,
          { width: 200, margin: 1, errorCorrectionLevel: 'M' },
          err => err ? reject(err) : resolve()
        )
      );

      qrCanvas.style.display = 'block';
      if (qrStatus) { qrStatus.textContent = 'QR Code generated successfully'; qrStatus.hidden = false; }
    } catch (err) {
      console.error('URL QR error:', err);
      if (qrStatus) { qrStatus.textContent='⚠️ Couldn’t draw QR. Please try again.'; qrStatus.hidden=false; }
    }
  }

  /* ---------- vCard QR (offline ICE) ---------- */
  async function renderVCardQR() {
    const canvas = $('vcardCanvas');
    const help   = $('vcardHelp');
    const regen  = $('regenVcardBtn');
    const ready  = isOfflineReady();      // <-- existed now

    // If UI isn’t in the page yet, bail quietly
    if (!canvas && !help && !regen) return;

    if (help) {
      help.textContent = ready
        ? 'Offline QR is ready. Re-generate and re-print if Country, Blood, Donor, Triage or ICE change.'
        : 'Needs Country, Blood, Donor and one ICE contact before generating.';
    }
    if (regen) regen.disabled = !ready;

    if (!canvas || !ready) return;

    try {
      await loadQRCodeLib();
      const code = await ensureShortCode();
      const base = (location?.origin || 'https://myqer.com')
        .replace(/\/$/, '')
        .replace('://www.', '://');
      const shortUrl = `${base}/c/${code}`;
      const vcard = buildVCardPayload(shortUrl);
      const dark  = currentTriageHex();   // <-- existed now

      await new Promise((resolve, reject) =>
  window.QRCode.toCanvas(
    canvas,
    vcard,
    {
      width: 300,          // bigger than before (was 200)
      margin: 1,           // a bit more quiet zone
      errorCorrectionLevel: 'Q',
      color: { dark, light: '#FFFFFF' }
    },
    err => err ? reject(err) : resolve()
  )
);

      styleVcardCanvas(); // make it look like the main tile
    } catch (e) {
      console.error('vCard QR error:', e);
    }
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
    saveICEToServer()
      .then(()=>{ toast('Emergency contacts saved','success'); renderUrlQR(); renderVCardQR(); })
      .catch(e=>{ console.error(e); toast('Error saving emergency contacts','error'); });
  }

  /* ---------- Profile & Health ---------- */
  function upsertProfileSmart(rowBase){
    return getUserId().then(async (uid)=>{
      if (!uid) return;
      const code = await ensureShortCode();

      // Detect schema
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

    if (!isSupabaseAvailable){ toast('Saved locally (offline mode)','info'); renderUrlQR(); renderVCardQR(); return; }

    supabase.auth.getSession().then(r=>{
      const session=r?.data?.session || null;
      if (!session){ toast('Saved locally — please sign in to sync','info'); renderUrlQR(); renderVCardQR(); return; }
      upsertProfileSmart(profile)
        .then(()=>{ toast('Profile saved','success'); renderUrlQR(); renderVCardQR(); })
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

    if (!isSupabaseAvailable) { calculateTriage(); toast('Saved locally (offline mode)','info'); renderUrlQR(); renderVCardQR(); return; }

    supabase.auth.getSession()
      .then((r) => {
        const session = r?.data?.session;
        if (!session) { calculateTriage(); toast('Saved locally — please sign in to sync','info'); renderUrlQR(); renderVCardQR(); throw new Error('no session'); }
        return getUserId();
      })
      .then((uid) => {
        if (!uid) { calculateTriage(); toast('Saved locally — please sign in to sync','info'); renderUrlQR(); renderVCardQR(); throw new Error('no uid'); }

        const snake = { user_id: uid, blood_type: health.bloodType, allergies: health.allergies, conditions: health.conditions, medications: health.medications, implants: health.implants, organ_donor: health.organDonor, triage_override: health.triageOverride };
        const camel = { user_id: uid, bloodType:   health.bloodType, allergies: health.allergies, conditions: health.conditions, medications: health.medications, implants: health.implants, organDonor: health.organDonor, triageOverride: health.triageOverride };

        return supabase.from('health_data').upsert(snake, { onConflict: 'user_id' })
          .then(({ error }) => { if (!error) return; return supabase.from('health_data').upsert(camel, { onConflict: 'user_id' }).then(({ error:e2 }) => { if (e2) throw e2; }); });
      })
      .then(() => { calculateTriage(); toast('Health info saved','success'); renderUrlQR(); renderVCardQR(); })
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

            // adopt server short code if present
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
          return withTimeout(
            supabase.from('health_data').select('*').eq('user_id', uid).maybeSingle(),
            4000,
            'health_data.select'
          ).then((rh) => {
            const raw = rh?.data || null; if (!raw) return;

            const norm = {
              bloodType:      raw.bloodType      != null ? raw.bloodType      : raw.blood_type,
              allergies:      raw.allergies      != null ? raw.allergies      : (raw.alergy_list || raw.allergy_list),
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
          return withTimeout(
            supabase.from('ice_contacts').select('*').eq('user_id',uid).order('contact_order',{ascending:true}),
            4000,
            'ice_contacts.select'
          ).then(ri=>{
            const ice=ri?.data||[];
            if (Array.isArray(ice)){
              iceContacts = ice.map(r=>({name:r.name||'',relationship:r.relationship||'',phone:r.phone||''}));
              window.iceContacts = iceContacts;
              localStorage.setItem('myqer_ice', JSON.stringify(iceContacts));
              renderIceContacts();
            }
          });
        }).then(()=>{
          // after all loads, draw both QRs
          renderUrlQR();
          renderVCardQR();
        });
      });
    }).catch(e=>console.warn('Server load failed', e));
  }

  /* ---------- buttons ---------- */
  function wireQRButtons(){
    // URL QR actions (keep simple)
    on($('copyLink'),'click',()=>{ const url=$('cardUrl')?.value||''; if(!url) return toast('No link to copy','error'); navigator.clipboard.writeText(url).then(()=>toast('Link copied','success')).catch(()=>toast('Copy failed','error')); });
    on($('openLink'),'click',()=>{ const url=$('cardUrl')?.value||''; if(!url) return toast('No link to open','error'); window.open(url,'_blank','noopener'); });
    on($('dlPNG'),'click',()=>{ const c=$('qrCanvas'); if(!c) return toast('Generate QR first','error'); const a=document.createElement('a'); a.download='myqer-online-qr.png'; a.href=c.toDataURL('image/png'); a.click(); toast('PNG downloaded','success'); });

    // REMOVE old URL SVG/Print handlers if buttons are still present (guarded)
    const killEl = (id)=>{ const el=$(id); if (el) el.style.display='none'; };
    killEl('dlSVG'); killEl('printQR');

    // Offline vCard actions (new)
    on($('regenVcardBtn'),'click', ()=> { renderVCardQR(); toast('Offline QR regenerated','success'); });
    on($('dlVcardPNG'),'click',()=> {
      const c=$('vcardCanvas'); if(!c) return toast('Generate offline QR first','error');
      const a=document.createElement('a'); a.download='myqer-offline-qr.png'; a.href=c.toDataURL('image/png'); a.click(); toast('Offline PNG downloaded','success');
    });
    on($('printVcard'),'click',()=> {
      const c=$('vcardCanvas'); if(!c) return toast('Generate offline QR first','error');
      const dataUrl=c.toDataURL('image/png');
      const w=window.open('','_blank','noopener'); if(!w) return toast('Pop-up blocked','error');
      const tri = ($('triagePill')?.classList.contains('red') ? 'RED' :
                   $('triagePill')?.classList.contains('amber') ? 'AMBER' :
                   $('triagePill')?.classList.contains('black') ? 'BLACK' : 'GREEN');
      w.document.write(`<html><head><meta charset="utf-8"><title>MYQER Offline ICE QR</title>
        <style>body{font:14px/1.4 -apple-system,Segoe UI,Roboto,Arial;margin:24px;text-align:center}
        img{width:300px;height:300px;image-rendering:pixelated} .sub{color:#666}</style></head>
        <body><h1>MYQER™ Offline ICE QR</h1><img src="${dataUrl}" alt="Offline QR">
        <div class="sub">Triage: ${tri}</div><script>window.onload=()=>setTimeout(()=>print(),200)</script></body></html>`);
      w.document.close();
    });
  }

  /* ---------- delete / logout (clears local 6-char code too) ---------- */
  function deleteAccount(){
    const phrase = ($('deletePhrase')?.value || '').trim().toUpperCase();
    if (phrase !== 'DELETE MY ACCOUNT') return toast('Type the phrase exactly','error');
    if (!confirm('Are you sure? This permanently deletes your data.')) return;

    const wipeLocal = () => {
      try {
        localStorage.removeItem('myqer_shortcode');
        localStorage.removeItem('myqer_profile');
        localStorage.removeItem('myqer_health');
        localStorage.removeItem('myqer_ice');
        localStorage.clear();
        sessionStorage.clear();
      } catch (_) {}
    };

    (function(){
      if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
      return getUserId().then(uid=>{
        if (!uid) return;
        return supabase.from('ice_contacts').delete().eq('user_id',uid)
          .then(()=> supabase.from('health_data').delete().eq('user_id',uid))
          .then(()=> supabase.from('profiles').delete().eq('user_id',uid))
          .catch(e => { console.warn('server delete failed', e); });
      }).then(()=> supabase.auth.signOut().catch(()=>{}));
    })().finally(()=>{
      wipeLocal();
      location.href = 'index.html';
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
    el.addEventListener('change', run);
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
    on($('iceContactsList'),'click',(e)=>{ const btn=e.target.closest?.('[data-act]'); if(!btn) return; const idx=+btn.dataset.idx;
      if(btn.dataset.act==='del'){ iceContacts.splice(idx,1); persistIceLocally(); renderIceContacts(); saveICEToServer().catch(()=>{}); renderUrlQR(); renderVCardQR(); toast('Contact removed','success'); }
      else if(btn.dataset.act==='save'){ saveICE(); }
    });

    ['hfAllergies','hfConditions'].forEach(id=> on($(id),'input',calculateTriage));
    on($('triageOverride'),'change',()=>{ calculateTriage(); saveHealth(); });

    ['profileFullName','profileDob','profileCountry','profileHealthId'].forEach(id=> setupAutoSave(id, saveProfile));
    ['hfBloodType','hfAllergies','hfConditions','hfMeds','hfImplants','hfDonor'].forEach(id=> setupAutoSave(id, saveHealth));

    wireQRButtons();

    fillFromLocal();
    renderUrlQR();             // draw URL QR from whatever we have
    renderVCardQR();           // draw offline QR if ready
    loadFromServer().then(()=> { renderUrlQR(); renderVCardQR(); });

    const loading=$('loadingState'); if (loading) loading.style.display='none';
    setTimeout(()=>{ const l=$('loadingState'); if (l) l.style.display='none'; }, 4000);
  });

  // never-stuck loader guards
  window.addEventListener('error', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });
  window.addEventListener('unhandledrejection', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });

  // light heartbeat (helps some hosting keep the worker warm)
  setInterval(()=>{ try{ navigator.sendBeacon?.('/ping',''); }catch{} }, 120000);
})();
      
