// /public/scripts/app.js
// Dashboard logic with stable URL QR + offline vCard QR.
// Buttons open a styled Emergency Card page (with both QRs) and optionally auto-print.
(function () {
/* ---------- tiny helpers ---------- */
const $  = (id) => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn, { passive: true });
const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error((label||'promise')+' timed out')), ms))]);

function mergeNonEmpty(target, src){
  const out = { ...(target || {}) };
  for (const k in src){
    const v = src[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = v;
  }
  return out;
}
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
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const autoSaveTimers = {};
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
  TRIAGE.forEach(c=>pill.classList.remove(c));
  pill.classList.add(level);
  pill.textContent = level.toUpperCase();
}
function calculateTriage(){
  const over = $('triageOverride')?.value || 'auto';
  if (over !== 'auto') return updateTriagePill(over);
  const allergies  = ($('hfAllergies')?.value || '').toLowerCase();
  actuallyCalculateTriage(allergies, ($('hfConditions')?.value || '').toLowerCase());
}
function actuallyCalculateTriage(allergies, conditions){
  if (allergies.includes('anaphylaxis') || allergies.includes('severe')) return updateTriagePill('red');
  updateTriagePill((allergies || conditions) ? 'amber' : 'green');
}

/* ---------- SHORT CODE / URL ---------- */
function makeShort6(){
  return Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('');
}
async function ensureShortCode(){
  const valid = /^[A-HJ-NP-Z2-9]{6}$/;
  let local = localStorage.getItem('myqer_shortcode');

  if (!(isSupabaseAvailable && isOnline)) {
    if (!valid.test(local||'')) { local = makeShort6(); localStorage.setItem('myqer_shortcode', local); }
    return local;
  }

  const uid = await getUserId().catch(()=>null);
  if (!uid) {
    if (!valid.test(local||'')) { local = makeShort6(); localStorage.setItem('myqer_shortcode', local); }
    return local;
  }

  const { data: prof } = await supabase.from('profiles').select('code').eq('user_id', uid).maybeSingle();
  if (prof && valid.test(prof.code||'')) {
    localStorage.setItem('myqer_shortcode', prof.code);
    return prof.code;
  }

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

/* ---------- helper: sync short URL (gesture-safe) ---------- */
function getShortUrlSync() {
  const input = $('cardUrl');
  let url = input?.value || '';
  if (!url) {
    const code = localStorage.getItem('myqer_shortcode') || '';
    let base = (location?.origin || 'https://myqer.com').replace(/\/$/,'').replace('://www.','://');
    if (!code) return '';
    if (String(base).startsWith('file://')) base = 'https://myqer.com';
    url = `${base}/c/${code}`;
  }
  return url;
}

/* ============= QR CODE loader & drawing (newer set) ============= */
let qrLibReady = null;
function loadQRCodeLib(){
  if (window.QRCode) return Promise.resolve();
  if (qrLibReady) return qrLibReady;
  const srcs = [
    'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
    'https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js'
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
async function drawQR(canvas, text, { cssSize=200, ecl='M', colorDark='#000000', colorLight='#FFFFFF', margin=4 } = {}){
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const px  = cssSize * dpr;

  canvas.width = px;
  canvas.height= px;
  canvas.style.width  = cssSize + 'px';
  canvas.style.height = cssSize + 'px';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';

  await new Promise((resolve, reject)=>
    window.QRCode.toCanvas(
      canvas,
      text,
      {
        width: px,
        margin: margin,
        errorCorrectionLevel: ecl,
        color: { dark: colorDark, light: colorLight }
      },
      (err)=> err ? reject(err) : resolve()
    )
  );
}

/* ---------- OFFLINE VCARD HELPERS ---------- */
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
function currentTriageHex() {
  const TRIAGE_COLOR = { RED:'#E11D48', AMBER:'#F59E0B', GREEN:'#16A34A', BLACK:'#111827' };
  const pill = $('triagePill');
  if (!pill) return TRIAGE_COLOR.GREEN;
  if (pill.classList.contains('red'))   return TRIAGE_COLOR.RED;
  if (pill.classList.contains('amber')) return TRIAGE_COLOR.AMBER;
  if (pill.classList.contains('black')) return TRIAGE_COLOR.BLACK;
  return TRIAGE_COLOR.GREEN;
}
function buildVCardPayload(shortUrl) {
  const p   = (window.userData && window.userData.profile) || {};
  const h   = (window.userData && window.userData.health)  || {};
  const ice = Array.isArray(window.iceContacts) ? window.iceContacts[0] : null;

  const fullName = (p.full_name ?? p.fullName ?? '').trim();
  const parts = fullName.split(/\s+/);
  const first = parts[0] || '';
  const last  = parts.length > 1 ? parts[parts.length - 1] : '';

  const triageText = (() => {
    const pill = $('triagePill');
    if (!pill) return 'GREEN';
    if (pill.classList.contains('red'))   return 'RED';
    if (pill.classList.contains('amber')) return 'AMBER';
    if (pill.classList.contains('black')) return 'BLACK';
    return 'GREEN';
  })();

  const noteParts = [
    `Country: ${p.country || '—'}`,
    `Blood type: ${h.bloodType || '—'}`,
    `Donor: ${h.organDonor ? 'Y' : 'N'}`,
    `Triage: ${triageText}`,
    h.allergies   ? `Allergies: ${h.allergies}`     : '',
    h.conditions  ? `Conditions: ${h.conditions}`   : '',
    h.medications ? `Medication: ${h.medications}`  : '',
    ice?.phone    ? `ICE: ${ice.phone}`             : ''
  ].filter(Boolean);

  let note = noteParts.join('\n');
  if (note.length > 400) note = note.slice(0, 397) + '…';
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

/* ---------- URL QR (online, black 200px) ---------- */
async function renderUrlQR(){
  const qrCanvas    = $('qrCanvas');
  const codeUnderQR = $('codeUnderQR');
  const cardUrlInput= $('cardUrl');
  const qrStatus    = $('qrStatus');
  if (!qrCanvas) return;

  try {
    await loadQRCodeLib();
    const valid = /^[A-HJ-NP-Z2-9]{6}$/;
    let code = localStorage.getItem('myqer_shortcode');
    if (!valid.test(code||'')) {
      if (typeof ensureShortCode === 'function') code = await ensureShortCode();
    }
    if (!code) throw new Error('no short url');
    let base = (location?.origin || 'https://myqer.com').replace(/\/$/,'').replace('://www.','://');
    if (String(base).startsWith('file://')) base = 'https://myqer.com';
    const shortUrl = `${base}/c/${code}`;

    if (codeUnderQR) codeUnderQR.textContent = code;
    if (cardUrlInput) cardUrlInput.value = shortUrl;

    await drawQR(qrCanvas, shortUrl, { cssSize: 200, ecl: 'M', margin: 4, colorDark:'#000000' });

    if (qrStatus) { qrStatus.textContent = 'QR Code generated successfully'; qrStatus.hidden = false; }
  } catch (err) {
    console.error('URL QR error:', err);
    if (qrStatus) { qrStatus.textContent='⚠️ Couldn’t draw QR. Please try again.'; qrStatus.hidden=false; }
  }
}

/* ---------- vCard QR (offline, orange 160px) ---------- */
async function renderVCardQR() {
  const canvas = $('vcardCanvas');
  const help   = $('vcardHelp');
  const regen  = $('regenVcardBtn');
  const ready  = isOfflineReady();

  if (!canvas && !help && !regen) return;

  if (help) {
    help.textContent = ready
      ? 'Offline QR is ready. Re-generate and re-print if Country, Blood, Donor, Triage or ICE change.'
      : 'Needs Country, Blood, Donor and one ICE contact before generating.';
  }
  if (regen) regen.disabled = !ready;

  if (!ready || !canvas) {
    if (canvas) canvas.style.display = 'none';
    return;
  }

  try {
    await loadQRCodeLib();

    const shortUrl = getShortUrlSync() || (()=>{
      const code = localStorage.getItem('myqer_shortcode') || '';
      let base = (location?.origin || 'https://myqer.com').replace(/\/$/,'').replace('://www.','://');
      if (String(base).startsWith('file://')) base = 'https://myqer.com';
      return code ? `${base}/c/${code}` : '';
    })();

    const vcard = buildVCardPayload(shortUrl);
    const dark  = '#DC5A0E'; // strong orange

    await drawQR(canvas, vcard, { cssSize: 160, ecl:'Q', margin: 3, colorDark: dark, colorLight:'#FFFFFF' });

    canvas.style.display = 'block';
  } catch (e) {
    console.error('vCard QR error:', e);
    if (canvas) canvas.style.display = 'none';
  }
}

/* ---------- Styled Emergency Card (HTML) for print/popout — newer one ---------- */
function buildEmergencyCardHTML_sync(onlineDataURL, offlineDataURL) {
  return (
'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'+
'<meta name="viewport" content="width=device-width, initial-scale=1">'+
'<title>MYQER™ Emergency Card</title>'+
'<style>'+
' *{box-sizing:border-box;margin:0;padding:0}'+
' body{font-family:-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;background:#f8fafc;padding:40px 20px;min-height:100vh;display:flex;align-items:center;justify-content:center}'+
' .emergency-card{width:720px;height:440px;border-radius:20px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,.1);background:linear-gradient(135deg,#fff 0%,#fef2f2 100%);border:3px solid #dc2626;position:relative}'+
' .header{height:120px;display:flex;align-items:center;justify-content:center;flex-direction:column;position:relative;border-bottom:4px solid #dc2626;background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);color:#fff}'+
' .brand-title{font-size:28px;font-weight:800;letter-spacing:.5px;text-shadow:0 2px 4px rgba(0,0,0,.1)}'+
' .subtitle{font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.95);margin-top:8px}'+
' .body{height:280px;display:flex;background:linear-gradient(135deg,#fff 0%,#fef2f2 100%)}'+
' .half{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;border:2px solid #fecaca;margin:15px 12px;border-radius:16px;background:#fff}'+
' .half.left{border-color:#059669;background:linear-gradient(135deg,#fff 0%,#f0fdf4 100%)}'+
' .half.right{border-color:#dc2626;background:linear-gradient(135deg,#fff 0%,#fef2f2 100%)}'+
' .title{font-size:16px;font-weight:900;margin-bottom:6px}'+
' .left .title{color:#059669}.right .title{color:#dc2626}'+
' .sub{font-size:11px;margin-bottom:18px;text-align:center;font-weight:700;color:#6b7280}'+
' .qr{display:flex;align-items:center;justify-content:center;border-radius:14px;border:3px solid currentColor;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.08);padding:10px}'+
' .left .qr{color:#059669}.right .qr{color:#dc2626}'+
' .qr img{display:block;image-rendering:pixelated}'+
' .footer{position:absolute;bottom:0;left:0;right:0;background:#f3f4f6;padding:8px 20px;font-size:10px;color:#6b7280;text-align:center;line-height:1.3;border-top:1px solid #e5e7eb}'+
' @media print{ body{padding:0;background:#fff} .emergency-card{box-shadow:none;border:0} }'+
'</style></head><body>'+
'<div class="emergency-card">'+
' <div class="header"><div class="brand-title">MYQER™ Emergency Card</div><div class="subtitle">SCAN EITHER QR IN AN EMERGENCY</div></div>'+
' <div class="body">'+
'  <div class="half left"><div class="title">ONLINE QR</div><div class="sub">NETWORK AVAILABLE</div>'+
'   <div class="qr"><img id="imgOnline" width="200" height="200" alt="Online QR"></div>'+
'  </div>'+
'  <div class="half right"><div class="title">OFFLINE QR</div><div class="sub">NO NETWORK NEEDED</div>'+
'   <div class="qr"><img id="imgOffline" width="160" height="160" alt="Offline QR"></div>'+
'  </div>'+
' </div>'+
' <div class="footer">This card provides critical information to first responders. Verify details with official records.</div>'+
'</div>'+
'<script>document.addEventListener("DOMContentLoaded",function(){'+
'  document.getElementById("imgOnline").src='+JSON.stringify('')+';'+
'  document.getElementById("imgOffline").src='+JSON.stringify('')+';'+
'});<\/script>'+
'</body></html>'
  );
}

/* Synchronous (gesture-safe) popout using data: URLs */
function openCardNow({ autoPrint=false } = {}) {
  const o = document.getElementById('qrCanvas');
  const f = document.getElementById('vcardCanvas');
  if (!(o && f)) { toast('Generate both QRs first','error'); return; }

  const onlineDataURL  = o.toDataURL('image/png');
  const offlineDataURL = f.toDataURL('image/png');

  let html = buildEmergencyCardHTML_sync(onlineDataURL, offlineDataURL);
  // inject actual data URLs into the tiny script
  html = html.replace(JSON.stringify(''), JSON.stringify(onlineDataURL))
             .replace(JSON.stringify(''), JSON.stringify(offlineDataURL));

  const w = window.open('', '_blank', 'noopener');
  if (!w) { toast('Pop-up blocked','error'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();

  if (autoPrint) {
    const tryPrint = () => {
      const img1 = w.document.getElementById('imgOnline');
      const img2 = w.document.getElementById('imgOffline');
      if (!img1 || !img2) return;
      let loaded = 0;
      const done = () => { if (++loaded === 2) { try { w.focus(); } catch(_){} w.print(); } };
      img1.onload = done; img2.onload = done;
    };
    if (w.document.readyState === 'complete') tryPrint();
    else w.addEventListener('load', tryPrint);
  }
}

/* ---------- ICE (single kept copy) ---------- */
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
  if (addBtn){
    if (iceContacts.length>=3){ addBtn.disabled=true; addBtn.textContent='Maximum 3 contacts reached'; }
    else { addBtn.disabled=false; addBtn.textContent='Add Emergency Contact'; }
  }
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

/* ---------- Profile & Health (as in your code) ---------- */
function upsertProfileSmart(rowBase){
  return getUserId().then(async (uid)=>{
    if (!uid) return;
    const code = await ensureShortCode();

    let schema = 'snake';
    try {
      const probe = await supabase.from('profiles').select('user_id').limit(1);
      if (probe.error && /does not exist/i.test(probe.error.message)) schema = 'camel';
    } catch (_) { schema = 'camel'; }

    const snakeRow = { user_id: uid, code, full_name: rowBase.full_name, date_of_birth: rowBase.date_of_birth, country: rowBase.country, national_id: rowBase.national_id };
    const camelRow = { userId: uid, code, fullName: rowBase.full_name, dob: rowBase.date_of_birth, country: rowBase.country, healthId: rowBase.national_id };

    async function upsertSnake(){
      const existing = await supabase.from('profiles').select('user_id').eq('user_id', uid).maybeSingle();
          async function upsertCamel(){
      const existing = await supabase.from('profiles').select('userId').eq('userId', uid).maybeSingle();
      if (existing.error && !/no rows/i.test(existing.error.message)) throw existing.error;
      if (existing.data){
        const { error } = await supabase.from('profiles')
          .update({ fullName: camelRow.fullName, dob: camelRow.dob, country: camelRow.country, healthId: camelRow.healthId, code: camelRow.code })
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

  if (!isSupabaseAvailable) { 
    calculateTriage(); 
    toast('Saved locally (offline mode)','info'); 
    renderUrlQR(); 
    renderVCardQR(); 
    return; 
  }

  supabase.auth.getSession()
    .then((r) => {
      const session = r?.data?.session;
      if (!session) { 
        calculateTriage(); 
        toast('Saved locally — please sign in to sync','info'); 
        renderUrlQR(); 
        renderVCardQR(); 
        throw new Error('no session'); 
      }
      return getUserId();
    })
    .then((uid) => {
      if (!uid) { 
        calculateTriage(); 
        toast('Saved locally — please sign in to sync','info'); 
        renderUrlQR(); 
        renderVCardQR(); 
        throw new Error('no uid'); 
      }

      const snake = { 
        user_id: uid, 
        blood_type: health.bloodType, 
        allergies: health.allergies, 
        conditions: health.conditions, 
        medications: health.medications, 
        implants: health.implants, 
        organ_donor: health.organDonor, 
        triage_override: health.triageOverride 
      };
      const camel = { 
        user_id: uid, 
        bloodType: health.bloodType, 
        allergies: health.allergies, 
        conditions: health.conditions, 
        medications: health.medications, 
        implants: health.implants, 
        organDonor: health.organDonor, 
        triageOverride: health.triageOverride 
      };

      return supabase.from('health_data').upsert(snake, { onConflict: 'user_id' })
        .then(({ error }) => { 
          if (!error) return; 
          return supabase.from('health_data').upsert(camel, { onConflict: 'user_id' }).then(({ error:e2 }) => { if (e2) throw e2; }); 
        });
    })
    .then(() => { 
      calculateTriage(); 
      toast('Health info saved','success'); 
      renderUrlQR(); 
      renderVCardQR(); 
    })
    .catch((e) => { 
      if (e && (e.message==='no session' || e.message==='no uid')) return; 
      console.error(e); 
      toast('Error saving health','error'); 
    });
}

/* ---------------- local-first fill ---------------- */
function fillFromLocal(){
  try{
    // profile
    const lp = localStorage.getItem('myqer_profile');
    if (lp) userData.profile = JSON.parse(lp) || {};
    window.userData = userData;

    const p = userData.profile;
    const set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
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
      } catch { userData.health = {}; }
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

    // ICE
    const li = localStorage.getItem('myqer_ice');
    iceContacts = li ? (JSON.parse(li) || []) : [];
    window.iceContacts = iceContacts;
    renderIceContacts();
  }catch(e){ console.warn('Local fill failed', e); }
}

/* ---------------- server sync load ---------------- */
function loadFromServer(){
  if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
  return withTimeout(supabase.auth.getSession(),3000,'getSession').then(res=>{
    if (!res.data?.session) return;
    return withTimeout(getUserId(),3000,'getUserId').then(uid=>{
      if (!uid) return;

      // profiles (snake → camel)
      const selSnake = supabase.from('profiles').select('*').eq('user_id',uid).maybeSingle();
      return withTimeout(selSnake,4000,'profiles.snake').then(rp=>{
        if (rp?.data) return rp;
        const selCamel = supabase.from('profiles').select('*').eq('userId',uid).maybeSingle();
        return withTimeout(selCamel,4000,'profiles.camel');
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
          window.userData  = userData;

          if (userData.profile && userData.profile.code) {
            localStorage.setItem('myqer_shortcode', userData.profile.code);
          }
          localStorage.setItem('myqer_profile', JSON.stringify(userData.profile));

          const p=userData.profile, set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
          set('profileFullName', p.full_name);
          set('profileDob',      p.date_of_birth);
          set('profileCountry',  p.country);
          set('profileHealthId', p.national_id);
        }
      }).then(()=>{
        // health
        return withTimeout(
          supabase.from('health_data').select('*').eq('user_id', uid).maybeSingle(),
          4000,'health_data'
        ).then((rh)=>{
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

          const h=userData.health, set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
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
          4000,'ice_contacts'
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
        // draw both QRs after sync
        renderUrlQR();
        renderVCardQR();
      });
    });
  }).catch(e=>console.warn('Server load failed', e));
}

/* ---------------- Buttons wiring ---------------- */
function wireQRButtons(){
  // COPY LINK
  on($('copyLink'),'click',()=>{ 
    (async () => {
      let url = $('cardUrl')?.value || getShortUrlSync();
      if(!url) return toast('No link to copy','error');
      navigator.clipboard.writeText(url).then(()=>toast('Link copied','success')).catch(()=>toast('Copy failed','error'));
    })();
  });

  // OPEN LINK → ONLY the online /c/<CODE> page (no card)
  on($('openLink'),'click', async () => {
    const url = getShortUrlSync();
    if (!url) return toast('No link to open','error');
    window.open(url, '_blank', 'noopener');   // direct
  });

  // PNG → render full card with both QRs and download as PNG
  on($('dlVcardPNG'),'click', async () => {
    await renderUrlQR(); await renderVCardQR();   // ensure fresh
    downloadCardPNG();
  });

  // PRINT → open card page & auto-print
  on($('printVcard'),'click', async () => {
    await renderUrlQR(); await renderVCardQR();
    openCardNow({ autoPrint:true });
  });

  // Regenerate offline QR manually
  on($('regenVcardBtn'),'click', async ()=> { await renderVCardQR(); toast('Offline QR regenerated','success'); });

  // Hide any legacy elements if present
  const killEl = (id)=>{ const el=$(id); if (el) el.style.display='none'; };
  killEl('dlSVG'); killEl('printQR');
}

/* ---------------- delete / logout ---------------- */
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

/* ---------------- autosave helpers ---------------- */
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

/* ---------------- DOM ready ---------------- */
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
  renderUrlQR();
  renderVCardQR();
  loadFromServer().then(()=> { renderUrlQR(); renderVCardQR(); });

  const loading=$('loadingState'); if (loading) loading.style.display='none';
  setTimeout(()=>{ const l=$('loadingState'); if (l) l.style.display='none'; }, 4000);
});

/* ---------------- never-stuck loader guards ---------------- */
window.addEventListener('error', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });
window.addEventListener('unhandledrejection', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });

/* ---------------- light heartbeat ---------------- */
setInterval(()=>{ try{ navigator.sendBeacon?.('/ping',''); }catch{} }, 120000);
})();
