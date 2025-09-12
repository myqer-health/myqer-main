// /public/scripts/app.js
// MYQER Dashboard: URL QR + Offline vCard QR + ICE + Health + My Care
// 240px tiles with 200px QR; autosave; local-first with Supabase sync.

(function () {
  /* --------------------------------- helpers -------------------------------- */
  const $  = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn, { passive: true });
  const withTimeout = (p, ms, label) =>
    Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error((label||'promise')+' timed out')), ms))]);

  function toast(msg, type='success', ms=2200){
    let area = $('toastArea');
    if (!area) {
      area = document.createElement('div');
      area.id='toastArea';
      area.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px';
      document.body.appendChild(area);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    el.style.cssText='background:#111827;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 10px 20px rgba(0,0,0,.15);font:600 13px/1.2 Inter,system-ui,sans-serif;opacity:.96';
    if (type==='error') el.style.background = '#dc2626';
    if (type==='info')  el.style.background = '#374151';
    if (type==='success') el.style.background = '#059669';
    area.appendChild(el);
    requestAnimationFrame(()=> el.style.opacity = '1');
    setTimeout(()=>{ el.style.opacity='.0'; setTimeout(()=>el.remove(), 250); }, ms);
  }

  // Merge only non-empty values from src into target
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

  /* ------------------------------- global state ------------------------------ */
  let supabase, isSupabaseAvailable = false;
  let isOnline = navigator.onLine;

  let userData = {
    profile:   { full_name:'', date_of_birth:'', country:'', national_id:'' },
    health:    { bloodType:'', allergies:'', conditions:'', medications:'', implants:'', organDonor:false, triageOverride:'auto' },
    care:      { lifeSupport:'', intubation:'', comaCare:'', burial:'', religion:'' }
  };
  let iceContacts = [];

  // Allowed chars (no O/0/I/1). We use a 6-character code.
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const autoSaveTimers = {}; // autosave debounce

  window.userData = userData;
  window.iceContacts = iceContacts;

  /* ------------------------------ Supabase init ------------------------------ */
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

  /* --------------------------------- network -------------------------------- */
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

  /* --------------------------------- triage --------------------------------- */
  const TRIAGE = ['green','amber','red','black'];
  function updateTriagePill(level='green'){
    const pill = $('triagePill'); if (!pill) return;
    TRIAGE.forEach(c=>pill.classList.remove(c)); pill.classList.add(level);
    const label = level.toUpperCase();
    pill.textContent = label === 'GREEN' ? 'Low Risk' : (label === 'AMBER' ? 'Medium Risk' : (label === 'RED' ? 'High Risk' : 'Black'));
    pill.dataset.level = level;
  }
  function calculateTriage(){
    const over = $('triageOverride')?.value || 'auto';
    if (over !== 'auto') return updateTriagePill(over);
    const allergies  = ($('hfAllergies')?.value || '').toLowerCase();
    const conditions = ($('hfConditions')?.value || '').toLowerCase();
    if (allergies.includes('anaphylaxis') || allergies.includes('severe')) return updateTriagePill('red');
    updateTriagePill((allergies || conditions) ? 'amber' : 'green');
  }
  const TRIAGE_COLOR = { RED:'#E11D48', AMBER:'#F59E0B', GREEN:'#16A34A', BLACK:'#111827' };
  function currentTriageHex() {
    const level = $('triagePill')?.dataset?.level || 'green';
    if (level === 'red') return TRIAGE_COLOR.RED;
    if (level === 'amber') return TRIAGE_COLOR.AMBER;
    if (level === 'black') return TRIAGE_COLOR.BLACK;
    return TRIAGE_COLOR.GREEN;
  }

  /* --------------------------- short code / URL ------------------------------ */
  function makeShort6(){
    return Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('');
  }
  async function ensureShortCode(){
    const valid = /^[A-HJ-NP-Z2-9]{6}$/;
    let local = localStorage.getItem('myqer_shortcode');

    // Offline / no Supabase: keep local (or mint)
    if (!(isSupabaseAvailable && isOnline)) {
      if (!valid.test(local||'')) { local = makeShort6(); localStorage.setItem('myqer_shortcode', local); }
      return local;
    }

    const uid = await getUserId().catch(()=>null);
    if (!uid) {
      if (!valid.test(local||'')) { local = makeShort6(); localStorage.setItem('myqer_shortcode', local); }
      return local;
    }

    // 1) fetch existing from server
    const { data: prof } = await supabase.from('profiles').select('code').eq('user_id', uid).maybeSingle();
    if (prof && valid.test(prof.code||'')) {
      localStorage.setItem('myqer_shortcode', prof.code);
      return prof.code;
    }

    // 2) mint and store (handle uniqueness)
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

  /* ------------------------------ QR lib loader ------------------------------ */
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

  /* ------------------------------ vCard helpers ------------------------------ */
  function vCardEscape(s='') {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }
  function formatBDAY(d='') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    return m ? `${m[1]}${m[2]}${m[3]}` : (d || '');
  }
  function isOfflineReady() {
    const p = (window.userData && window.userData.profile) || {};
    const h = (window.userData && window.userData.health)  || {};
    const hasICE =
      Array.isArray(window.iceContacts) &&
      window.iceContacts[0] &&
      window.iceContacts[0].phone &&
      window.iceContacts[0].name;
    const donorSet = (h.organDonor === true || h.organDonor === false);
    return Boolean(p.country && h.bloodType && donorSet && hasICE);
  }
  function buildVCardPayload(shortUrl) {
    const p   = (window.userData && window.userData.profile) || {};
    const h   = (window.userData && window.userData.health)  || {};
    const care= (window.userData && window.userData.care)    || {};
    const ice = Array.isArray(window.iceContacts) ? window.iceContacts[0] : null;

    const fullName = (p.full_name ?? p.fullName ?? '').trim();
    const parts = fullName.split(/\s+/);
    const first = parts[0] || '';
    const last  = parts.length > 1 ? parts[parts.length - 1] : '';

    const triageText = (() => {
      const pill = $('triagePill');
      if (!pill) return 'GREEN';
      const lvl = pill.dataset.level || 'green';
      return String(lvl).toUpperCase();
    })();

    const careBits = [];
    if (care.lifeSupport) careBits.push(`life support=${care.lifeSupport}`);
    if (care.intubation)  careBits.push(`intubation=${care.intubation}`);
    if (care.comaCare)    careBits.push(`coma=${care.comaCare}`);
    if (care.burial)      careBits.push(`burial=${care.burial}`);
    if (care.religion)    careBits.push(`religion=${care.religion}`);

    const noteParts = [
      `Country: ${p.country || '—'}`,
      `Blood: ${h.bloodType || '—'}`,
      `Donor: ${h.organDonor ? 'Y' : 'N'}`,
      `Triage: ${triageText}`,
      h.allergies   ? `Allergies: ${h.allergies}`     : '',
      h.conditions  ? `Conditions: ${h.conditions}`   : '',
      h.medications ? `Medications: ${h.medications}` : '',
      ice?.name     ? `ICE: ${ice.name}${ice.relationship?` (${ice.relationship})`:''} ${ice.phone||''}` : '',
      careBits.length ? `Care: ${careBits.join(' | ')}` : ''
    ].filter(Boolean);

    let note = noteParts.join('\n');
    if (note.length > 380) note = note.slice(0, 377) + '…';
    note = vCardEscape(note);

    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${vCardEscape(last)};${vCardEscape(first)};;;`,
      `FN:${vCardEscape(fullName || `${first} ${last}`.trim())}`,
      `BDAY:${formatBDAY(p.date_of_birth ?? p.dob ?? '')}`,
      `TEL;TYPE=CELL:${vCardEscape(ice?.phone || '')}`,
      `URL:${vCardEscape(shortUrl)}`,
      `NOTE:${note}`,
      'END:VCARD'
    ].join('\r\n');
  }

  /* ------------------------------- render QRs -------------------------------- */
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

  async function renderVCardQR() {
    const canvas = $('vcardCanvas');
    const help   = $('vcardHelp');
    const regen  = $('regenVcardBtn');
    const ph     = $('vcardPlaceholder');
    const ready  = isOfflineReady();

    if (!canvas && !help && !regen && !ph) return;

    if (help) {
      help.textContent = ready
        ? 'Offline QR is ready. Re-generate and re-print if Country, Blood, Donor, Triage or ICE change.'
        : 'Needs Country, Blood, Donor and one ICE contact before generating.';
    }
    if (regen) regen.disabled = !ready;

    if (!ready || !canvas) {
      if (ph) ph.hidden = false;
      if (canvas) canvas.style.display = 'none';
      return;
    }

    try {
      await loadQRCodeLib();
      const code = await ensureShortCode();
      const base = (location?.origin || 'https://myqer.com')
        .replace(/\/$/, '')
        .replace('://www.', '://');
      const shortUrl = `${base}/c/${code}`;
      const vcard = buildVCardPayload(shortUrl);
      const dark  = currentTriageHex();

      await new Promise((resolve, reject) =>
        window.QRCode.toCanvas(
          canvas,
          vcard,
          {
            width: 200,
            margin: 1,
            errorCorrectionLevel: 'Q',
            color: { dark, light: '#FFFFFF' }
          },
          err => err ? reject(err) : resolve()
        )
      );

      canvas.style.display = 'block';
      if (ph) ph.hidden = true;
      canvas.style.background = '#fff';
      canvas.style.borderRadius = '12px';
      canvas.style.padding = '8px';
      canvas.style.boxShadow = '0 8px 24px rgba(0,0,0,.08)';
      canvas.style.imageRendering = 'pixelated';
      canvas.style.display = 'block';
    } catch (e) {
      console.error('vCard QR error:', e);
      if (ph) ph.hidden = false;
      if (canvas) canvas.style.display = 'none';
    }
  }

  /* ---------------------------------- ICE ----------------------------------- */
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

  /* ----------------------------- profile & health ---------------------------- */
  function upsertProfileSmart(rowBase){
    return getUserId().then(async (uid)=>{
      if (!uid) return;
      const code = await ensureShortCode();

      // Detect schema by probing snake; fallback camel
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
        // IMPORTANT: camel schema uses userId and onConflict:userId
        const camel = { userId: uid, bloodType: health.bloodType, allergies: health.allergies, conditions: health.conditions, medications: health.medications, implants: health.implants, organDonor: health.organDonor, triageOverride: health.triageOverride };

        return supabase.from('health_data').upsert(snake, { onConflict: 'user_id' })
          .then(({ error }) => { if (!error) return; return supabase.from('health_data').upsert(camel, { onConflict: 'userId' }).then(({ error:e2 }) => { if (e2) throw e2; }); });
      })
      .then(() => { calculateTriage(); toast('Health info saved','success'); renderUrlQR(); renderVCardQR(); })
      .catch((e) => { if (e && (e.message==='no session' || e.message==='no uid')) return; console.error(e); toast('Error saving health','error'); });
  }

  /* ------------------------------- My Care save ------------------------------ */
  function saveCare() {
    const care = {
      lifeSupport: $('lifeSupport')?.value || '',
      intubation:  $('intubation')?.value  || '',
      comaCare:    $('comaCare')?.value    || '',
      burial:      $('burial')?.value      || '',
      religion:    $('religion')?.value    || ''
    };

    userData.care = care;
    localStorage.setItem('myqer_care', JSON.stringify(care));

    if (!isSupabaseAvailable) { toast('Saved locally (offline mode)','info'); return; }

    supabase.auth.getSession()
      .then(r => {
        const session = r?.data?.session;
        if (!session) { toast('Saved locally — please sign in to sync','info'); throw new Error('no session'); }
        return getUserId();
      })
      .then(uid => {
        if (!uid) { toast('Saved locally — please sign in to sync','info'); throw new Error('no uid'); }

        const snake = { user_id: uid, life_support: care.lifeSupport, intubation: care.intubation, coma_care: care.comaCare, burial: care.burial, religion: care.religion };
        const camel = { userId:  uid, lifeSupport: care.lifeSupport, intubation: care.intubation, comaCare: care.comaCare, burial: care.burial, religion: care.religion };

        return supabase.from('care_directives').upsert(snake, { onConflict:'user_id' })
          .then(({ error }) => {
            if (!error) return;
            return supabase.from('care_directives').upsert(camel, { onConflict:'userId' })
              .then(({ error:e2 }) => { if (e2) throw e2; });
          });
      })
      .then(()=> toast('Care preferences saved','success'))
      .catch(e => { if (e && (e.message==='no session' || e.message==='no uid')) return; console.warn(e); toast('Error saving care','error'); });
  }

  /* ---------------------------- local/server load ---------------------------- */
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
      const li=localStorage.getItem('myqer_ice');
      iceContacts = li ? (JSON.parse(li)||[]) : [];
      window.iceContacts=iceContacts;
      renderIceContacts();

      // care
      const lc = localStorage.getItem('myqer_care');
      if (lc) {
        try { userData.care = JSON.parse(lc) || {}; } catch(_) {}
      }
      const c = userData.care || {};
      set('lifeSupport', c.lifeSupport);
      set('intubation',  c.intubation);
      set('comaCare',    c.comaCare);
      set('burial',      c.burial);
      set('religion',    c.religion);

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
        }).then(async ()=>{
          // health (snake then camel)
          let rh = await withTimeout(
            supabase.from('health_data').select('*').eq('user_id', uid).maybeSingle(),
            4000,'health_data.select.snake');
          if (!rh?.data) {
            rh = await withTimeout(
              supabase.from('health_data').select('*').eq('userId', uid).maybeSingle(),
              4000,'health_data.select.camel');
          }
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
        }).then(async ()=>{
          // ice
          const ri = await withTimeout(
            supabase.from('ice_contacts').select('*').eq('user_id',uid).order('contact_order',{ascending:true}),
            4000,'ice_contacts.select'
          );
          const ice=ri?.data||[];
          if (Array.isArray(ice)){
            iceContacts = ice.map(r=>({name:r.name||'',relationship:r.relationship||'',phone:r.phone||''}));
            window.iceContacts = iceContacts;
            localStorage.setItem('myqer_ice', JSON.stringify(iceContacts));
            renderIceContacts();
          }
        }).then(async ()=>{
          // care (snake then camel)
          let rc = await withTimeout(
            supabase.from('care_directives').select('*').eq('user_id', uid).maybeSingle(),
            4000,'care_directives.select.snake');
          if (!rc?.data) {
            rc = await withTimeout(
              supabase.from('care_directives').select('*').eq('userId', uid).maybeSingle(),
              4000,'care_directives.select.camel');
          }
          const rawC = rc?.data || null; if (!rawC) return;

          const care = {
            lifeSupport: rawC.lifeSupport ?? rawC.life_support ?? '',
            intubation:  rawC.intubation  ?? '',
            comaCare:    rawC.comaCare    ?? rawC.coma_care ?? '',
            burial:      rawC.burial      ?? '',
            religion:    rawC.religion    ?? ''
          };

          userData.care = Object.assign({}, userData.care, care);
          localStorage.setItem('myqer_care', JSON.stringify(userData.care));

          const set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
          set('lifeSupport', userData.care.lifeSupport);
          set('intubation',  userData.care.intubation);
          set('comaCare',    userData.care.comaCare);
          set('burial',      userData.care.burial);
          set('religion',    userData.care.religion);
        }).then(()=>{
          // after all loads, draw both QRs
          renderUrlQR();
          renderVCardQR();
        });
      });
    }).catch(e=>console.warn('Server load failed', e));
  }

  /* ------------------------------ QR UI buttons ------------------------------ */
  function wireQRButtons(){
    on($('openLink'),'click',()=>{ const url=$('cardUrl')?.value||''; if(!url) return toast('No link to open','error'); window.open(url,'_blank','noopener'); });
    on($('regenVcardBtn'),'click', ()=> { renderVCardQR(); toast('Offline QR regenerated','success'); });
    on($('btnSavePrint'),'click', () => { composeAndPrintBoth(); });
  }

  /* ----------------------------- pretty print view --------------------------- */
  function composeAndPrintBoth(){
    const online = $('qrCanvas');
    const offline = $('vcardCanvas');
    if (!online || !offline) return toast('Generate both QRs first','error');

    const urlPng = online.toDataURL('image/png');
    const vcdPng = offline.toDataURL('image/png');

    const w = window.open('', '_blank', 'noopener');
    if (!w) return toast('Pop-up blocked','error');

    const tri = ($('triagePill')?.dataset.level || 'green').toUpperCase();

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>MYQER™ Emergency QR Codes</title>
    <meta name="color-scheme" content="light only"/>
    <style>
      :root{--primary:#dc2626;--green:#059669;--red:#dc2626;--ink:#0f172a;--muted:#6b7280;--border:#e5e7eb;}
      *{box-sizing:border-box}
      body{font:14px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f3f4f6;color:var(--ink)}
      .wrap{max-width:920px;margin:28px auto;padding:0 16px}
      .card{background:#fff;border:1px solid var(--border);border-radius:18px;box-shadow:0 14px 36px rgba(0,0,0,.08);overflow:hidden}
      .head{background:linear-gradient(180deg,#ef4444 0%,#b91c1c 100%);color:#fff;padding:18px 20px;text-align:center}
      .head h1{margin:0 0 4px;font:800 22px/1.2 Inter,system-ui,sans-serif;letter-spacing:.02em}
      .sub{opacity:.9}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:22px}
      .tile{border:2px solid var(--border);border-radius:16px;padding:18px;text-align:center}
      .tile.online{border-color:#059669;background:linear-gradient(145deg,#ffffff 0%,#f0fdf4 100%)}
      .tile.offline{border-color:#dc2626;background:linear-gradient(145deg,#ffffff 0%,#fef2f2 100%)}
      .label{font-weight:800;margin:6px 0 8px;font-size:18px}
      .hint{color:var(--muted);font-weight:600;letter-spacing:.02em;margin-bottom:12px}
      .btn{display:inline-block;border:2px solid currentColor;border-radius:14px;padding:10px 18px;font-weight:800;margin-top:12px}
      img{width:220px;height:220px;image-rendering:pixelated;border-radius:8px;background:#fff}
      .foot{border-top:1px solid var(--border);padding:12px 16px;color:#6b7280;text-align:center;font-size:12px}
      @media print {.tile{page-break-inside:avoid}}
    </style></head><body>
      <div class="wrap">
        <div class="card">
          <div class="head">
            <h1>MYQER™ Emergency Card</h1>
            <div class="sub">Scan either QR in an emergency • Triage: ${tri}</div>
          </div>
          <div class="grid">
            <div class="tile online">
              <div class="label">ONLINE QR</div>
              <div class="hint">Network available</div>
              <img alt="Online QR" src="${urlPng}">
            </div>
            <div class="tile offline">
              <div class="label">OFFLINE QR</div>
              <div class="hint">No network needed</div>
              <img alt="Offline QR" src="${vcdPng}">
            </div>
          </div>
          <div class="foot">This card provides critical information to first responders. Verify with official records.</div>
        </div>
      </div>
      <script>document.title='MYQER™ Emergency QR Codes';try{history.replaceState({},'', '/print/myqer-qr');}catch(e){};window.onload=()=>setTimeout(()=>print(),400)</script>
    </body></html>`);
    w.document.close();
  }

  /* ------------------------------ delete / logout ---------------------------- */
  function deleteAccount(){
    const phrase = ($('deletePhrase')?.value || '').trim().toUpperCase();
    if (phrase !== 'DELETE MY ACCOUNT') return toast('Type the phrase exactly','error');
    if (!confirm('Are you sure? This permanently deletes your data.')) return;

    const wipeLocal = () => {
      try {
        localStorage.removeItem('myqer_shortcode');
        localStorage.removeItem('myqer_profile');
        localStorage.removeItem('myqer_health');
        localStorage.removeItem('myqer_care');
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
          .then(()=> supabase.from('care_directives').delete().eq('user_id',uid))
          .then(()=> supabase.from('profiles').delete().eq('user_id',uid))
          .catch(e => { console.warn('server delete failed', e); });
      }).then(()=> supabase.auth.signOut().catch(()=>{}));
    })().finally(()=>{
      wipeLocal();
      location.href = 'index.html';
    });
  }

  /* -------------------------------- autosave -------------------------------- */
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

  /* ---------------------------------- DOMReady ------------------------------- */
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

    // Profile & Health autosave
    ['profileFullName','profileDob','profileCountry','profileHealthId'].forEach(id=> setupAutoSave(id, saveProfile));
    ['hfBloodType','hfAllergies','hfConditions','hfMeds','hfImplants','hfDonor'].forEach(id=> setupAutoSave(id, saveHealth));

    // My Care autosave (IDs: lifeSupport, intubation, comaCare, burial, religion)
    ['lifeSupport','intubation','comaCare','burial','religion'].forEach(id => setupAutoSave(id, saveCare));

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
