<script type="module">
  import { supabase } from './config.js';
  import 'https://cdn.jsdelivr.net/npm/i18next@23.7.11/dist/esm/i18next.js';
  import 'https://cdn.jsdelivr.net/npm/i18next-http-backend@2.5.1/esm/index.js';
  import 'https://cdn.jsdelivr.net/npm/qr-code-styling@1.6.0/lib/qr-code-styling.js';

  const LANGS = ['en','es','fr','de','it','pt','ro','ar','hi','zh'];
  const userLangGuess = (localStorage.getItem('myqer_lang') || (navigator.language || 'en').slice(0,2));
  const currentLang = LANGS.includes(userLangGuess) ? userLangGuess : 'en';

  await i18next.use(i18nextHttpBackend).init({
    lng: currentLang, fallbackLng: 'en',
    backend: { loadPath: '/locales/{{lng}}/site.json' }
  });
  const t = (k) => i18next.t(k);
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); el.textContent = t(key); });
  }

  const langSel = document.querySelector('[data-lang-picker]');
  if (langSel) {
    LANGS.forEach(l => { const opt = document.createElement('option'); opt.value=l; opt.textContent=l.toUpperCase(); if (l===currentLang) opt.selected=true; langSel.appendChild(opt); });
    langSel.addEventListener('change', async ()=> { localStorage.setItem('myqer_lang', langSel.value); await i18next.changeLanguage(langSel.value); applyTranslations(); });
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = '/'; throw new Error('Not authenticated'); }
  const userId = session.user.id;

  const $ = (sel) => document.querySelector(sel);
  const debounce = (fn, ms=400) => { let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; };
  const setBadge = (color) => { const b=$('#triageBadge'); if (!b) return; b.dataset.color=color; b.textContent = t(`triage.${color}`); };

  async function loadAll() {
    const [{ data: profile }, { data: health }, { data: contacts }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('health').select('*').eq('user_id', userId).single().then(x => x.data ? x : {data:{}}),
      supabase.from('ice_contacts').select('*').eq('user_id', userId).order('id', { ascending: true })
    ]);

    $('#full_name').value = profile?.full_name || '';
    $('#dob').value = profile?.dob || '';
    $('#country').value = profile?.country || '';
    $('#blood_type').value = profile?.blood_type || '';
    $('#national_id').value = profile?.national_id || '';
    $('#organ_donor').checked = !!profile?.organ_donor;
    $('#life_support_preference').value = profile?.life_support_preference || '';
    $('#triage_override').value = profile?.triage_override || '';
    setBadge(profile?.triage_override || profile?.triage_auto || 'green');

    $('#allergies').value = (health?.allergies || []).join(', ');
    $('#conditions').value = (health?.conditions || []).join(', ');
    $('#medications').value = (health?.medications || []).join(', ');

    renderContacts(contacts || []);
    ensureQr(profile?.card_uid);
  }

  const saveProfile = debounce(async () => {
    const update = {
      full_name: $('#full_name').value.trim(),
      dob: $('#dob').value || null,
      country: $('#country').value.trim() || null,
      blood_type: $('#blood_type').value || null,
      national_id: $('#national_id').value.trim() || null,
      organ_donor: $('#organ_donor').checked,
      life_support_preference: $('#life_support_preference').value || null,
      triage_override: $('#triage_override').value || null
    };
    await supabase.from('profiles').update(update).eq('id', userId);
    await computeAndSaveTriage();
  });

  const saveHealth = debounce(async () => {
    const parseList = (v) => v.split(',').map(s => s.trim()).filter(Boolean);
    const update = {
      allergies: parseList($('#allergies').value),
      conditions: parseList($('#conditions').value),
      medications: parseList($('#medications').value)
    };
    await supabase.from('health').upsert({ user_id: userId, ...update }, { onConflict: 'user_id' });
    await computeAndSaveTriage();
    window.dispatchEvent(new Event('myqer:healthSaved'));
  });

  ['#full_name','#dob','#country','#blood_type','#national_id','#organ_donor','#life_support_preference','#triage_override']
    .forEach(sel => $(sel)?.addEventListener(sel === '#organ_donor' ? 'change' : 'input', saveProfile));
  ['#allergies','#conditions','#medications'].forEach(sel => $(sel)?.addEventListener('input', saveHealth));

  function computeTriageColor(health, lifeSupport, override) {
    if (override) return override;
    const lower = (arr) => (arr || []).map(s => (s || '').toLowerCase());
    const allergies = lower(health?.allergies);
    const conditions = lower(health?.conditions);
    const severe = ['anaphylaxis','peanut','shellfish','penicillin','contrast','latex'];
    const critical = ['cardiac','heart failure','myocardial','arrhythmia','seizure','epilepsy','stroke','copd','respiratory failure'];
    const chronic = ['diabetes','hypertension','asthma','ckd','chronic kidney','hypothyroid'];
    const has = (arr, keys) => arr?.some(a => keys.some(k => a.includes(k)));
    if ((lifeSupport||'').toLowerCase().includes('dnr') || (lifeSupport||'').toLowerCase().includes('end')) return 'blue';
    if (has(allergies, severe) || has(conditions, critical)) return 'red';
    if (has(conditions, chronic)) return 'amber';
    return 'green';
  }

  async function computeAndSaveTriage() {
    const [{ data: profile }, { data: health }] = await Promise.all([
      supabase.from('profiles').select('life_support_preference, triage_override').eq('id', userId).single(),
      supabase.from('health').select('allergies, conditions').eq('user_id', userId).single()
    ]);
    const auto = computeTriageColor(health, profile?.life_support_preference, profile?.triage_override);
    setBadge(profile?.triage_override || auto);
    await supabase.from('profiles').update({ triage_auto: auto }).eq('id', userId);
  }

  function renderContacts(list) {
    const wrap = $('#iceList'); wrap.innerHTML = '';
    list.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'ice-row glass';
      row.innerHTML = \`
        <input class="ice-name" value="\${c.name || ''}" placeholder="\${i18next.t('labels.name')}">
        <input class="ice-rel" value="\${c.relationship || ''}" placeholder="\${i18next.t('labels.relationship')}">
        <input class="ice-phone" value="\${c.phone || ''}" placeholder="\${i18next.t('labels.phone')}">
        <button class="pill remove" aria-label="Remove">✕</button>\`;
      row.querySelector('.ice-name').addEventListener('input', debounce(async (e)=>{
        await supabase.from('ice_contacts').update({ name: e.target.value }).eq('id', c.id);
      }));
      row.querySelector('.ice-rel').addEventListener('input', debounce(async (e)=>{
        await supabase.from('ice_contacts').update({ relationship: e.target.value }).eq('id', c.id);
      }));
      row.querySelector('.ice-phone').addEventListener('input', debounce(async (e)=>{
        await supabase.from('ice_contacts').update({ phone: e.target.value }).eq('id', c.id);
      }));
      row.querySelector('.remove').addEventListener('click', async ()=>{
        await supabase.from('ice_contacts').delete().eq('id', c.id);
        loadAll();
      });
      wrap.appendChild(row);
    });
  }

  let qr;
  function ensureQr(cardUid) {
    if (!cardUid) return;
    const url = \`\${location.origin}/card.html?uid=\${cardUid}\`;
    const link = document.getElementById('cardLink');
    if (link) { link.href = url; link.textContent = url; }
    const box = document.getElementById('qr');
    if (!box) return;
    if (!qr) {
      qr = new QRCodeStyling({ width: 240, height: 240, data: url, dotsOptions: { type: 'rounded' }, backgroundOptions: { color: 'transparent' } });
      qr.append(box);
    } else { qr.update({ data: url }); }
  }

  applyTranslations();
  loadAll();

  document.getElementById('logout')?.addEventListener('click', async ()=>{
    await supabase.auth.signOut(); location.href = '/';
  });
</script>
