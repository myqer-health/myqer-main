// /public/scripts/app.js
// Dashboard logic with safe short-code sanitizing + robust QR generation.

(function () {
  /* ===== small helpers ===== */
  const $  = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn, { passive: true });
  const withTimeout = (p, ms, label) =>
    Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error((label||'promise')+' timed out')), ms))]);
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

  /* ===== global state ===== */
  let supabase, isSupabaseAvailable = false;
  let isOnline = navigator.onLine;
  let userData = { profile: {}, health: {} };
  let iceContacts = [];
  const autoSaveTimers = {};
  window.userData = userData; window.iceContacts = iceContacts;

  /* ===== short-code sanitize/validate ===== */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1
const CODE_RX = /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/;

function makeCode_3_3(){
  const pick = n => Array.from({length:n},()=> CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('');
  return `${pick(3)}-${pick(3)}`;
}
const normalizeDashes = s => (s||'').replace(/[\u2010-\u2015\u2212]/g,'-').toUpperCase();

function getCleanStoredCode(){
  let code = normalizeDashes(localStorage.getItem('myqer_shortcode'));
  if (!CODE_RX.test(code||'')) {
    code = makeCode_3_3();
    localStorage.setItem('myqer_shortcode', code);
  }
  return code;
}

  /* ===== Supabase ===== */
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

  /* ===== toasts ===== */
  function toast(msg, type='success', ms=2200){
    let area = $('toastArea');
    if (!area) { area = document.createElement('div'); area.id='toastArea'; area.setAttribute('aria-live','polite'); document.body.appendChild(area); }
    const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg;
    area.appendChild(el);
    requestAnimationFrame(()=> el.classList.add('show'));
    setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 250); }, ms);
  }

  /* ===== network badge ===== */
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

  /* ===== triage ===== */
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

  /* ===== short-code ensure/upsert ===== */
  function ensureShortCode(){
    let code = getCleanStoredCode();
    if (!(isSupabaseAvailable && isOnline)) return Promise.resolve(code);
    return getUserId().then(uid=>{
      if (!uid) return code;
      let attempt=0;
      const tryUpsert = () => {
        attempt++;
        return supabase.from('profiles').upsert({ user_id: uid, code }, { onConflict: 'user_id' })
          .then(res=>{
            if (!res.error) return code;
            const m = ((res.error.message||'')+' '+(res.error.details||'')).toLowerCase();
            if ((m.includes('duplicate')||m.includes('unique')) && attempt<6){
              code = makeShort_3_4_3();
              localStorage.setItem('myqer_shortcode', code);
              return tryUpsert();
            }
            console.warn('shortcode upsert err:', res.error); return code;
          }).catch(e=>{ console.warn('ensureShortCode failed', e); return code; });
      };
      return tryUpsert();
    });
  }

  /* ===== embedded QR fallback (SVG->canvas) ===== */
  const simpleQR = (function(){ /* compact encoder */
    function QR8bitByte(d){this.mode=4;this.data=d}
    QR8bitByte.prototype={getLength(){return new TextEncoder().encode(this.data).length},
      write(b){for(const x of new TextEncoder().encode(this.data))b.put(x,8)}};
    function QRBitBuffer(){this.buffer=[];this.length=0}
    QRBitBuffer.prototype.put=function(n,l){for(let i=0;i<l;i++)this.putBit(((n>>>(l-i-1))&1)===1)};
    QRBitBuffer.prototype.putBit=function(b){this.buffer.push(b?1:0);this.length++};
    function RSBlock(t,d){this.totalCount=t;this.dataCount=d}
    const PAD0=0xEC,PAD1=0x11;
    const RS={1:[1,9,7],2:[1,16,10],3:[1,26,15],4:[1,36,20],5:[1,44,26],6:[2,60,36],7:[2,66,43],8:[2,86,54],9:[2,100,69],10:[4,122,84],11:[4,140,93],12:[4,158,107],13:[4,180,115],14:[4,197,131]};
    const blocks=(t)=>{const a=RS[t],o=[];for(let i=0;i<a[0];i++)o.push(new RSBlock(a[1],a[2]));return o};
    function QRCode(n){this.typeNumber=n||0;this.modules=null;this.moduleCount=0;this.dataList=[]}
    QRCode.prototype={addData(d){this.dataList.push(new QR8bitByte(d))},
      make(){if(this.typeNumber<1){for(let t=1;t<=14;t++){this.typeNumber=t;if(this.getMaxDataBits()>=this.getDataLength())break}}
        this.moduleCount=this.typeNumber*4+17;this.modules=Array.from({length:this.moduleCount},()=>Array(this.moduleCount).fill(null));
        this.pp(0,0);this.pp(this.moduleCount-7,0);this.pp(0,this.moduleCount-7);this.tp();this.mapData(this.createData());this.mask()},
      isDark(r,c){return this.modules[r][c]},
      getDataLength(){return this.dataList.reduce((n,d)=>n+d.getLength(),0)},
      getMaxDataBits(){return blocks(this.typeNumber).reduce((n,b)=>n+b.dataCount,0)*8-4},
      pp(row,col){for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const rr=row+r,cc=col+c;if(rr<0||rr>=this.moduleCount||cc<0||cc>=this.moduleCount)continue;this.modules[rr][cc]=(r>=0&&r<=6&&(c===0||c===6))||(c>=0&&c<=6&&(r===0||r===6))||(r>=2&&r<=4&&c>=2&&c<=4)}},
      tp(){for(let i=8;i<this.moduleCount-8;i++){const v=i%2===0;if(this.modules[i][6]==null)this.modules[i][6]=v;if(this.modules[6][i]==null)this.modules[6][i]=v}},
      createData(){const rs=blocks(this.typeNumber),buf=new QRBitBuffer();for(const d of this.dataList){buf.put(4,4);buf.put(d.getLength(),8);d.write(buf)}const total=rs.reduce((n,b)=>n+b.dataCount,0),max=total*8;if(buf.length+4<=max)buf.put(0,4);while(buf.length%8)buf.put(0,1);let pad=true;while(buf.length<max){buf.put(pad?PAD0:PAD1,8);pad=!pad}const out=[];for(let i=0;i<buf.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|buf.buffer[i+j];out.push(v)}return out},
      mapData(data){let row=this.moduleCount-1,col=this.moduleCount-1,dir=-1,bi=0,bb=7;const nb=()=>{const v=(data[bi]>>>bb)&1;if(--bb<0){bi++;bb=7}return v};while(col>0){if(col===6)col--;for(let i=0;i<this.moduleCount;i++){const r=row+dir*i,c1=col,c2=col-1;for(const c of [c1,c2]) if(this.modules[r]&&this.modules[r][c]==null)this.modules[r][c]=nb()===1}row+=dir*(this.moduleCount);dir=-dir;col-=2}},
      mask(){const S=[];for(let m=0;m<4;m++){const cp=this.modules.map(r=>r.slice());for(let r=0;r<this.moduleCount;r++)for(let c=0;c<this.moduleCount;c++){if(cp[r][c]==null)continue;if(m===0)cp[r][c]=((r+c)%2===0)?!cp[r][c]:cp[r][c];if(m===1)cp[r][c]=(r%2===0)?!cp[r][c]:cp[r][c];if(m===2)cp[r][c]=(c%3===0)?!cp[r][c]:cp[r][c];if(m===3)cp[r][c]=((r+c)%3===0)?!cp[r][c]:cp[r][c]}S.push({m,cp,score:this.score(cp)})}S.sort((a,b)=>a.score-b.score);this.modules=S[0].cp},
      score(mat){const n=mat.length;let dark=0,runs=0;for(let r=0;r<n;r++)for(let c=0;c<n;c++){if(mat[r][c])dark++;if(c&&mat[r][c]===mat[r][c-1])runs++}for(let c=0;c<n;c++)for(let r=0;r<n;r++)if(r&&mat[r][c]===mat[r-1][c])runs++;const ratio=Math.abs(dark/(n*n)-0.5)*100;return runs+ratio}
    };
    function matrix(text){const q=new QRCode(0);q.addData(text||'');q.make();return q.modules.map(r=>r.map(v=>!!v))}
    function svg(text,size=260,margin=4){const m=matrix(text),n=m.length,scale=Math.max(1,Math.floor(size/(n+2*margin))),dim=scale*(n+2*margin);let d='';for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(m[r][c])d+=`M${(c+margin)*scale} ${(r+margin)*scale}h${scale}v${scale}h-${scale}z`;return{width:dim,height:dim,svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`}}
    function drawCanvas(canvas,text,size=260,margin=4){const out=svg(text,size,margin);const img=new Image();const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(out.svg);return new Promise((res,rej)=>{img.onload=()=>{canvas.width=out.width;canvas.height=out.height;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,out.width,out.height);ctx.drawImage(img,0,0,out.width,out.height);res()};img.onerror=rej;img.src=url})}
    return { svg, canvas: drawCanvas };
  })();

  /* ===== offline text ===== */
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

 async function generateQRCode() {
  const qrCanvas      = $('qrCanvas');
  const qrPlaceholder = $('qrPlaceholder');
  const codeUnderQR   = $('codeUnderQR');
  const cardUrlInput  = $('cardUrl');
  const qrStatus      = $('qrStatus');
  if (!qrCanvas) return;

  try {
    // 1) get + validate code
    let code = normalizeDashes(await ensureShortCode());
    if (!CODE_VALID.test(code)) throw new Error('invalid code');

    // 2) build URL (no trailing slash; use apex on prod so iOS sees a “normal” host)
    const base = location.hostname.endsWith('myqer.com')
      ? `https://${location.hostname.replace(/^www\./,'')}`
      : location.origin;
    const shortUrl = `${base.replace(/\/+$/,'')}/c/${code}`;

    // 3) update UI text
    if (codeUnderQR)  codeUnderQR.textContent = code;
    if (cardUrlInput) cardUrlInput.value = shortUrl;

    // 4) clear canvas first (important)
    const ctx = qrCanvas.getContext('2d');
    if (ctx) { ctx.imageSmoothingEnabled = false; ctx.clearRect(0,0,qrCanvas.width,qrCanvas.height); }

    // 5) draw using the *modern* qrcode lib; fallback to embedded encoder
  if (window.QRCode && typeof QRCode.toCanvas === 'function') {
   …
} else {
   await simpleQR.canvas(…);
}
```)  
is exactly what’s causing the “fake QR” fallback.  

You should **replace that entire `if … else …` section with a strict version that only draws using the real QR library**.

Here’s the safe replacement:

```js
// 5) draw using the proper qrcode lib only
if (!window.QRCode || typeof QRCode.toCanvas !== 'function') {
  throw new Error('QR library not loaded');
}

await new Promise((resolve, reject) => {
  QRCode.toCanvas(
    qrCanvas,
    shortUrl.trim(),
    {
      width: 260,
      margin: 4,                 // bigger quiet zone for scanning reliability
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' }
    },
    err => err ? reject(err) : resolve()
  );
});

// optional: keep pixels sharp
const ctx = qrCanvas.getContext('2d');
if (ctx) ctx.imageSmoothingEnabled = false;
  /* ===== ICE ===== */
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
           <input type="tel" class="icePhone" data-field="phone" data-idx="${idx}" value="${c.phone||''}" placeholder="+44 7700 900000">
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

  /* ===== Profile & Health ===== */
  function upsertProfileSmart(rowBase){
    return getUserId().then(uid=>{
      if (!uid) return;
      return ensureShortCode().then(code=>{
        const snake={ user_id:uid, code, full_name:rowBase.full_name, date_of_birth:rowBase.date_of_birth, country:rowBase.country, national_id:rowBase.national_id };
        const camel={ user_id:uid, code, fullName:rowBase.full_name, dob:rowBase.date_of_birth, country:rowBase.country, healthId:rowBase.national_id };
        return supabase.from('profiles').upsert(snake,{onConflict:'user_id'}).then(r1=>{
          if (!r1.error) return;
          return supabase.from('profiles').upsert(camel,{onConflict:'user_id'}).then(r2=>{ if (r2.error) throw r2.error; });
        });
      });
    });
  }

  function saveProfile(){
    const profile={
      full_name:     $('profileFullName')?.value.trim() || '',
      date_of_birth: $('profileDob') ? normalizeDOB($('profileDob').value.trim()) : '',
      country:       $('profileCountry')?.value.trim() || '',
      national_id:   $('profileHealthId')?.value.trim() || ''
    };
    userData.profile=profile; window.userData=userData;
    localStorage.setItem('myqer_profile', JSON.stringify(profile));

    if (!isSupabaseAvailable){ toast('Saved locally (offline mode)','info'); generateQRCode(); return; }

    supabase.auth.getSession().then(r=>{
      const session=r?.data?.session || null;
      if (!session){ toast('Saved locally — please sign in to sync','info'); generateQRCode(); return; }
      upsertProfileSmart(profile).then(()=>{ toast('Profile saved','success'); generateQRCode(); }).catch(e=>{ console.error(e); toast('Error saving profile','error'); });
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

  /* ===== load (local first, then server) ===== */
  function fillFromLocal(){
    try{
      const lp=localStorage.getItem('myqer_profile'); if (lp) userData.profile=JSON.parse(lp)||{};
      window.userData=userData;
      const p=userData.profile; const set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
      set('profileFullName', p.full_name ?? p.fullName);
      set('profileDob',      p.date_of_birth ?? p.dob);
      set('profileCountry',  p.country);
      set('profileHealthId', p.national_id ?? p.healthId);

      const lh = localStorage.getItem('myqer_health');
      if (lh) {
        try {
          const raw = JSON.parse(lh) || {};
          userData.health = {
            bloodType:      raw.bloodType      ?? raw.blood_type,
            allergies:      raw.allergies      ?? raw.allergy_list,
            conditions:     raw.conditions     ?? raw.medical_conditions,
            medications:    raw.medications    ?? raw.meds,
            implants:       raw.implants       ?? raw.implants_devices,
            organDonor:     raw.organDonor     ?? raw.organ_donor,
            triageOverride: raw.triageOverride ?? raw.triage_override
          };
        } catch (_) { userData.health = {}; }
      }
      const h = userData.health;
      set('hfBloodType',  h.bloodType);
      set('hfAllergies',  h.allergies);
      set('hfConditions', h.conditions);
      set('hfMeds',       h.medications);
      set('hfImplants',   h.implants);
      if ($('hfDonor')) $('hfDonor').checked = !!h.organDonor;
      if ($('triageOverride')) $('triageOverride').value = h.triageOverride || 'auto';
      calculateTriage();

      const li=localStorage.getItem('myqer_ice'); iceContacts=li ? (JSON.parse(li)||[]) : []; window.iceContacts=iceContacts; renderIceContacts();
    }catch(e){ console.warn('Local fill failed', e); }
  }

  function loadFromServer(){
    if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
    return withTimeout(supabase.auth.getSession(),3000,'getSession').then(res=>{
      if (!res.data?.session) return;
      return withTimeout(getUserId(),3000,'getUserId').then(uid=>{
        if (!uid) return;

        return withTimeout(supabase.from('profiles').select('*').eq('user_id',uid).maybeSingle(),4000,'profiles.select').then(rp=>{
          const prof=rp?.data||null;
          if (prof){
            userData.profile=Object.assign({}, userData.profile, prof);
            window.userData=userData;
            localStorage.setItem('myqer_profile', JSON.stringify(userData.profile));
            const p=userData.profile; const set=(id,v)=>{ const el=$(id); if (el) el.value=v||''; };
            set('profileFullName', p.full_name ?? p.fullName);
            set('profileDob',      p.date_of_birth ?? p.dob);
            set('profileCountry',  p.country);
            set('profileHealthId', p.national_id ?? p.healthId);
          }
        }).then(()=>{
          return withTimeout(supabase.from('health_data').select('*').eq('user_id', uid).maybeSingle(),4000,'health_data.select')
            .then((rh) => {
              const raw = rh?.data || null; if (!raw) return;
              const norm = {
                bloodType:      raw.bloodType      ?? raw.blood_type,
                allergies:      raw.allergies      ?? raw.allergy_list,
                conditions:     raw.conditions     ?? raw.medical_conditions,
                medications:    raw.medications    ?? raw.meds,
                implants:       raw.implants       ?? raw.implants_devices,
                organDonor:     raw.organDonor     ?? raw.organ_donor,
                triageOverride: raw.triageOverride ?? raw.triage_override
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

  /* ===== buttons ===== */
  function wireQRButtons(){
    on($('copyLink'),'click',()=>{ const url=$('cardUrl')?.value?.trim()||''; if(!url) return toast('No link to copy','error'); navigator.clipboard.writeText(url).then(()=>toast('Link copied','success')).catch(()=>toast('Copy failed','error')); });
    on($('openLink'),'click',()=>{ const url=$('cardUrl')?.value?.trim()||''; if(!url) return toast('No link to open','error'); window.open(url,'_blank','noopener'); });
    on($('dlPNG'),'click',()=>{ const c=$('qrCanvas'); if(!c||c.style.display==='none') return toast('Generate QR first','error'); const a=document.createElement('a'); a.download='myqer-emergency-qr.png'; a.href=c.toDataURL('image/png'); a.click(); toast('PNG downloaded','success'); });
    on($('dlSVG'),'click',()=>{ const url=$('cardUrl')?.value?.trim()||''; if(!url) return toast('Generate QR first','error'); const out=simpleQR.svg(url,260,4); const blob=new Blob([out.svg],{type:'image/svg+xml'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='myqer-emergency-qr.svg'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('SVG downloaded','success'); });
    on($('printQR'),'click',()=>{ const canvas=$('qrCanvas'); const code=$('codeUnderQR')?.textContent||''; if(!canvas||canvas.style.display==='none'||!code) return toast('Generate QR first','error'); const dataUrl=canvas.toDataURL('image/png'); const w=window.open('','_blank','noopener'); if(!w) return toast('Pop-up blocked','error'); w.document.write(`<html><head><title>MYQER Emergency Card - ${code}</title><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;text-align:center;padding:2rem}.code{font-weight:700;letter-spacing:.06em}img{width:300px;height:300px;image-rendering:pixelated}@media print{@page{size:auto;margin:12mm}}</style></head><body><h1>MYQER™ Emergency Card</h1><p class="code">Code: ${code}</p><img alt="QR Code" src="${dataUrl}"><p>Scan this QR code for emergency information</p><p style="font-size:.8em;color:#666">www.myqer.com</p><script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script></body></html>`); w.document.close(); });
    on($('copyOffline'),'click',()=>{ const t=$('offlineText')?.value||''; if(!t.trim()) return toast('No offline text to copy','error'); navigator.clipboard.writeText(t).then(()=>toast('Offline text copied','success')).catch(()=>toast('Copy failed','error')); });
    on($('dlOffline'),'click',()=>{ const t=$('offlineText')?.value||''; if(!t.trim()) return toast('No offline text to download','error'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([t],{type:'text/plain'})); a.download='myqer-offline.txt'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Offline text downloaded','success'); });
  }

  /* ===== delete / logout ===== */
  function deleteAccount(){
    const phrase=($('deletePhrase')?.value||'').trim().toUpperCase();
    if (phrase!=='DELETE MY ACCOUNT') return toast('Type the phrase exactly','error');
    if (!confirm('Are you sure? This permanently deletes your data.')) return;
    (function(){
      if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
      return getUserId().then(uid=>{
        if (!uid) return;
        return supabase.from('ice_contacts').delete().eq('user_id',uid)
          .then(()=>supabase.from('health_data').delete().eq('user_id',uid))
          .then(()=>supabase.from('profiles').delete().eq('user_id',uid));
      });
    })().then(()=>{ try{ localStorage.clear(); sessionStorage.clear(); }catch{} location.href='index.html'; })
      .catch(e=>{ console.error(e); toast('Delete failed','error'); });
  }

  /* ===== autosave ===== */
  function setupAutoSave(id, fn, delay=600) {
    const el = $(id);
    if (!el) return;
    function run() {
      clearTimeout(autoSaveTimers[id]);
      autoSaveTimers[id] = setTimeout(() => { Promise.resolve(fn()).catch(e => console.warn('autosave err', e)); }, delay);
    }
    el.addEventListener('input',  run);
    el.addEventListener('change', run);
  }

  /* ===== DOM ready ===== */
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
    generateQRCode();
    loadFromServer().then(()=> generateQRCode());

    const loading=$('loadingState'); if (loading) loading.style.display='none';
    setTimeout(()=>{ const l=$('loadingState'); if (l) l.style.display='none'; }, 4000);
  });

  window.addEventListener('error', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });
  window.addEventListener('unhandledrejection', ()=>{ const el=$('loadingState'); if (el) el.style.display='none'; });

  // keep the worker warm
  setInterval(()=>{ try{ navigator.sendBeacon?.('/ping',''); }catch{} }, 120000);
})();
