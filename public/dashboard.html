<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>MYQER™ Dashboard</title>

  <!-- libs -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>

  <style>
    :root{--brand:#dc2626}
    body{font-family:ui-sans-serif,system-ui,Inter,Segoe UI,Roboto,Helvetica,Arial}
    .glass{background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border:1px solid rgba(0,0,0,.06);box-shadow:0 10px 30px rgba(0,0,0,.06)}
    .btn{display:inline-flex;align-items:center;justify-content:center;font-weight:700;border-radius:.75rem;padding:.6rem 1rem}
    .btn-primary{background:var(--brand);color:#fff}
    .btn[disabled]{opacity:.5;cursor:not-allowed}
    .tag{display:inline-flex;align-items:center;gap:.25rem;background:#e5e7eb;color:#111;padding:.25rem .5rem;border-radius:999px;font-size:.825rem}
    .toast{position:fixed;top:16px;right:16px;z-index:1000;background:#111;color:#fff;padding:.6rem .9rem;border-radius:.5rem;opacity:0;transform:translateY(-8px);transition:.25s}
    .toast.show{opacity:1;transform:none}
  </style>
</head>
<body class="min-h-screen bg-white">
  <!-- toast -->
  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <!-- header -->
  <header class="border-b">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="text-2xl font-extrabold">MYQ<span class="text-red-600">ER</span>™</div>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2 text-sm">
          <span id="netDot" class="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
          <span id="netLabel">Online</span>
        </div>
        <button id="logoutBtn" class="text-sm font-semibold hover:text-red-600">Logout</button>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-6 py-6 space-y-6">

    <!-- completion -->
    <section class="glass rounded-2xl p-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">Profile Completion</h2>
        <p class="text-gray-600">Complete your emergency profile.</p>
      </div>
      <div class="flex items-center gap-6">
        <div class="relative w-20 h-20">
          <svg class="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" stroke-width="3"/>
            <path id="progressArc" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#dc2626" stroke-width="3" stroke-dasharray="0,100"/>
          </svg>
          <div class="absolute inset-0 grid place-items-center"><span id="progressPct" class="text-xl font-bold">0%</span></div>
        </div>
        <ul class="text-sm space-y-1">
          <li><span id="chkIdentity" class="font-bold text-amber-600">○</span> Identity</li>
          <li><span id="chkHealth" class="font-bold text-amber-600">○</span> Health</li>
          <li><span id="chkContacts" class="font-bold text-amber-600">○</span> ICE</li>
          <li><span id="chkQR" class="font-bold text-amber-600">○</span> QR</li>
        </ul>
      </div>
    </section>

    <!-- identity + health -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- identity -->
      <div class="glass rounded-2xl p-6 border-l-4 border-green-500">
        <div class="flex items-start justify-between mb-6">
          <div>
            <h3 class="text-xl font-bold">Identity Information</h3>
            <p class="text-gray-600 text-sm">Helps first responders confirm who you are.</p>
          </div>
          <div id="iconIdentity" class="w-8 h-8 rounded-full grid place-items-center bg-amber-500 text-white">○</div>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Full Legal Name *</label>
            <input id="full_name" class="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-600" placeholder="Jane Doe"></div>
          <div><label class="block text-sm font-medium mb-1">Date of Birth *</label>
            <input id="date_of_birth" class="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-600" placeholder="DD/MM/YYYY">
            <p class="text-xs text-gray-500 mt-1">Format: DD/MM/YYYY</p></div>
          <div><label class="block text-sm font-medium mb-1">Country of Residence *</label>
            <select id="country" class="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-600">
              <option value="">Select your country</option>
              <option value="GB">🇬🇧 United Kingdom</option><option value="US">🇺🇸 United States</option>
              <option value="CA">🇨🇦 Canada</option><option value="DE">🇩🇪 Germany</option>
              <option value="FR">🇫🇷 France</option><option value="ES">🇪🇸 Spain</option>
              <option value="IT">🇮🇹 Italy</option><option value="IN">🇮🇳 India</option>
              <option value="CN">🇨🇳 China</option><option value="AU">🇦🇺 Australia</option>
            </select></div>
          <div><label class="block text-sm font-medium mb-1">National Health ID</label>
            <input id="national_health_id" class="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-600" placeholder="NHS Number, SSN, etc.">
            <p class="text-xs text-gray-500 mt-1">Stored privately. Not shown on your public card.</p></div>
        </div>
      </div>

      <!-- health -->
      <div class="glass rounded-2xl p-6 border-l-4 border-red-500">
        <div class="flex items-start justify-between mb-6">
          <div>
            <h3 class="text-xl font-bold">Health Profile</h3>
            <p class="text-gray-600 text-sm">Appears on your emergency card. Keep accurate.</p>
          </div>
          <div id="iconHealth" class="w-8 h-8 rounded-full grid place-items-center bg-amber-500 text-white">○</div>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Blood Type</label>
            <select id="blood_type" class="w-full border rounded-lg px-4 py-3">
              <option value="">Select blood type</option>
              <option>A+</option><option>A-</option><option>B+</option><option>B-</option>
              <option>AB+</option><option>AB-</option><option>O+</option><option>O-</option>
              <option>Unknown</option>
            </select></div>
          <div><label class="block text-sm font-medium mb-1">Organ Donor Status</label>
            <select id="organ_donor" class="w-full border rounded-lg px-4 py-3">
              <option value="">Select status</option>
              <option value="yes">Yes (Registered)</option>
              <option value="no">No (Not a donor)</option>
              <option value="unspecified">Not specified</option>
            </select></div>
          <div><label class="block text-sm font-medium mb-1">Life Support Preference</label>
            <select id="life_support_pref" class="w-full border rounded-lg px-4 py-3">
              <option value="">Select preference</option>
              <option value="Full">Full Life Support</option>
              <option value="Limited">Limited</option>
              <option value="Comfort">Comfort Care Only</option>
              <option value="DNR">DNR</option>
            </select></div>

          <!-- pills -->
          <div>
            <label class="block text-sm font-semibold">Critical Allergies ⚠️</label>
            <div id="allergiesPills" class="flex flex-wrap gap-2 my-2"></div>
            <input id="allergiesInput" class="w-full border rounded-lg px-4 py-3" placeholder="Type allergy and press Enter"/>
          </div>
          <div>
            <label class="block text-sm font-semibold">Medical Conditions</label>
            <div id="conditionsPills" class="flex flex-wrap gap-2 my-2"></div>
            <input id="conditionsInput" class="w-full border rounded-lg px-4 py-3" placeholder="Type condition and press Enter"/>
          </div>
          <div>
            <label class="block text-sm font-semibold">Medications</label>
            <div id="medicationsPills" class="flex flex-wrap gap-2 my-2"></div>
            <input id="medicationsInput" class="w-full border rounded-lg px-4 py-3" placeholder="Type medication and press Enter"/>
          </div>
        </div>
      </div>
    </section>

    <!-- triage -->
    <section class="glass rounded-2xl p-6 border-l-4 border-amber-500">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 class="text-xl font-bold">Triage</h3>
          <p class="text-gray-600 text-sm">Auto-computed from your data. You can override.</p>
          <p class="text-xs text-gray-500 mt-1">MYQER does not diagnose or provide medical advice. This triage label is user-provided and assistive only for responders.</p>
        </div>
        <div id="triageBadge" class="inline-flex items-center px-6 py-3 rounded-full text-white text-lg font-bold bg-green-600">
          🟢 <span class="ml-2">Green — Stable</span>
        </div>
      </div>
      <div class="mt-4 max-w-sm">
        <label class="block text-sm font-medium mb-1">Override</label>
        <select id="triage_override" class="w-full border rounded-lg px-4 py-3">
          <option value="auto">Auto (recommended)</option>
          <option value="Green">Green — Stable</option>
          <option value="Amber">Amber — Urgent</option>
          <option value="Red">Red — Immediate</option>
          <option value="Black">Black — Comfort Care</option>
        </select>
      </div>
    </section>

    <!-- ICE + QR -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- ICE -->
      <div class="glass rounded-2xl p-6 border-l-4 border-purple-500">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-xl font-bold">ICE Contacts</h3>
            <p class="text-gray-600 text-sm"><span id="contactsCounter">0</span> of 5 added</p>
          </div>
          <button id="addContact" class="btn btn-primary">Add Contact</button>
        </div>
        <div id="contactsList" class="space-y-3"></div>
        <div id="noContacts" class="text-sm text-gray-500">Add people you trust. Name and phone are required.</div>
      </div>

      <!-- QR -->
      <div class="glass rounded-2xl p-6 border-l-4 border-gray-800">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold">Your QR Code</h3>
          <button id="generateQR" class="btn btn-primary">Generate</button>
        </div>
        <p class="text-gray-600 text-sm mb-3">Single, permanent code for your public emergency card.</p>
        <div id="qrBox" class="border rounded-xl h-52 grid place-items-center mb-3 overflow-hidden bg-white"></div>

        <div class="flex items-center gap-2 mb-3">
          <input id="shareLink" class="flex-1 border rounded-lg px-3 py-2 text-sm" readonly placeholder="Share link"/>
          <button id="copyLink" class="px-3 py-2 border rounded-lg text-sm" disabled>Copy</button>
        </div>
        <div class="flex items-center gap-2">
          <button id="exportPNG" class="px-3 py-2 border rounded-lg text-sm" disabled>Export PNG</button>
          <button id="printQR" class="px-3 py-2 border rounded-lg text-sm" disabled>Print</button>
        </div>
      </div>
    </section>

    <!-- danger zone -->
    <section class="glass rounded-2xl p-8 border border-red-200 text-center">
      <h3 class="text-xl font-bold mb-2 text-red-700">Danger Zone</h3>
      <p class="text-gray-700 mb-4">This will delete your profile, health data, contacts, and disable your QR.</p>
      <div class="max-w-sm mx-auto">
        <input id="confirmDelete" class="w-full border rounded-lg px-4 py-3 mb-3" placeholder='Type "DELETE" to confirm'/>
        <button id="deleteAccount" class="btn btn-primary w-full" disabled>Delete Account</button>
      </div>
    </section>

  </main>

  <!-- SINGLE app script. No other <script> blocks on this page. -->
  <script>
  (()=>{
    'use strict';

    /* ==== EDIT THIS if your login path is different ==== */
    const LOGIN_PATH = '/index.html';

    /* ==== Supabase client ==== */
    const SUPABASE_URL = 'https://tgddpmxpbgrzrbzpomou.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZGRwbXhwYmdyenJienBvbW91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNDgxMTMsImV4cCI6MjA3MTYyNDExM30.uXntx0rZISv927MQAG1LgGKA-lA08hSkzXMre7Bk2QM';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    /* ==== state ==== */
    let currentUser=null, profile=null, health=null, contacts=[];
    const timers={identity:null, health:null};
    const QR_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let qrBusy=false, booted=false;

    /* ==== helpers ==== */
    const $=(sel)=>document.querySelector(sel);
    const on=(el,ev,fn)=>el&&el.addEventListener(ev,fn);
    const toast=(msg)=>{const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); clearTimeout(t._tmr); t._tmr=setTimeout(()=>t.classList.remove('show'),1700); };
    const escapeHtml=(s='')=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    /* ==== auth guard (no redirect loop) ==== */
    async function boot(){
      if(booted) return; booted=true;

      // net dot
      const net = () => {
        $('#netDot').className = 'w-2.5 h-2.5 rounded-full ' + (navigator.onLine ? 'bg-green-500 animate-pulse':'bg-gray-400');
        $('#netLabel').textContent = navigator.onLine ? 'Online' : 'Offline';
      };
      addEventListener('online', net); addEventListener('offline', net); net();

      const { data:{ session } } = await supabase.auth.getSession();
      if(!session?.user){ location.replace(LOGIN_PATH); return; }
      currentUser = session.user;

      wire();
      await loadAll();
      await initQr();
      renderTriage();
      renderProgress();
    }
    document.addEventListener('DOMContentLoaded', boot);
    supabase.auth.onAuthStateChange((ev)=>{ if(ev==='SIGNED_OUT') location.replace(LOGIN_PATH); });

    /* ==== load ==== */
    async function loadAll(){
      const [p,h,c] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
        supabase.from('health_profiles').select('*').eq('user_id', currentUser.id).maybeSingle(),
        supabase.from('ice_contacts').select('*').eq('user_id', currentUser.id).order('created_at',{ascending:true})
      ]);
      profile = p.error ? { id: currentUser.id } : (p.data || { id: currentUser.id });
      health  = h.error ? { user_id: currentUser.id } : (h.data || { user_id: currentUser.id });
      contacts= c.error ? [] : (c.data || []);
      hydrateIdentity(); hydrateHealth(); renderContacts();
    }

    /* ==== identity ==== */
    function hydrateIdentity(){
      $('#full_name').value = profile.full_name || '';
      $('#date_of_birth').value = profile.date_of_birth || '';
      $('#country').value = profile.country || '';
      $('#national_health_id').value = profile.national_health_id || '';
    }
    function debounced(key, fn, ms){ clearTimeout(timers[key]); timers[key]=setTimeout(fn,ms); }
    async function saveIdentity(){
      const patch = {
        id: currentUser.id,
        full_name: $('#full_name').value.trim() || null,
        date_of_birth: $('#date_of_birth').value.trim() || null,
        country: $('#country').value || null,
        national_health_id: $('#national_health_id').value.trim() || null,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from('profiles').upsert(patch, { onConflict:'id' }).select().maybeSingle();
      if(error){ console.warn(error); toast('Network error'); return; }
      profile = data || patch; toast('Identity saved'); renderProgress();
    }

    /* ==== health + pills ==== */
    function hydrateHealth(){
      const hp = health || {};
      $('#blood_type').value = hp.blood_type || '';
      $('#organ_donor').value = (hp.organ_donor===true?'yes':hp.organ_donor===false?'no':'');
      $('#life_support_pref').value = hp.life_support_pref || '';
      hydratePills('allergiesPills', hp.allergies);
      hydratePills('conditionsPills', hp.conditions);
      hydratePills('medicationsPills', hp.medications);
    }
    function hydratePills(containerId, csv){
      const box=document.getElementById(containerId); box.innerHTML='';
      (csv?String(csv).split(','):[]).map(s=>s.trim()).filter(Boolean)
        .forEach(val => box.appendChild(pill(val,containerId)));
    }
    function pill(text, containerId){
      const el=document.createElement('span');
      el.className='tag'; el.innerHTML=`<span>${escapeHtml(text)}</span><button aria-label="Remove">×</button>`;
      el.querySelector('button').addEventListener('click', async ()=>{ el.remove(); await savePills(containerId); });
      return el;
    }
    function pillKey(e, kind){ if(e.key!=='Enter') return; e.preventDefault(); addPillFrom((e.target.value||'').trim(), kind); e.target.value=''; }
    function pillBlur(e, kind){ const v=(e.target.value||'').trim(); if(!v) return; addPillFrom(v, kind); e.target.value=''; }
    function addPillFrom(raw, kind){
      const map={allergies:'allergiesPills', conditions:'conditionsPills', medications:'medicationsPills'};
      const cont=document.getElementById(map[kind]); raw.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean)
        .forEach(tok => cont.appendChild(pill(tok, cont.id)));
      savePills(cont.id);
    }
    async function savePills(containerId){
      const vals=[...document.getElementById(containerId).querySelectorAll('.tag span:first-child')].map(n=>n.textContent.trim()).filter(Boolean);
      const csv = Array.from(new Set(vals.map(v=>v.toLowerCase()))).join(', ') || null;
      const patch={};
      if(containerId==='allergiesPills') patch.allergies=csv;
      if(containerId==='conditionsPills') patch.conditions=csv;
      if(containerId==='medicationsPills') patch.medications=csv;
      await upsertHealth(patch); toast('Health saved'); renderTriage(); renderProgress();
    }
    async function saveHealthFields(){
      const v=$('#organ_donor').value;
      await upsertHealth({
        blood_type: $('#blood_type').value || null,
        organ_donor: v==='yes'?true:v==='no'?false:null,
        life_support_pref: $('#life_support_pref').value || null
      });
      toast('Health saved'); renderTriage(); renderProgress();
    }
    async function upsertHealth(patch){
      health = {...(health||{}), ...patch};
      const payload = {
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
      if(error) console.warn(error);
    }

    /* ==== triage ==== */
    function computeTriage(){
      const hp=health||{};
      if(hp.triage_override && hp.triage_override!=='auto') return hp.triage_override;
      if((hp.life_support_pref||'').toUpperCase()==='DNR') return 'Black';
      const a=(hp.allergies||'').toLowerCase(), c=(hp.conditions||'').toLowerCase(), m=(hp.medications||'').toLowerCase();
      const redAllergy=['anaphylaxis','epipen','penicillin','amoxicillin','codeine','morphine','peanut','shellfish','bee sting'];
      if(redAllergy.some(w=>a.includes(w))) return 'Red';
      const redCond=['heart attack','myocard','mi ','stroke','seizure','status epilepticus','cancer','copd severe','oxygen dependent','dialysis'];
      if(redCond.some(w=>c.includes(w))) return 'Red';
      const any=[a,c,m].some(s=>s.trim()); const meds=(m?m.split(',').map(s=>s.trim()).filter(Boolean).length:0);
      if(any || meds>=3) return 'Amber'; return 'Green';
    }
    function renderTriage(){
      const badge=$('#triageBadge'); const color=computeTriage();
      const map={Green:['bg-green-600','Green — Stable','🟢'], Amber:['bg-amber-500','Amber — Urgent','🟡'], Red:['bg-red-600','Red — Immediate','🔴'], Black:['bg-gray-900','Black — Comfort Care','⚫']};
      const [bg,label,icon]=map[color]||map.Green;
      badge.className=`inline-flex items-center px-6 py-3 rounded-full text-white text-lg font-bold ${bg}`;
      badge.innerHTML=`${icon} <span class="ml-2">${label}</span>`;
      $('#triage_override').value = health?.triage_override ? health.triage_override : 'auto';
    }

    /* ==== ICE ==== */
    function renderContacts(){
      const list=$('#contactsList'); list.innerHTML='';
      if(!contacts.length) $('#noContacts').classList.remove('hidden'); else $('#noContacts').classList.add('hidden');
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
      $('#contactsCounter').textContent = `${contacts.length} of 5 added`;
    }
    async function addContact(){
      if(contacts.length>=5){ toast('Max 5 contacts'); return; }
      const { data, error } = await supabase.from('ice_contacts').insert({
        user_id: currentUser.id, name:'', relationship:'', phone:'', email:'', notes:''
      }).select().single();
      if(error){ toast('Network error'); return; }
      contacts.push(data); renderContacts(); renderProgress();
    }
    let iceTimer=null;
    async function onContactsEvent(e){
      const del=e.target.closest('[data-del]');
      if(del){
        const id=Number(del.getAttribute('data-del')); del.disabled=true;
        try{ await supabase.from('ice_contacts').delete().eq('id', id).eq('user_id', currentUser.id);
             contacts=contacts.filter(x=>x.id!==id); renderContacts(); renderProgress(); toast('Contact deleted'); }
        finally{ del.disabled=false; }
        return;
      }
      const id=Number(e.target.getAttribute('data-id')), field=e.target.getAttribute('data-field');
      if(!id||!field) return;
      const row=contacts.find(c=>c.id===id); row[field]=e.target.value;
      clearTimeout(iceTimer); iceTimer=setTimeout(async ()=>{
        if(!row.name?.trim()||!row.phone?.trim()){ toast('Name and phone are required'); return; }
        await supabase.from('ice_contacts').update({
          name:row.name, relationship:row.relationship||'', phone:row.phone, email:row.email||'', notes:row.notes||''
        }).eq('id', id).eq('user_id', currentUser.id);
        toast('Contact saved');
      }, 400);
    }

    /* ==== QR (single, permanent) ==== */
    async function initQr(){
      if(profile?.code){
        drawQR(profile.code);
        enableQrButtons(true);
        $('#shareLink').value = `${location.origin}/c/${profile.code}`;
      }else{
        enableQrButtons(false); $('#qrBox').innerHTML=''; $('#shareLink').value='';
      }
    }
    async function generateQR(){
      if(qrBusy) return;
      if(profile?.code){ toast('Code already assigned'); return; }
      qrBusy=true; $('#generateQR').disabled=true;
      try{
        const code=await uniqueCode(6);
        const { data, error } = await supabase.from('profiles').update({ code }).eq('id', currentUser.id).select().maybeSingle();
        if(error) throw error;
        profile = data || { ...(profile||{}), code };
        drawQR(code); enableQrButtons(true);
        $('#shareLink').value = `${location.origin}/c/${code}`;
        toast('QR generated'); renderProgress();
      }catch(e){ console.warn(e); toast('Network error'); }
      finally{ qrBusy=false; $('#generateQR').disabled=false; }
    }
    async function uniqueCode(len=6, tries=10){
      for(let i=0;i<tries;i++){
        const c=Array.from({length:len},()=>QR_ALPHABET[Math.floor(Math.random()*QR_ALPHABET.length)]).join('');
        const { data } = await supabase.from('profiles').select('id').eq('code', c).maybeSingle();
        if(!data) return c;
      }
      return crypto.randomUUID().slice(0,len).toUpperCase().replace(/[^A-Z0-9]/g,'X');
    }
    function drawQR(code){
      const box=$('#qrBox'); box.innerHTML='';
      const canvas=document.createElement('canvas'); canvas.id='qrCanvas'; box.appendChild(canvas);
      const url=`${location.origin}/c/${code}`;
      window.QRCode.toCanvas(canvas, url, { width: Math.max(220, box.clientWidth-8), margin:1, color:{dark:'#111', light:'#fff'} });
    }
    function enableQrButtons(on){ ['#copyLink','#exportPNG','#printQR'].forEach(sel=>{ const b=$(sel); if(b) b.disabled=!on; }); }
    function copyLink(){ const v=$('#shareLink').value; if(!v) return; (navigator.clipboard?.writeText?v=>navigator.clipboard.writeText(v):v=>{const i=document.createElement('input');i.value=v;document.body.appendChild(i);i.select();document.execCommand('copy');i.remove();})(v); toast('Link copied'); }
    function exportPng(){ const cv=$('#qrCanvas'); if(!cv) return; const a=document.createElement('a'); a.href=cv.toDataURL('image/png'); a.download=(profile?.code||'myqer')+'.png'; a.click(); }
    function printQR(){ const v=$('#shareLink').value; if(v) window.open(v,'_blank'); }

    /* ==== progress ==== */
    function renderProgress(){
      const iOK = !!(profile?.full_name && profile?.date_of_birth && profile?.country);
      const hp = health||{};
      const hOK = !!(hp.blood_type || hp.life_support_pref || (hp.allergies||'').trim() || (hp.conditions||'').trim() || (hp.medications||'').trim());
      const cOK = contacts.length>0;
      const qOK = !!profile?.code;

      $('#chkIdentity').className = iOK?'font-bold text-green-600':'font-bold text-amber-600';
      $('#chkHealth').className   = hOK?'font-bold text-green-600':'font-bold text-amber-600';
      $('#chkContacts').className = cOK?'font-bold text-green-600':'font-bold text-amber-600';
      $('#chkQR').className       = qOK?'font-bold text-green-600':'font-bold text-amber-600';

      const pct=Math.round([iOK,hOK,cOK,qOK].filter(Boolean).length/4*100);
      $('#progressPct').textContent=pct+'%';
      $('#progressArc').setAttribute('stroke-dasharray',`${pct},100`);
      $('#iconIdentity').className='w-8 h-8 rounded-full grid place-items-center '+(iOK?'bg-green-600 text-white':'bg-amber-500 text-white');
      $('#iconHealth').className  ='w-8 h-8 rounded-full grid place-items-center '+(hOK?'bg-green-600 text-white':'bg-amber-500 text-white');
    }

    /* ==== wire UI ==== */
    function wire(){
      on($('#logoutBtn'),'click', async ()=>{ try{ await supabase.auth.signOut(); }catch{} });

      ['#full_name','#date_of_birth','#national_health_id'].forEach(sel=>{
        on($(sel),'input', ()=>debounced('identity', saveIdentity, 650));
        on($(sel),'blur',  ()=>debounced('identity', saveIdentity, 50));
      });
      on($('#country'),'change', saveIdentity);

      ['#blood_type','#organ_donor','#life_support_pref'].forEach(sel=> on($(sel),'change', saveHealthFields));

      on($('#allergiesInput'),'keydown', e=>pillKey(e,'allergies'));
      on($('#conditionsInput'),'keydown', e=>pillKey(e,'conditions'));
      on($('#medicationsInput'),'keydown', e=>pillKey(e,'medications'));
      on($('#allergiesInput'),'blur', e=>pillBlur(e,'allergies'));
      on($('#conditionsInput'),'blur', e=>pillBlur(e,'conditions'));
      on($('#medicationsInput'),'blur', e=>pillBlur(e,'medications'));

      on($('#triage_override'),'change', async ()=>{
        const v=$('#triage_override').value; health=health||{user_id:currentUser.id};
        health.triage_override = (v==='auto'?null:v);
        await upsertHealth({ triage_override: health.triage_override });
        renderTriage();
      });

      on($('#addContact'),'click', addContact);
      on($('#contactsList'),'input', onContactsEvent);
      on($('#contactsList'),'change', onContactsEvent);
      on($('#contactsList'),'click', onContactsEvent);

      on($('#generateQR'),'click', generateQR);
      on($('#copyLink'),'click', copyLink);
      on($('#exportPNG'),'click', exportPng);
      on($('#printQR'),'click', printQR);

      on($('#confirmDelete'),'input', ()=>{ $('#deleteAccount').disabled = ($('#confirmDelete').value.trim().toUpperCase()!=='DELETE'); });
      on($('#deleteAccount'),'click', async ()=>{
        if($('#confirmDelete').value.trim().toUpperCase()!=='DELETE') return;
        try{
          $('#deleteAccount').disabled=true;
          await supabase.from('ice_contacts').delete().eq('user_id', currentUser.id);
          await supabase.from('health_profiles').delete().eq('user_id', currentUser.id);
          await supabase.from('profiles').delete().eq('id', currentUser.id);
          await supabase.auth.signOut();
        } finally { location.replace(LOGIN_PATH); }
      });
    }
  })();
  </script>
</body>
</html>
