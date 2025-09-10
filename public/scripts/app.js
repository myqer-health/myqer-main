// /public/scripts/app.js
// Dashboard logic with stable URL QR + separate offline vCard QR.
// Updated: equal QR sizes, inline aligned vCard QR next to the Online QR,
// and vCard panel shows 4 buttons (Open Link, Regenerate, Download PNG, Print).
// Download/Print output the single branded card that contains BOTH QRs.
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

  // Allowed chars (no O/0/I/1). We use a 6-character code.
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
    actuallyCalculateTriage(allergies, ($('hfConditions')?.value || '').toLowerCase());
  }
  function actuallyCalculateTriage(allergies, conditions){
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
  const TRIAGE_COLOR = { RED:'#E11D48', AMBER:'#F59E0B', GREEN:'#16A34A', BLACK:'#111827' };
  function currentTriageHex() {
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

  /* ---------- DISPLAY / EXPORT SIZING (equalize) ---------- */
  const DISPLAY_QR_SIZE = 220; // on-screen size for both QRs (equal physical size)
  const getDPR = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1)); // clamp for performance

  function styleAndSizeQrCanvas(canvas){
    if (!canvas) return;
    const dpr = getDPR();
    const px = Math.round(DISPLAY_QR_SIZE * dpr);
    canvas.width  = px;
    canvas.height = px;
    canvas.style.width  = DISPLAY_QR_SIZE + 'px';
    canvas.style.height = DISPLAY_QR_SIZE + 'px';
    canvas.style.display = 'block';
    canvas.style.background = '#fff';
    canvas.style.imageRendering = 'pixelated';
  }

  /* ---------- URL QR (online) ---------- */
  async function renderUrlQR() {
    const qrCanvas    = $('qrCanvas');        // URL QR canvas (inside #qrSlot)
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

      styleAndSizeQrCanvas(qrCanvas);
      const dpr = getDPR();
      const renderPx = Math.round(DISPLAY_QR_SIZE * dpr);

      await new Promise((resolve, reject) =>
        window.QRCode.toCanvas(
          qrCanvas,
          shortUrl,
          { width: renderPx, margin: 1, errorCorrectionLevel: 'M' },
          err => err ? reject(err) : resolve()
        )
      );

      qrCanvas.style.display = 'block';
      if (qrStatus) { qrStatus.textContent = 'QR Code generated successfully'; qrStatus.hidden = false; }

      // Keep inline alignment updated
      ensureDualQrInline();
    } catch (err) {
      console.error('URL QR error:', err);
      if (qrStatus) { qrStatus.textContent='⚠️ Couldn’t draw QR. Please try again.'; qrStatus.hidden=false; }
    }
  }

  /* ---------- vCard QR (offline ICE) ---------- */
  function styleVcardCanvas () {
    const c = $('vcardCanvas');
    if (!c) return;
    // Visual
    c.style.background      = '#fff';
    c.style.borderRadius    = '12px';
    c.style.padding         = '0';
    c.style.boxShadow       = '0 8px 32px rgba(220, 38, 38, 0.10)';
    c.style.width           = DISPLAY_QR_SIZE + 'px';
    c.style.height          = DISPLAY_QR_SIZE + 'px';
    c.style.imageRendering  = 'pixelated';
    c.style.display         = 'block';
  }

  async function renderVCardQR() {
    const canvas = $('vcardCanvas');       // offline canvas (inside #vcardSlot)
    const help   = $('vcardHelp');         // helper text
    const regen  = $('regenVcardBtn');     // regenerate button
    const ph     = $('vcardPlaceholder');  // placeholder message
    const ready  = isOfflineReady();

    if (!canvas && !help && !regen && !ph) return;

    if (help) {
      help.textContent = ready
        ? 'Offline QR is ready. Re-generate and re-print if Country, Blood, Donor, Triage or ICE change.'
        : 'Generated when Country, Blood, Donor and an ICE phone are set. Re-generate and re-print if any change.';
    }
    if (regen) regen.disabled = !ready;

    if (!ready || !canvas) {
      if (ph) ph.hidden = false;
      if (canvas) canvas.style.display = 'none';
      ensureDualQrInline(); // still show placeholders + buttons row
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

      styleAndSizeQrCanvas(canvas);
      const dpr = getDPR();
      const renderPx = Math.round(DISPLAY_QR_SIZE * dpr);

      await new Promise((resolve, reject) =>
        window.QRCode.toCanvas(
          canvas,
          vcard,
          {
            width: renderPx,
            margin: 1,
            errorCorrectionLevel: 'Q',
            color: { dark, light: '#FFFFFF' }
          },
          err => err ? reject(err) : resolve()
        )
      );

      canvas.style.display = 'block';
      if (ph) ph.hidden = true; // hide grey placeholder when real QR is present
      styleVcardCanvas();

      ensureDualQrInline();
    } catch (e) {
      console.error('vCard QR error:', e);
      if (ph) ph.hidden = false;
      if (canvas) canvas.style.display = 'none';
      ensureDualQrInline();
    }
  }

  /* ---------- Inline aligned QRs + buttons under vCard ---------- */
  function ensureDualQrInline(){
    const vcardCanvas = $('vcardCanvas');
    const regenBtn    = $('regenVcardBtn');
    const dlBtn       = $('dlVcardPNG');
    const printBtn    = $('printVcard');

    // We need a host in the vCard section. Use the nearest container around the vCard controls.
    // We'll insert the inline row just ABOVE the buttons, and then put a unified buttons row right under it.
    if (!(regenBtn || dlBtn || printBtn)) return;
    const btnRow = (printBtn && printBtn.parentElement) || (dlBtn && dlBtn.parentElement) || (regenBtn && regenBtn.parentElement);
    if (!btnRow || !btnRow.parentElement) return;
    const vcardSection = btnRow.parentElement;

    // Create inline row if not present
    let inlineRow = $('inlineQrRow');
    if (!inlineRow) {
      inlineRow = document.createElement('div');
      inlineRow.id = 'inlineQrRow';
      inlineRow.style.display = 'grid';
      inlineRow.style.gridTemplateColumns = 'repeat(2, minmax(240px, 1fr))';
      inlineRow.style.gap = '20px';
      inlineRow.style.alignItems = 'start';
      inlineRow.style.justifyItems = 'center';
      inlineRow.style.marginTop = '12px';
      vcardSection.insertBefore(inlineRow, btnRow); // place above buttons
    } else {
      // make sure it remains above buttons
      if (inlineRow.nextElementSibling !== btnRow) {
        vcardSection.insertBefore(inlineRow, btnRow);
      }
    }

    // Helper to build a labeled cell for a QR
    function buildCell(titleTop, titleSub, accentColor, contentNode){
      const cell = document.createElement('div');
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.alignItems = 'center';
      cell.style.background = '#fff';
      cell.style.border = '1px solid #e5e7eb';
      cell.style.borderRadius = '12px';
      cell.style.padding = '12px';

      const t1 = document.createElement('div');
      t1.textContent = titleTop;
      t1.style.fontWeight = '800';
      t1.style.fontSize = '14px';
      t1.style.letterSpacing = '.06em';
      t1.style.color = accentColor;
      const t2 = document.createElement('div');
      t2.textContent = titleSub;
      t2.style.fontSize = '11px';
      t2.style.color = '#6b7280';
      t2.style.marginBottom = '8px';

      const frame = document.createElement('div');
      frame.style.width = DISPLAY_QR_SIZE + 'px';
      frame.style.height = DISPLAY_QR_SIZE + 'px';
      frame.style.border = '3px solid ' + accentColor;
      frame.style.borderRadius = '12px';
      frame.style.background = '#fff';
      frame.style.display = 'flex';
      frame.style.alignItems = 'center';
      frame.style.justifyContent = 'center';
      frame.style.boxShadow = '0 8px 18px rgba(0,0,0,.06)';

      if (contentNode) {
        contentNode.style.width = DISPLAY_QR_SIZE + 'px';
        contentNode.style.height = DISPLAY_QR_SIZE + 'px';
        contentNode.style.display = 'block';
        contentNode.style.imageRendering = 'pixelated';
        frame.appendChild(contentNode);
      } else {
        const ph = document.createElement('div');
        ph.textContent = 'Not ready';
        ph.style.fontWeight = '700';
        ph.style.color = accentColor;
        frame.appendChild(ph);
      }

      cell.append(t1, t2, frame);
      return cell;
    }

    // Rebuild row content from current canvases (do not move the original URL canvas).
    inlineRow.innerHTML = '';

    // ONLINE (black) — source from qrCanvas (clone to <img>)
    const urlCanvas = $('qrCanvas');
    let onlineNode = null;
    if (urlCanvas && urlCanvas.width) {
      onlineNode = new Image();
      try { onlineNode.src = urlCanvas.toDataURL('image/png'); } catch(_) {}
    }
    inlineRow.appendChild(buildCell('ONLINE QR', 'When Network', '#059669', onlineNode));

    // OFFLINE (red) — use vCard QR if ready, else placeholder
    const vReady = vcardCanvas && vcardCanvas.style.display !== 'none' && vcardCanvas.width;
    let offlineNode = null;
    if (vReady) {
      offlineNode = new Image();
      try { offlineNode.src = vcardCanvas.toDataURL('image/png'); } catch(_) {}
    }
    inlineRow.appendChild(buildCell('OFFLINE QR', 'When Offline', '#d32f2f', offlineNode));

    // --- Buttons row under the QRs: Open Link + Regenerate + Download + Print
    let unifiedBtns = $('vcardUnifiedBtns');
    if (!unifiedBtns) {
      unifiedBtns = document.createElement('div');
      unifiedBtns.id = 'vcardUnifiedBtns';
      unifiedBtns.style.display = 'flex';
      unifiedBtns.style.flexWrap = 'wrap';
      unifiedBtns.style.gap = '12px';
      unifiedBtns.style.marginTop = '10px';
      unifiedBtns.style.alignItems = 'center';
      unifiedBtns.style.justifyContent = 'flex-start';
      vcardSection.insertBefore(unifiedBtns, btnRow.nextSibling);
    }

    // Ensure we have an "Open Link" button here as well (do not remove the original)
    let openLinkInline = $('openLinkInline');
    if (!openLinkInline) {
      const original = $('openLink');
      openLinkInline = document.createElement('button');
      openLinkInline.id = 'openLinkInline';
      openLinkInline.type = 'button';
      openLinkInline.textContent = 'Open Link';
      // Try to copy some visual class from original if present
      if (original && original.className) openLinkInline.className = original.className;
      openLinkInline.style.minWidth = '120px';
      on(openLinkInline, 'click', ()=> {
        const url = $('cardUrl')?.value || '';
        if(!url) return toast('No link to open','error');
        window.open(url,'_blank','noopener');
      });
    }

    // Move existing vCard buttons into the unified row (keeps DOM single source)
    function moveBtn(btn) {
      if (!btn) return;
      btn.style.minWidth = '120px';
      if (btn.parentElement !== unifiedBtns) unifiedBtns.appendChild(btn);
    }

    unifiedBtns.innerHTML = '';
    unifiedBtns.appendChild(openLinkInline);
    moveBtn(regenBtn);
    moveBtn(dlBtn);
    moveBtn(printBtn);
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
            allergies:      raw.allergies      != null ? raw.allergies      : raw.alergy_list || raw.allergy_list,
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
      const set2=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
      set2('hfBloodType',  h.bloodType);
      set2('hfAllergies',  h.allergies);
      set2('hfConditions', h.conditions);
      set2('hfMeds',       h.medications);
      set2('hfImplants',   h.implants);
      if ($('hfDonor')) $('hfDonor').checked = !!h.organDonor;
      if ($('triageOverride')) $('triageOverride').value = h.triageOverride || 'auto';
      calculateTriage();

      // ice
      const li=localStorage.getItem('myqer_ice');
      iceContacts = li ? (JSON.parse(li)||[]) : [];
      window.iceContacts=iceContacts;
      renderIceContacts();
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

            const h=userData.health; const setH=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
            setH('hfBloodType',  h.bloodType);
            setH('hfAllergies',  h.allergies);
            setH('hfConditions', h.conditions);
            setH('hfMeds',       h.medications);
            setH('hfImplants',   h.implants);
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

  /* ---------- Layout helpers: keep QRs aligned + move buttons under red QR ---------- */
  function normalizeCanvasSize220(canvas){
    if (!canvas) return;
    const dpr = getDPR();
    const px = Math.round(DISPLAY_QR_SIZE * dpr);
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = DISPLAY_QR_SIZE + 'px';
    canvas.style.height = DISPLAY_QR_SIZE + 'px';
    canvas.style.imageRendering = 'pixelated';
  }

  function placeVcardNextToUrl(){
    // Keep black QR where it is; align red (vCard) to same size + top edge visually
    const url = $('qrCanvas');
    const red = $('vcardCanvas');
    const ph  = $('vcardPlaceholder');
    if (url) normalizeCanvasSize220(url);
    if (red && (!ph || ph.hidden)) {
      normalizeCanvasSize220(red);
      red.style.marginTop = (url ? url.getBoundingClientRect().top - red.getBoundingClientRect().top : 0) + 'px';
      // Guard if negative or NaN
      if (!/^-?\d+px$/.test(red.style.marginTop)) red.style.marginTop = '0px';
    }
  }

  function moveButtonsUnderVcard(){
    // We want 4 buttons under the red QR: Open Link, Regenerate, Download PNG, Print
    const openLinkBtn = $('openLink');
    const regenBtn    = $('regenVcardBtn');
    const dlBtn       = $('dlVcardPNG');
    const printBtn    = $('printVcard');
    const red         = $('vcardCanvas') || $('vcardPlaceholder');

    if (!red) return;

    // Create/locate target row
    let row = $('vcardActionRow');
    if (!row) {
      row = document.createElement('div');
      row.id = 'vcardActionRow';
      row.style.display = 'flex';
      row.style.flexWrap = 'wrap';
      row.style.gap = '10px';
      row.style.marginTop = '10px';
      // Insert after the red QR canvas/placeholder
      red.parentElement && red.parentElement.appendChild(row);
    }

    // Move buttons into the row (not cloning—preserve handlers)
    [openLinkBtn, regenBtn, dlBtn, printBtn].forEach(btn=>{
      if (btn && btn.parentElement !== row) row.appendChild(btn);
      if (btn) btn.style.display = ''; // ensure visible
    });
  }

  /* ---------- Card composer (both QRs into one image) ---------- */
  function composeEmergencyCardCanvas(){
    const urlC   = $('qrCanvas');
    const vcardC = $('vcardCanvas');
    const vReady = (!$('vcardPlaceholder') || $('vcardPlaceholder').hidden) && vcardC && vcardC.width>0;

    const dpr = getDPR();
    const W = Math.round(794 * dpr);
    const H = Math.round(560 * dpr);
    const PAD = Math.round(24 * dpr);
    const GUT = Math.round(24 * dpr);
    const QRBOX = Math.round(220 * dpr);
    const HEADER_H = Math.round(72 * dpr);
    const FOOTER_H = Math.round(56 * dpr);
    const COL_W = Math.floor((W - PAD*2 - GUT) / 2);
    const COL_H = H - HEADER_H - FOOTER_H - PAD*2;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    function roundedRect(x,y,w,h,r, strokeColor, fillColor){
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.arcTo(x+w, y,   x+w, y+h, r);
      ctx.arcTo(x+w, y+h, x,   y+h, r);
      ctx.arcTo(x,   y+h, x,   y,   r);
      ctx.arcTo(x,   y,   x+w, y,   r);
      ctx.closePath();
      if (fillColor){ ctx.fillStyle = fillColor; ctx.fill(); }
      if (strokeColor){ ctx.strokeStyle = strokeColor; ctx.lineWidth = Math.max(2, Math.round(2*dpr)); ctx.stroke(); }
    }
    function centerText(text, xCenter, y, sizePx, weight=800, color='#111'){
      ctx.fillStyle = color;
      ctx.font = `${weight} ${Math.round(sizePx)}px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, xCenter, y);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    function labelText(text, x, y, sizePx, weight=800, color='#111'){
      ctx.fillStyle = color;
      ctx.font = `${weight} ${Math.round(sizePx)}px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x, y);
    }

    // Background + header
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,W,H);
    const brandRed = '#d32f2f', brandDark = '#b91c1c';
    const grad = ctx.createLinearGradient(0,0,W,0);
    grad.addColorStop(0, brandRed); grad.addColorStop(1, brandDark);
    ctx.fillStyle = grad; ctx.fillRect(0,0,W,HEADER_H);
    centerText('MYQER™ Emergency Card', W/2, HEADER_H/2, 22*dpr, 800, '#fff');

    // Panels
    const bodyTop = HEADER_H + PAD;
    const leftX = PAD, rightX = PAD + COL_W + GUT;
    roundedRect(leftX, bodyTop, COL_W, COL_H, Math.round(16*dpr), '#bbf7d0', '#f0fdf4');
    roundedRect(rightX, bodyTop, COL_W, COL_H, Math.round(16*dpr), '#fecaca', '#fff1f1');

    // Labels
    const lblPad = Math.round(16*dpr);
    labelText('ONLINE QR', leftX + lblPad, bodyTop + lblPad + Math.round(4*dpr), 14*dpr, 800, '#059669');
    labelText('When Network', leftX + lblPad, bodyTop + lblPad + Math.round(22*dpr), 11*dpr, 600, '#6b7280');
    labelText('OFFLINE QR', rightX + lblPad, bodyTop + lblPad + Math.round(4*dpr), 14*dpr, 800, brandRed);
    labelText('When Offline', rightX + lblPad, bodyTop + lblPad + Math.round(22*dpr), 11*dpr, 600, '#6b7280');

    // QR slots
    const slotW = QRBOX, slotH = QRBOX;
    const slotY = bodyTop + lblPad + Math.round(36*dpr);
    const leftSlotX  = leftX  + Math.round((COL_W - slotW)/2);
    const rightSlotX = rightX + Math.round((COL_W - slotW)/2);

    function drawFrame(x,y){
      roundedRect(x, y, slotW, slotH, Math.round(16*dpr), '#e5e7eb', '#ffffff');
    }

    // Left QR
    drawFrame(leftSlotX, slotY);
    if (urlC && urlC.width>0){
      ctx.drawImage(urlC, 0,0,urlC.width,urlC.height, leftSlotX, slotY, slotW, slotH);
    }

    // Right QR or Not ready
    drawFrame(rightSlotX, slotY);
    if (vReady){
      ctx.drawImage(vcardC, 0,0,vcardC.width,vcardC.height, rightSlotX, slotY, slotW, slotH);
    } else {
      ctx.fillStyle = brandRed;
      ctx.font = `${800} ${Math.round(16*dpr)}px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Not ready', rightSlotX + slotW/2, slotY + Math.round(28*dpr));
      ctx.fillStyle = '#6b7280';
      ctx.font = `${600} ${Math.round(12*dpr)}px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif`;
      const lines = ['• Country set', '• Blood type set', '• Donor status set', '• 1+ ICE contact'];
      let yy = slotY + Math.round(58*dpr);
      lines.forEach(line => { ctx.fillText(line, rightSlotX + slotW/2, yy); yy += Math.round(20*dpr); });
      ctx.textAlign = 'start';
    }

    // Footer
    const FOOTER_Y = H - FOOTER_H;
    ctx.fillStyle = '#f3f4f6'; ctx.fillRect(0, FOOTER_Y, W, FOOTER_H);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = Math.max(1, Math.round(1*dpr));
    ctx.beginPath(); ctx.moveTo(0, FOOTER_Y); ctx.lineTo(W, FOOTER_Y); ctx.stroke();
    centerText('This card provides critical information to first responders. Verify details with official records.', W/2, FOOTER_Y + FOOTER_H/2, 12*dpr, 600, '#6b7280');

    return c;
  }

  /* ---------- buttons ---------- */
  function wireQRButtons(){
    // URL panel
    on($('copyLink'),'click',()=>{ const url=$('cardUrl')?.value||''; if(!url) return toast('No link to copy','error'); navigator.clipboard.writeText(url).then(()=>toast('Link copied','success')).catch(()=>toast('Copy failed','error')); });
    on($('openLink'),'click',()=>{ const url=$('cardUrl')?.value||''; if(!url) return toast('No link to open','error'); window.open(url,'_blank','noopener'); });

    // Hide legacy URL-only downloads if present
    const hide = (id)=>{ const el=$(id); if (el) el.style.display='none'; };
    hide('dlPNG'); hide('dlSVG'); hide('printQR');

    // vCard actions
    on($('regenVcardBtn'),'click', ()=> { renderVCardQR(); toast('Offline QR regenerated','success'); });

    on($('dlVcardPNG'),'click',()=> {
      const composed = composeEmergencyCardCanvas();
      try {
        const a=document.createElement('a');
        a.download='myqer-emergency-card.png';
        a.href=composed.toDataURL('image/png');
        a.click();
        toast('Emergency card PNG downloaded','success');
      } catch(e){
        console.error(e);
        toast('Could not generate card image','error');
      }
    });

    on($('printVcard'),'click',()=> {
      const composed = composeEmergencyCardCanvas();
      const dataUrl = composed.toDataURL('image/png');
      const w=window.open('','_blank','noopener');
      if(!w) return toast('Pop-up blocked','error');
      w.document.write(`<html><head><meta charset="utf-8"><title>MYQER Emergency Card</title>
        <style>@page{margin:12mm}body{margin:0;text-align:center;font:14px/1.4 -apple-system,Segoe UI,Roboto,Arial}</style></head>
        <body><img src="${dataUrl}" alt="MYQER™ Emergency Card" style="max-width:100%;height:auto"/><script>onload=()=>setTimeout(()=>print(),250)</script></body></html>`);
      w.document.close();
    });
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
    renderUrlQR();
    renderVCardQR();

    // Align layout and buttons
    placeVcardNextToUrl();
    moveButtonsUnderVcard();

    loadFromServer().then(()=> { renderUrlQR(); renderVCardQR(); placeVcardNextToUrl(); moveButtonsUnderVcard(); });

    const loading=$('loadingState'); if (loading) loading.style.display='none';
    setTimeout(()=>{ const l=$('loadingState'); if (l) l.style.display='none'; }, 4000);
  });

  // never-stuck loader guards
  window.addEventListener('error', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });
  window.addEventListener('unhandledrejection', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });

  // light heartbeat (helps some hosting keep the worker warm)
  setInterval(()=>{ try{ navigator.sendBeacon?.('/ping',''); }catch{} }, 120000);
})();
