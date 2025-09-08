// /public/scripts/app.js
// One-file dashboard logic (Supabase UMD + QRCode UMD are loaded by <script> tags in HTML)

(() => {
/* ---------- small helpers ---------- */
const $  = (id) => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, ms, label='promise') =>
  Promise.race([ p, new Promise((_,rej)=>setTimeout(()=>rej(new Error(`${label} timed out`)), ms)) ]);

let supabase, isSupabaseAvailable = false;
let isOnline = navigator.onLine;
let userData = { profile: {}, health: {} };
let iceContacts = [];
const autoSaveTimers = {};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1

/* ---------- supabase init ---------- */
try {
  const URL = 'https://dmntmhkncldgynufajei.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtbnRtaGtuY2xkZ3ludWZhamVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MzQ2MzUsImV4cCI6MjA3MjQxMDYzNX0.6DzOSb0xu5bp4g2wKy3SNtEEuSQavs_ohscyawvPmrY';
  if (window.supabase && URL && KEY) {
    supabase = window.supabase.createClient(URL, KEY);
    isSupabaseAvailable = true;
    console.log('✅ Supabase ready');
  }
} catch (e) { console.warn('⚠️ Supabase init failed:', e); }

const getUserId = async () => {
  if (!isSupabaseAvailable) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user?.id || null;
};

/* ---------- toasts ---------- */
const toast = (msg, type='success', ms=2200) => {
  let area = $('toastArea');
  if (!area) {
    area = document.createElement('div');
    area.id = 'toastArea';
    area.setAttribute('aria-live','polite');
    document.body.appendChild(area);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  area.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, ms);
};

/* ---------- net status ---------- */
const updateNetworkStatus = () => {
  const badge = $('netStatus'), banner = $('offlineBanner');
  if (navigator.onLine) {
    badge && (badge.textContent = 'ONLINE', badge.className='online');
    banner && (banner.style.display='none');
    if (!isOnline) toast('Back online — syncing…','success');
    isOnline = true;
  } else {
    badge && (badge.textContent = 'OFFLINE', badge.className='offline');
    banner && (banner.style.display='block');
    if (isOnline) toast('Working offline — changes saved locally','info');
    isOnline = false;
  }
};

/* ---------- autosave ---------- */
const setupAutoSave = (id, fn, delay=600) => {
  const el = $(id);
  if (!el) return;
  on(el, 'input', () => {
    clearTimeout(autoSaveTimers[id]);
    autoSaveTimers[id] = setTimeout(async () => {
      try { await fn(); } catch(e){ console.warn('autosave err', e); }
    }, delay);
  });
};

/* ---------- triage ---------- */
const TRIAGE = ['green','amber','red','black'];
const updateTriagePill = (level='green') => {
  const pill = $('triagePill'); if (!pill) return;
  TRIAGE.forEach(c => pill.classList.remove(c));
  pill.classList.add(level);
  pill.textContent = level.toUpperCase();
};
const calculateTriage = () => {
  const override = $('triageOverride')?.value || 'auto';
  if (override !== 'auto') return updateTriagePill(override);
  const allergies  = ($('hfAllergies')?.value || '').trim().toLowerCase();
  const conditions = ($('hfConditions')?.value || '').trim().toLowerCase();
  if (allergies.includes('anaphylaxis') || allergies.includes('severe')) return updateTriagePill('red');
  updateTriagePill(allergies || conditions ? 'amber' : 'green');
};

/* ---------- QR + short code ---------- */
const makeShort_3_4_3 = () => {
  const pick = n => Array.from({length:n},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('');
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
};
const generateShortCode = () => {
  const valid = /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{3}$/;
  let code = localStorage.getItem('myqer_shortcode');
  if (!valid.test(code || '')) { code = makeShort_3_4_3(); localStorage.setItem('myqer_shortcode', code); }
  return code;
};
const ensureShortCode = async () => {
  let code = localStorage.getItem('myqer_shortcode') || generateShortCode();
  if (!(isSupabaseAvailable && isOnline)) return code;
  try {
    const uid = await getUserId(); if (!uid) return code;
    // handle rare duplicate collisions
    for (let i=0;i<4;i++){
      const { error } = await supabase.from('profiles').upsert({ user_id: uid, code }, { onConflict: 'user_id' });
      if (!error) break;
      const msg = `${error.message||''} ${error.details||''}`.toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique')) { code = makeShort_3_4_3(); localStorage.setItem('myqer_shortcode', code); continue; }
      console.warn('shortcode upsert err:', error); break;
    }
  } catch(e){ console.warn('ensureShortCode failed', e); }
  return code;
};
const ensureQRCodeLib = async () => {
  if (window.QRCode && typeof window.QRCode.toCanvas === 'function') return;
  await new Promise((res, rej) => {
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
    s.onload=res; s.onerror=()=>rej(new Error('QRCode lib failed to load'));
    document.head.appendChild(s);
  });
};
const buildOfflineText = (shortUrl) => {
  const pf = userData?.profile || {}, hd = userData?.health || {};
  const name = pf.full_name ?? pf.fullName ?? '';
  const dob  = pf.date_of_birth ?? pf.dob ?? '';
  const nat  = pf.national_id ?? pf.healthId ?? '';
  const country = pf.country ?? '';
  const donor = hd.organDonor ? 'Y' : 'N';
  const L = [];
  const L1 = [name && `Name: ${name}`, dob && `DOB: ${dob}`, country && `C: ${country}`, nat && `ID: ${nat}`].filter(Boolean).join(' | ');
  if (L1) L.push(L1);
  const L2 = [hd.bloodType && `BT: ${hd.bloodType}`, hd.allergies && `ALG: ${hd.allergies}`].filter(Boolean).join(' | ');
  if (L2) L.push(L2);
  const L3 = [hd.conditions && `COND: ${hd.conditions}`, hd.medications && `MED: ${hd.medications}`, hd.implants && `IMP: ${hd.implants}`, `DONOR:${donor}`].filter(Boolean).join(' | ');
  if (L3) L.push(L3);
  L.push(`URL:${shortUrl}`);
  return L.join('\n').slice(0,1200);
};
const generateQRCode = async () => {
  const qrCanvas = $('qrCanvas'), qrPlaceholder = $('qrPlaceholder'), codeEl = $('codeUnderQR'), urlEl = $('cardUrl'), status = $('qrStatus');
  if (!qrCanvas) return; // no slot on page

  const hasProfile = !!(userData?.profile?.full_name ?? userData?.profile?.fullName);
  const hasHealth  = !!(userData?.health?.bloodType || userData?.health?.allergies);
  const hasICE     = Array.isArray(iceContacts) && iceContacts.length > 0;

  if (!(hasProfile || hasHealth || hasICE)) {
    qrPlaceholder && (qrPlaceholder.style.display='flex');
    qrCanvas && (qrCanvas.style.display='none');
    codeEl && (codeEl.textContent='');
    urlEl && (urlEl.value='');
    status && (status.hidden=true);
    return;
  }

  const code = await ensureShortCode();
  const shortUrl = `https://www.myqer.com/c/${code}`;
  codeEl && (codeEl.textContent = code);
  urlEl  && (urlEl.value = shortUrl);

  try {
    await ensureQRCodeLib();
    const ctx = qrCanvas.getContext('2d'); ctx && ctx.clearRect(0,0,qrCanvas.width,qrCanvas.height);
    await new Promise((res,rej)=> window.QRCode.toCanvas(qrCanvas, shortUrl, { width: 200, errorCorrectionLevel:'H', margin:1 }, e=> e?rej(e):res()));
    qrCanvas.style.display = 'block';
    qrPlaceholder && (qrPlaceholder.style.display='none');
    status && (status.textContent='QR Code generated successfully', status.style.background='rgba(5,150,105,.1)', status.style.color='var(--green)', status.hidden=false);
    const off = $('offlineText'); off && (off.value = buildOfflineText(shortUrl));
  } catch (e) {
    console.error('QR render failed:', e);
    status && (status.textContent='QR generation failed', status.style.background='rgba(239,68,68,.1)', status.style.color='var(--red)', status.hidden=false);
  }
};

/* ---------- ICE (local-first + server-sync) ---------- */
const renderIceContacts = () => {
  const box = $('iceContactsList'); if (!box) return;
  box.innerHTML = '';
  (iceContacts || []).forEach((contact, idx) => {
    const row = document.createElement('div');
    row.className = 'ice-row'; row.dataset.index = idx;
    row.innerHTML = `
      <div class="ice-contact-header">
        <div class="contact-number">${idx+1}</div>
        <div class="ice-actions">
          <button class="iceSaveBtn" data-act="save" data-idx="${idx}">Save</button>
          <button class="iceDeleteBtn" data-act="del" data-idx="${idx}" aria-label="Delete contact">✖</button>
        </div>
      </div>
      <div class="ice-form-grid">
        <div class="form-group">
          <label>Name</label>
          <input type="text" class="iceName" data-field="name" data-idx="${idx}" value="${contact.name||''}" placeholder="Name">
        </div>
        <div class="form-group">
          <label>Relationship</label>
          <input type="text" class="iceRelation" data-field="relationship" data-idx="${idx}" value="${contact.relationship||''}" placeholder="Spouse, Parent">
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="tel" class="icePhone" data-field="phone" data-idx="${idx}" value="${contact.phone||''}" placeholder="+1 555 123 4567">
        </div>
      </div>`;
    box.appendChild(row);
  });
  const addBtn = $('addIce');
  if (addBtn) {
    if ((iceContacts||[]).length >= 3) { addBtn.disabled = true; addBtn.textContent = 'Maximum 3 contacts reached'; }
    else { addBtn.disabled = false; addBtn.textContent = 'Add Emergency Contact'; }
  }
};
const persistIceLocally = () => localStorage.setItem('myqer_ice', JSON.stringify(iceContacts || []));
const addIceContact = () => {
  iceContacts = Array.isArray(iceContacts) ? iceContacts : [];
  if (iceContacts.length >= 3) return toast('Maximum 3 emergency contacts allowed','error');
  iceContacts.push({ name:'', relationship:'', phone:'' });
  persistIceLocally(); renderIceContacts();
};
const updateIceContact = (idx, field, value) => {
  if (!iceContacts[idx]) return;
  iceContacts[idx][field] = value;
  persistIceLocally();
};
const saveICEToServer = async () => {
  if (!(isSupabaseAvailable && isOnline)) return;
  const uid = await getUserId(); if (!uid) return;
  await supabase.from('ice_contacts').delete().eq('user_id', uid);
  const rows = (iceContacts || []).filter(c => c.name || c.phone).map((c,i)=>({
    user_id: uid, contact_order: i, name: c.name || '', relationship: c.relationship || '', phone: c.phone || ''
  }));
  if (!rows.length) return;
  await supabase.from('ice_contacts').insert(rows);
};
const saveICE = async () => {
  const entries = (iceContacts||[]).map(c => ({ name:(c.name||'').trim(), relationship:(c.relationship||'').trim(), phone:(c.phone||'').trim() }))
                                  .filter(c => c.name || c.phone);
  if (entries.length > 3) return toast('Maximum 3 emergency contacts allowed','error');
  const invalid = entries.find(c => !(c.name && c.phone));
  if (invalid) return toast('Each contact needs a name and phone','error');
  iceContacts = entries;
  persistIceLocally();
  try { await saveICEToServer(); toast('Emergency contacts saved','success'); }
  catch (e) { console.error(e); toast('Error saving emergency contacts','error'); }
  renderIceContacts(); generateQRCode();
};

/* ---------- profile & health ---------- */
// Try snake_case first; if API complains about column names, retry camelCase.
const upsertProfileSmart = async (rowBase) => {
  const uid = await getUserId(); if (!uid) return;
  const code = await ensureShortCode();
  const snake = { user_id: uid, code,
    full_name: rowBase.full_name, date_of_birth: rowBase.date_of_birth,
    country: rowBase.country, national_id: rowBase.national_id
  };
  const camel = { user_id: uid, code,
    fullName: rowBase.full_name, dob: rowBase.date_of_birth,
    country: rowBase.country, healthId: rowBase.national_id
  };
  let res = await supabase.from('profiles').upsert(snake, { onConflict: 'user_id' });
  if (res.error) {
    // retry camelCase
    res = await supabase.from('profiles').upsert(camel, { onConflict: 'user_id' });
    if (res.error) throw res.error;
  }
};

const saveProfile = async () => {
  const profile = {
    full_name:     $('profileFullName')?.value?.trim() || '',
    date_of_birth: $('profileDob')?.value?.trim() || '',
    country:       $('profileCountry')?.value?.trim() || '',
    national_id:   $('profileHealthId')?.value?.trim() || ''
  };
  userData.profile = profile;
  localStorage.setItem('myqer_profile', JSON.stringify(profile));
  try {
    if (isSupabaseAvailable && isOnline) await upsertProfileSmart(profile);
    toast('Profile saved','success');
    await generateQRCode();
  } catch (e) { console.error(e); toast('Error saving profile','error'); }
};

const saveHealth = async () => {
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

  try {
    if (isSupabaseAvailable && isOnline) {
      const uid = await getUserId(); if (!uid) return;
      const { error } = await supabase.from('health_data').upsert({ user_id: uid, ...health }, { onConflict: 'user_id' });
      if (error) throw error;
    }
    calculateTriage();
    toast('Health info saved','success');
    await generateQRCode();
  } catch (e) { console.error(e); toast('Error saving health','error'); }
};

/* ---------- load (local-first, then server) ---------- */
const fillFromLocal = () => {
  try {
    // profile
    const lp = localStorage.getItem('myqer_profile');
    if (lp) userData.profile = JSON.parse(lp) || {};
    const p = userData.profile, set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
    set('profileFullName', p.full_name ?? p.fullName);
    set('profileDob',     p.date_of_birth ?? p.dob);
    set('profileCountry', p.country);
    set('profileHealthId',p.national_id ?? p.healthId);

    // health
    const lh = localStorage.getItem('myqer_health');
    if (lh) userData.health = JSON.parse(lh) || {};
    const h = userData.health;
    set('hfBloodType', h.bloodType); set('hfAllergies', h.allergies); set('hfConditions', h.conditions);
    set('hfMeds', h.medications); set('hfImplants', h.implants);
    $('hfDonor') && ($('hfDonor').checked = !!h.organDonor);
    $('triageOverride') && ($('triageOverride').value = h.triageOverride || 'auto');
    calculateTriage();

    // ICE
    const li = localStorage.getItem('myqer_ice');
    iceContacts = li ? (JSON.parse(li) || []) : [];
    renderIceContacts();
  } catch(e){ console.warn('Local fill failed', e); }
};

const loadFromServer = async () => {
  if (!(isSupabaseAvailable && isOnline)) return;
  try {
    const { data: { session } } = await withTimeout(supabase.auth.getSession(), 3000, 'getSession');
    if (!session) return;
    const uid = await withTimeout(getUserId(), 3000, 'getUserId'); if (!uid) return;

    // profiles (read both naming styles if present)
    const { data: prof } = await withTimeout(
      supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
      4000, 'profiles.select'
    ).catch(()=>({ data:null }));
    if (prof) {
      userData.profile = { ...userData.profile, ...prof };
      localStorage.setItem('myqer_profile', JSON.stringify(userData.profile));
      const p = userData.profile, set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
      set('profileFullName', p.full_name ?? p.fullName);
      set('profileDob',     p.date_of_birth ?? p.dob);
      set('profileCountry', p.country);
      set('profileHealthId',p.national_id ?? p.healthId);
    }

    // health
    const { data: health } = await withTimeout(
      supabase.from('health_data').select('*').eq('user_id', uid).maybeSingle(),
      4000, 'health_data.select'
    ).catch(()=>({ data:null }));
    if (health) {
      userData.health = { ...userData.health, ...health };
      localStorage.setItem('myqer_health', JSON.stringify(userData.health));
      const h = userData.health, set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
      set('hfBloodType', h.bloodType); set('hfAllergies', h.allergies); set('hfConditions', h.conditions);
      set('hfMeds', h.medications); set('hfImplants', h.implants);
      $('hfDonor') && ($('hfDonor').checked = !!h.organDonor);
      $('triageOverride') && ($('triageOverride').value = h.triageOverride || 'auto');
      calculateTriage();
    }

    // ice
    const { data: ice } = await withTimeout(
      supabase.from('ice_contacts').select('*').eq('user_id', uid).order('contact_order', { ascending: true }),
      4000, 'ice_contacts.select'
    ).catch(()=>({ data:[] }));
    if (Array.isArray(ice)) {
      iceContacts = ice.map(r => ({ name:r.name||'', relationship:r.relationship||'', phone:r.phone||'' }));
      localStorage.setItem('myqer_ice', JSON.stringify(iceContacts));
      renderIceContacts();
    }
  } catch(e){ console.warn('Server load failed', e); }
};

/* ---------- wire UI ---------- */
const wireQRButtons = () => {
  on($('copyLink'), 'click', async () => {
    const url = $('cardUrl')?.value?.trim();
    if (!url) return toast('No link to copy','error');
    try { await navigator.clipboard.writeText(url); toast('Link copied','success'); }
    catch { toast('Copy failed','error'); }
  });
  on($('openLink'), 'click', () => {
    const url = $('cardUrl')?.value?.trim();
    if (!url) return toast('No link to open','error');
    window.open(url, '_blank', 'noopener');
  });
  on($('dlPNG'), 'click', () => {
    const canvas = $('qrCanvas'); if (!canvas || canvas.style.display==='none') return toast('Generate QR first','error');
    const a = document.createElement('a'); a.download='myqer-emergency-qr.png'; a.href = canvas.toDataURL('image/png'); a.click();
    toast('PNG downloaded','success');
  });
  on($('dlSVG'), 'click', async () => {
    const url = $('cardUrl')?.value?.trim(); if (!url) return toast('Generate QR first','error');
    try {
      await ensureQRCodeLib();
      const svg = await new Promise((res,rej)=> window.QRCode.toString(url, {type:'svg', errorCorrectionLevel:'H', margin:1}, (e,s)=> e?rej(e):res(s)));
      const blob = new Blob([svg], {type:'image/svg+xml'}), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'myqer-emergency-qr.svg'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      toast('SVG downloaded','success');
    } catch(e){ console.error(e); toast('SVG download failed','error'); }
  });
  on($('printQR'), 'click', () => {
    const canvas = $('qrCanvas'); const code = $('codeUnderQR')?.textContent?.trim();
    if (!canvas || canvas.style.display==='none' || !code) return toast('Generate QR first','error');
    const dataUrl = canvas.toDataURL('image/png'); const w = window.open('', '_blank', 'noopener'); if (!w) return toast('Pop-up blocked','error');
    w.document.write(`
      <html><head><title>MYQER Emergency Card - ${code}</title>
      <meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;text-align:center;padding:2rem}
        .code{font-weight:700;letter-spacing:.06em}
        img{width:300px;height:300px;image-rendering:pixelated}
        @media print{@page{size:auto;margin:12mm}}
      </style></head>
      <body>
        <h1>MYQER™ Emergency Card</h1>
        <p class="code">Code: ${code}</p>
        <img alt="QR Code" src="${dataUrl}">
        <p>Scan this QR code for emergency information</p>
        <p style="font-size:.8em;color:#666">www.myqer.com</p>
        <script>window.onload=()=>setTimeout(()=>window.print(),200);<\/script>
      </body></html>`);
    w.document.close();
  });
  on($('copyOffline'), 'click', async () => {
    const txt = $('offlineText')?.value || '';
    if (!txt.trim()) return toast('No offline text to copy','error');
    try { await navigator.clipboard.writeText(txt); toast('Offline text copied','success'); }
    catch { toast('Copy failed','error'); }
  });
  on($('dlOffline'), 'click', () => {
    const txt = $('offlineText')?.value || '';
    if (!txt.trim()) return toast('No offline text to download','error');
    const blob = new Blob([txt], {type:'text/plain'}), a=document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download='myqer-offline.txt'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast('Offline text downloaded','success');
  });
};

/* ---------- delete / logout ---------- */
const deleteAccount = async () => {
  const phrase = ($('deletePhrase')?.value || '').trim().toUpperCase();
  if (phrase !== 'DELETE MY ACCOUNT') return toast('Type the phrase exactly','error');
  if (!confirm('Are you sure? This permanently deletes your data.')) return;
  try {
    if (isSupabaseAvailable && isOnline) {
      const uid = await getUserId(); if (uid) {
        await supabase.from('ice_contacts').delete().eq('user_id', uid);
        await supabase.from('health_data').delete().eq('user_id', uid);
        await supabase.from('profiles').delete().eq('user_id', uid);
      }
    }
    localStorage.clear(); sessionStorage.clear();
    location.href='index.html';
  } catch(e) { console.error(e); toast('Delete failed','error'); }
};

/* ---------- DOM ready ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  updateNetworkStatus();
  window.addEventListener('online',  updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

  // binds
  on($('saveProfile'), 'click', saveProfile);
  on($('saveHealth'),  'click', saveHealth);
  on($('saveIce'),     'click', saveICE);
  on($('addIce'),      'click', addIceContact);
  on($('deleteBtn'),   'click', deleteAccount);
  on($('btnSignOut'),  'click', async () => {
    try { if (isSupabaseAvailable) await supabase.auth.signOut(); } catch(e){ console.warn(e); }
    localStorage.clear(); sessionStorage.clear();
    location.href='index.html';
  });

  // ICE delegated events
  on($('iceContactsList'), 'input', (e) => {
    const t = e.target, idx = +t.dataset.idx, field = t.dataset.field;
    if (Number.isInteger(idx) && field) updateIceContact(idx, field, t.value);
  });
  on($('iceContactsList'), 'click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const idx = +btn.dataset.idx;
    if (btn.dataset.act === 'del') {
      iceContacts.splice(idx,1); persistIceLocally(); renderIceContacts(); try { await saveICEToServer(); } catch {}
      generateQRCode(); toast('Contact removed','success');
    } else if (btn.dataset.act === 'save') {
      await saveICE();
    }
  });

  // triage live + override
  ['hfAllergies','hfConditions'].forEach(id => on($(id), 'input', calculateTriage));
  on($('triageOverride'), 'change', () => { calculateTriage(); saveHealth(); });

  // autosaves
  ['profileFullName','profileDob','profileCountry','profileHealthId']
    .forEach(id => setupAutoSave(id, saveProfile));
  ['hfBloodType','hfAllergies','hfConditions','hfMeds','hfImplants','hfDonor']
    .forEach(id => setupAutoSave(id, saveHealth));

  // QR buttons
  wireQRButtons();

  // load sequence
  fillFromLocal();
  await generateQRCode();        // draw from local data if possible
  await loadFromServer();        // merge from server
  await generateQRCode();        // redraw if anything changed

  // hide spinner (fallback guard exists below too)
  const loading = $('loadingState'); if (loading) loading.style.display='none';
});

/* ---------- never-stuck loader guards ---------- */
window.addEventListener('error', () => { const el=$('loadingState'); el && (el.style.display='none'); });
window.addEventListener('unhandledrejection', () => { const el=$('loadingState'); el && (el.style.display='none'); });

})();
