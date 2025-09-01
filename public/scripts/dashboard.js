/* MYQER Dashboard app — single include, no inline <script> needed */
(() => {
  'use strict';

  // ====== PATHS (edit this if your login path is different) ======
  const LOGIN_PATH = '/index.html';   // e.g. '/index.html' or '/login'

  // ====== Supabase config (safe to inline; matches your earlier setup) ======
  const SUPABASE_URL = 'https://tgddpmxpbgrzrbzpomou.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZGRwbXhwYmdyenJienBvbW91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNDgxMTMsImV4cCI6MjA3MTYyNDExM30.uXntx0rZISv927MQAG1LgGKA-lA08hSkzXMre7Bk2QM';

  // libs from CDN already on the page:
  // - window.supabase (v2)
  // - window.QRCode

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // ====== tiny helpers ======
  const $ = (sel) => document.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const escapeHtml = (s='') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[c]));
  const toast = (msg) => { const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); clearTimeout(t._tmr); t._tmr=setTimeout(()=>t.classList.remove('show'),1800); };

  // ====== state ======
  let booted=false;
  let currentUser=null;
  let profile=null;            // row from profiles
  let health=null;             // row from health_profiles
  let contacts=[];             // rows from ice_contacts
  const saveTimers={identity:null, health:null};
  const QR_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let qrBusy=false;

  // ====== auth guard (STOP redirect loop) ======
  async function boot(){
    if(booted) return; booted=true;

    const net = () => {
      $('#netDot')?.classList?.remove('bg-gray-400','bg-green-500','animate-pulse');
      if (navigator.onLine) $('#netDot')?.classList?.add('bg-green-500','animate-pulse');
      else $('#netDot')?.classList?.add('bg-gray-400');
      if ($('#netLabel')) $('#netLabel').textContent = navigator.onLine ? 'Online' : 'Offline';
    };
    window.addEventListener('online', net); window.addEventListener('offline', net); net();

    const { data:{ session } } = await supabase.auth.getSession();
    if(!session?.user){ location.replace(LOGIN_PATH); return; }
    currentUser = session.user;

    wireEvents();
    await loadAll();
    await initQrCard();
    updateTriage();
    updateProgress();
  }
  document.addEventListener('DOMContentLoaded', boot);

  // Redirect only when SIGNED_OUT. Do NOT redirect on SIGNED_IN here.
  supabase.auth.onAuthStateChange((event/*, session*/)=>{
    if(event==='SIGNED_OUT') location.replace(LOGIN_PATH);
  });

  // ====== loading ======
  async function loadAll(){
    const [pRes,hRes,cRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
      supabase.from('health_profiles').select('*').eq('user_id', currentUser.id).maybeSingle(),
      supabase.from('ice_contacts').select('*').eq('user_id', currentUser.id).order('created_at',{ascending:true})
    ]);
    profile = pRes.error ? { id: currentUser.id } : (pRes.data || { id: currentUser.id });
    health  = hRes.error ? { user_id: currentUser.id } : (hRes.data || { user_id: currentUser.id });
    contacts= cRes.error ? [] : (cRes.data || []);

    hydrateIdentity();
    hydrateHealth();
    renderContacts();
  }

  // ====== identity ======
  function hydrateIdentity(){
    $('#full_name')?.value         = profile?.full_name || '';
    $('#date_of_birth')?.value     = profile?.date_of_birth || '';
    $('#country')?.value           = profile?.country || '';
    $('#national_health_id')?.value= profile?.national_health_id || '';
  }
  function debounced(key, fn, ms){ clearTimeout(saveTimers[key]); saveTimers[key]=setTimeout(fn, ms); }
  async function identitySave(){
    const patch = {
      id: currentUser.id,
      full_name: $('#full_name')?.value?.trim() || null,
      date_of_birth: $('#date_of_birth')?.value?.trim() || null,
      country: $('#country')?.value || null,
      national_health_id: $('#national_health_id')?.value?.trim() || null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('profiles').upsert(patch, { onConflict:'id' }).select().maybeSingle();
    if (error){ console.warn(error); toast('Network error'); return; }
    profile = data || patch;
    toast('Identity saved'); updateProgress();
  }

  // ====== health ======
  function hydrateHealth(){
    const hp = health || {};
    $('#blood_type')?.value = hp.blood_type || '';
    $('#organ_donor')?.value = (hp.organ_donor===true?'yes':hp.organ_donor===false?'no':(hp.organ_donor===null?'':(hp.organ_donor||'')));
    $('#life_support_pref')?.value = hp.life_support_pref || '';
    hydratePills('allergiesPills', hp.allergies);
    hydratePills('conditionsPills', hp.conditions);
    hydratePills('medicationsPills', hp.medications);
  }
  function hydratePills(containerId, csv){
    const box=document.getElementById(containerId); if(!box) return;
    box.innerHTML='';
    (csv?String(csv).split(','):[]).map(s=>s.trim()).filter(Boolean)
      .forEach(val=> box.appendChild(makePill(val, containerId)));
  }
  function makePill(text, containerId){
    const span=document.createElement('span');
    span.className='tag';
    span.innerHTML=`<span>${escapeHtml(text)}</span><button aria-label="Remove">×</button>`;
    span.querySelector('button').addEventListener('click', async ()=>{ span.remove(); await saveHealthPills(containerId); });
    return span;
  }
  function pillKey(e, kind){
    if(e.key!=='Enter') return; e.preventDefault();
    addPillFromText((e.target.value||'').trim(), kind); e.target.value='';
  }
  function addBlurToPills(e, kind){
    const v=(e.target.value||'').trim(); if(!v) return;
    addPillFromText(v, kind); e.target.value='';
  }
  function addPillFromText(raw, kind){
    const map={allergies:'allergiesPills', conditions:'conditionsPills', medications:'medicationsPills'};
    const cont=document.getElementById(map[kind]); if(!cont) return;
    raw.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).forEach(tok => cont.appendChild(makePill(tok, cont.id)));
    saveHealthPills(cont.id);
  }
  async function saveHealthPills(containerId){
    const vals=Array.from(document.getElementById(containerId).querySelectorAll('.tag span:first-child'))
      .map(n=>n.textContent.trim()).filter(Boolean);
    const csv = Array.from(new Set(vals.map(v=>v.toLowerCase()))).join(', ') || null;
    const patch={};
    if(containerId==='allergiesPills')  patch.allergies=csv;
    if(containerId==='conditionsPills') patch.conditions=csv;
    if(containerId==='medicationsPills')patch.medications=csv;
    await upsertHealth(patch);
    toast('Health saved'); updateTriage(); updateProgress();
  }
  async function saveHealthFields(){
    const organVal=$('#organ_donor')?.value;
    await upsertHealth({
      blood_type: $('#blood_type')?.value || null,
      organ_donor: (organVal==='yes'?true:organVal==='no'?false:null),
      life_support_pref: $('#life_support_pref')?.value || null
    });
    toast('Health saved'); updateTriage(); updateProgress();
  }
  async function upsertHealth(patch){
    health = {...(health||{}), ...patch};
    const payload={
      user_id: currentUser.id,
      blood_type: health.blood_type ?? null,
      organ_donor: (health.organ_donor ?? null),
      life_support_pref: health.life_support_pref ?? null,
      allergies: health.allergies ?? null,
      conditions: health.conditions ?? null,
      medications: health.medications ?? null,
      triage_override: health.triage_override ?? null,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('health_profiles').upsert(payload, { onConflict:'user_id' });
    if (error) console.warn(error);
  }

  // ====== triage ======
  function computeTriage(){
    const hp=health||{};
    if (hp.triage_override && hp.triage_override!=='auto') return hp.triage_override;
    if ((hp.life_support_pref||'').toUpperCase()==='DNR') return 'Black';
    const a=(hp.allergies||'').toLowerCase();
    const c=(hp.conditions||'').toLowerCase();
    const m=(hp.medications||'').toLowerCase();
    const redAllergy=['anaphylaxis','epipen','penicillin','amoxicillin','codeine','morphine','peanut','shellfish','bee sting'];
    if (redAllergy.some(w=>a.includes(w))) return 'Red';
    const redCond=['heart attack','myocard','mi ','stroke','seizure','status epilepticus','cancer','copd severe','oxygen dependent','dialysis'];
    if (redCond.some(w=>c.includes(w))) return 'Red';
    const any=[a,c,m].some(s=>s.trim());
    const medsCount=(m?m.split(',').map(s=>s.trim()).filter(Boolean).length:0);
    if (any || medsCount>=3) return 'Amber';
    return 'Green';
  }
  function updateTriage(){
    const badge=$('#triageBadge'); if(!badge) return;
    const color=computeTriage();
    const map={Green:['bg-green-600','Green — Stable','🟢'], Amber:['bg-amber-500','Amber — Urgent','🟡'], Red:['bg-red-600','Red — Immediate','🔴'], Black:['bg-gray-900','Black — Comfort Care','⚫']};
    const [bg,label,icon]=map[color]||map.Green;
    badge.className=`inline-flex items-center px-6 py-3 rounded-full text-white text-lg font-bold ${bg}`;
    badge.innerHTML=`${icon} <span class="ml-2">${label}</span>`;
    const sel=$('#triage_override'); if (sel) sel.value = health?.triage_override ? health.triage_override : 'auto';
  }

  // ====== contacts ======
  function renderContacts(){
    const list=$('#contactsList'); if(!list) return;
    list.innerHTML='';
    if(!contacts.length) $('#noContacts')?.classList.remove('hidden'); else $('#noContacts')?.classList.add('hidden');
    contacts.forEach(c=>{
      const row=document.createElement('div');
      row.className='border rounded-xl p-4';
      row.innerHTML=`
        <div class="grid grid-cols-12 gap-3 items-center">
          <input class="col-span-3 border rounded-lg px-3 py-2" data-field="name" data-id="${c.id}" placeholder="Name*" value="${escapeHtml(c.name||'')}">
          <input class="col-span-2 border rounded-lg px-3 py-2" data-field="relationship" data-id="${c.id}" placeholder="Relationship" value="${escapeHtml(c.relationship||'')}">
          <input class="col-span-3 border rounded-lg px-3 py-2" data-field="phone" data-id="${c.id}" placeholder="Phone*" value="${escapeHtml(c.phone||'')}">
          <input class="col-span-3 border rounded-lg px-3 py-2" data-field="email" data-id="${c.id}" placeholder="Email" value="${escapeHtml(c.email||'')}">
          <button class="col-span-1 text-red-600 border rounded-lg px-3 py-2" data-del="${c.id}">Delete</button>
          <textarea class="col-span-12 mt-2 border rounded-lg px-3 py-2" data-field="notes" data-id="${c.id}" rows="2" placeholder="Notes">${escapeHtml(c.notes||'')}</textarea>
        </div>`;
      list.appendChild(row);
    });
    $('#contactsCounter')?.textContent=`${contacts.length} of 5 added`;
  }
  async function createBlankContact(){
    if(contacts.length>=5){ toast('Max 5 contacts'); return; }
    const { data, error } = await supabase.from('ice_contacts').insert({
      user_id: currentUser.id, name:'', relationship:'', phone:'', email:'', notes:''
    }).select().single();
    if (error){ toast('Network error'); return; }
    contacts.push(data); renderContacts(); updateProgress();
  }
  let iceTimer=null;
  async function handleIceListEvent(e){
    const del=e.target.closest('[data-del]');
    if(del){
      const id=Number(del.getAttribute('data-del')); del.disabled=true;
      try{
        await supabase.from('ice_contacts').delete().eq('id', id).eq('user_id', currentUser.id);
        contacts=contacts.filter(c=>c.id!==id); renderContacts(); toast('Contact deleted'); updateProgress();
      } finally { del.disabled=false; }
      return;
    }
    const el=e.target, id=Number(el.getAttribute('data-id')), field=el.getAttribute('data-field');
    if(!id||!field) return;
    const row=contacts.find(c=>c.id===id); if(!row) return;
    row[field]=el.value;
    clearTimeout(iceTimer);
    iceTimer=setTimeout(async ()=>{
      if(!row.name?.trim()||!row.phone?.trim()){ toast('Name and phone are required'); return; }
      await supabase.from('ice_contacts').update({
        name:row.name, relationship:row.relationship||'', phone:row.phone, email:row.email||'', notes:row.notes||''
      }).eq('id', id).eq('user_id', currentUser.id);
      toast('Contact saved'); updateProgress();
    }, 400);
  }

  // ====== QR (single permanent) ======
  async function initQrCard(){
    if(profile?.code){
      renderQR(profile.code);
      enableQrButtons(true);
      $('#shareLink') && ($('#shareLink').value = `${location.origin}/c/${profile.code}`);
    } else {
      enableQrButtons(false);
      $('#shareLink') && ($('#shareLink').value = '');
      $('#qrBox') && ($('#qrBox').innerHTML='');
    }
  }
  async function onGenerateQR(){
    if(qrBusy) return;
    if(profile?.code){ toast('Code already assigned'); return; }
    qrBusy=true; $('#generateQR') && ($('#generateQR').disabled=true);
    try{
      const code=await makeUniqueCode(6);
      const { data, error } = await supabase.from('profiles').update({ code }).eq('id', currentUser.id).select().maybeSingle();
      if(error) throw error;
      profile = data || { ...(profile||{}), code };
      renderQR(code);
      $('#shareLink') && ($('#shareLink').value = `${location.origin}/c/${code}`);
      enableQrButtons(true);
      toast('QR generated'); updateProgress();
    } catch(e){ console.warn(e); toast('Network error'); }
    finally { qrBusy=false; $('#generateQR') && ($('#generateQR').disabled=false); }
  }
  async function makeUniqueCode(len=6, tries=10){
    for(let i=0;i<tries;i++){
      const code = Array.from({length:len},()=>QR_ALPHABET[Math.floor(Math.random()*QR_ALPHABET.length)]).join('');
      const { data, error } = await supabase.from('profiles').select('id').eq('code', code).maybeSingle();
      if(error) throw error;
      if(!data) return code;
    }
    return crypto.randomUUID().slice(0,len).toUpperCase().replace(/[^A-Z0-9]/g,'X');
  }
  function renderQR(code){
    const box=$('#qrBox'); if(!box) return;
    box.innerHTML=''; const canvas=document.createElement('canvas'); canvas.id='qrCanvas'; box.appendChild(canvas);
    const url=`${location.origin}/c/${code}`;
    window.QRCode.toCanvas(canvas, url, { width: Math.max(220, box.clientWidth-8), margin:1, color:{dark:'#111', light:'#fff'} });
  }
  function enableQrButtons(on){ ['#exportPNG','#printQR','#copyLink'].forEach(sel=>{ const b=$(sel); if(b) b.disabled=!on; }); }
  function copyShareLink(){
    const v=$('#shareLink')?.value; if(!v) return;
    if(navigator.clipboard?.writeText) navigator.clipboard.writeText(v).then(()=>toast('Link copied'));
    else { const t=document.createElement('input'); t.value=v; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Link copied'); }
  }
  function exportQrPng(){ const cv=document.getElementById('qrCanvas'); if(!cv) return; const a=document.createElement('a'); a.href=cv.toDataURL('image/png'); a.download=(profile?.code||'myqer')+'.png'; a.click(); }

  // ====== Danger Zone ======
  async function doDeleteAccount(){
    if($('#confirmDelete')?.value?.trim().toUpperCase()!=='DELETE') return;
    try{
      $('#deleteAccount') && ($('#deleteAccount').disabled=true);
      await supabase.from('ice_contacts').delete().eq('user_id', currentUser.id);
      await supabase.from('health_profiles').delete().eq('user_id', currentUser.id);
      await supabase.from('profiles').delete().eq('id', currentUser.id);
      await supabase.auth.signOut();
    } catch(e){ console.error(e); toast('Network error'); }
    finally { location.replace(LOGIN_PATH); }
  }

  // ====== progress ======
  function updateProgress(){
    const iOK = !!(profile?.full_name && profile?.date_of_birth && profile?.country);
    const hp = health || {};
    const hOK = !!( hp.blood_type || hp.life_support_pref ||
                    (hp.allergies&&hp.allergies.trim()) || (hp.conditions&&hp.conditions.trim()) || (hp.medications&&hp.medications.trim()) );
    const cOK = (contacts||[]).length>0;
    const qOK = !!profile?.code;

    $('#iconIdentity')?.classList?.add(iOK?'bg-green-600':'bg-amber-500');
    $('#iconHealth')?.classList?.add(hOK?'bg-green-600':'bg-amber-500');

    $('#chkIdentity') && ($('#chkIdentity').className = iOK?'font-bold text-green-600':'font-bold text-amber-600');
    $('#chkHealth')   && ($('#chkHealth').className   = hOK?'font-bold text-green-600':'font-bold text-amber-600');
    $('#chkContacts') && ($('#chkContacts').className = cOK?'font-bold text-green-600':'font-bold text-amber-600');
    $('#chkQR')       && ($('#chkQR').className       = qOK?'font-bold text-green-600':'font-bold text-amber-600');

    const pct=Math.round([iOK,hOK,cOK,qOK].filter(Boolean).length/4*100);
    $('#progressPct') && ($('#progressPct').textContent=pct+'%');
    $('#progressArc') && ($('#progressArc').setAttribute('stroke-dasharray', `${pct},100`));
  }

  // ====== wire UI ======
  function wireEvents(){
    on($('#logoutBtn'),'click', async ()=>{ try{ await supabase.auth.signOut(); }catch{} });

    ['#full_name','#date_of_birth','#national_health_id'].forEach(sel=>{
      on($(sel),'input', ()=>debounced('identity', identitySave, 700));
      on($(sel),'blur',  ()=>debounced('identity', identitySave, 50));
    });
    on($('#country'),'change', identitySave);

    ['#blood_type','#organ_donor','#life_support_pref'].forEach(sel=>{
      on($(sel),'change', saveHealthFields);
    });

    on($('#allergiesInput'),'keydown', e=>pillKey(e,'allergies'));
    on($('#conditionsInput'),'keydown', e=>pillKey(e,'conditions'));
    on($('#medicationsInput'),'keydown', e=>pillKey(e,'medications'));
    on($('#allergiesInput'),'blur', e=>addBlurToPills(e,'allergies'));
    on($('#conditionsInput'),'blur', e=>addBlurToPills(e,'conditions'));
    on($('#medicationsInput'),'blur', e=>addBlurToPills(e,'medications'));

    on($('#triage_override'),'change', async ()=>{
      const v=$('#triage_override')?.value || 'auto';
      health = health || { user_id: currentUser.id };
      health.triage_override = (v==='auto'?null:v);
      await upsertHealth({ triage_override: health.triage_override });
      updateTriage();
    });

    on($('#addContact'),'click', createBlankContact);
    on($('#contactsList'),'input', handleIceListEvent);
    on($('#contactsList'),'change', handleIceListEvent);
    on($('#contactsList'),'click', handleIceListEvent);

    on($('#generateQR'),'click', onGenerateQR);
    on($('#copyLink'),'click', copyShareLink);
    on($('#exportPNG'),'click', exportQrPng);
    on($('#printQR'),'click', ()=>{ const u=$('#shareLink')?.value; if(u) window.open(u,'_blank'); });

    on($('#confirmDelete'),'input', ()=>{ $('#deleteAccount').disabled = ($('#confirmDelete').value.trim().toUpperCase()!=='DELETE'); });
    on($('#deleteAccount'),'click', doDeleteAccount);
  }

})();
