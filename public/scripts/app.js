// /public/scripts/app.js
import { supabase, AUTH_QUERY } from './config.js';
import 'https://cdn.jsdelivr.net/npm/i18next@23.7.11/dist/esm/i18next.js';
import 'https://cdn.jsdelivr.net/npm/i18next-http-backend@2.5.1/esm/index.js';
import 'https://cdn.jsdelivr.net/npm/qr-code-styling@1.6.0/lib/qr-code-styling.js';

/* ========== i18n boot ========== */
const LANGS = ['en','es','fr','de','it','pt','ro','ar','hi','zh'];
const userLangGuess = (localStorage.getItem('myqer_lang') || (navigator.language || 'en').slice(0,2));
const currentLang = LANGS.includes(userLangGuess) ? userLangGuess : 'en';

await i18next.use(i18nextHttpBackend).init({
  lng: currentLang,
  fallbackLng: 'en',
  backend: { loadPath: '/locales/{{lng}}/site.json' }
});

const t = (k) => i18next.t(k);

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });
}

/* Language picker (optional in UI) */
const langSel = document.querySelector('[data-lang-picker]');
if (langSel) {
  LANGS.forEach(l => {
    const o = document.createElement('option');
    o.value = l;
    o.textContent = l.toUpperCase();
    if (l === currentLang) o.selected = true;
    langSel.appendChild(o);
  });
  langSel.addEventListener('change', async () => {
    localStorage.setItem('myqer_lang', langSel.value);
    await i18next.changeLanguage(langSel.value);
    applyTranslations();
  });
}

/* ========== Auth guard (redirect to landing modal) ========== */
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  // Back to homepage and auto-open login modal (landing reads ?auth=signin)
  window.location.replace(`/?${AUTH_QUERY}`);
  throw new Error('Not authenticated');
}
const userId = session.user.id;

/* ========== Helpers ========== */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const debounce = (fn, ms=400) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

const setBadge = (color) => {
  const b = $('#triageBadge');
  if (!b) return;
  b.dataset.color = color;
  b.textContent = t(`triage.${color}`) || color.toUpperCase();
};

// Convert between UI (comma list) and DB (text)
const toList   = (txt) => (txt || '').split(',').map(s=>s.trim()).filter(Boolean);
const fromList = (arr) => (arr || []).join(', ');

/* ========== Load all profile data ========== */
async function loadAll() {
  try {
    const [pRes, hRes, cRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('health_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('ice_contacts').select('*').eq('user_id', userId).order('id', { ascending: true }),
    ]);

    const profile  = pRes.data || {};
    const health   = hRes.data || {};
    const contacts = cRes.data || [];

    // Ensure the profile has a unique code for QR and future integrations
    if (!profile.code) {
      const newCode = (crypto?.randomUUID?.() || `${userId}-${Date.now()}`);
      await supabase.from('profiles').update({ code: newCode }).eq('id', userId);
      profile.code = newCode;
    }

    // profiles
    if ($('#full_name'))           $('#full_name').value = profile.full_name || '';
    if ($('#dob'))                 $('#dob').value = profile.date_of_birth || '';
    if ($('#country'))             $('#country').value = profile.country || '';
    if ($('#triage_override'))     $('#triage_override').value = profile.triage_override || '';
    setBadge(profile.triage_override || profile.triage_auto || 'green');

    // health_profiles fields
    if ($('#blood_type'))               $('#blood_type').value = health.blood_type || '';
    if ($('#national_id'))              $('#national_id').value = health.national_id || '';
    if ($('#organ_donor'))              $('#organ_donor').checked = !!health.organ_donor;
    if ($('#life_support_preference'))  $('#life_support_preference').value = health.life_support_pref || '';

    if ($('#allergies'))   $('#allergies').value   = fromList(toList(health.allergies));
    if ($('#conditions'))  $('#conditions').value  = fromList(toList(health.conditions));
    if ($('#medications')) $('#medications').value = fromList(toList(health.meds));

    // ICE
    renderContacts(contacts);

    // QR
    ensureQrFromCode(profile.code);

  } catch (e) {
    console.error('loadAll error:', e);
  }
}

/* ========== Save profile (profiles table) ========== */
const saveProfile = debounce(async () => {
  try {
    const update = {
      full_name:       $('#full_name')?.value.trim() || null,
      date_of_birth:   $('#dob')?.value || null,
      country:         $('#country')?.value.trim() || null,
      triage_override: $('#triage_override')?.value || null,
    };
    await supabase.from('profiles').update(update).eq('id', userId);
    await computeAndSaveTriage();
  } catch (e) {
    console.error('saveProfile error:', e);
  }
});

/* ========== Save health (health_profiles table) ========== */
const saveHealth = debounce(async () => {
  try {
    const update = {
      blood_type:         $('#blood_type')?.value || null,
      national_id:        $('#national_id')?.value?.trim() || null,
      organ_donor:        !!$('#organ_donor')?.checked,
      life_support_pref:  $('#life_support_preference')?.value || null,
      allergies:          $('#allergies')?.value,
      conditions:         $('#conditions')?.value,
      meds:               $('#medications')?.value,
    };
    await supabase.from('health_profiles')
      .upsert({ user_id: userId, ...update }, { onConflict: 'user_id' });
    await computeAndSaveTriage();
    window.dispatchEvent(new Event('myqer:healthSaved'));
  } catch (e) {
    console.error('saveHealth error:', e);
  }
});

/* Wire inputs (only if present on the page) */
['#full_name','#dob','#country','#triage_override']
  .forEach(sel => $(sel)?.addEventListener('input', saveProfile));
['#blood_type','#national_id','#organ_donor','#life_support_preference','#allergies','#conditions','#medications']
  .forEach(sel => $(sel)?.addEventListener(sel==='#organ_donor'?'change':'input', saveHealth));

/* ========== Triage logic ========== */
function computeTriageColor(health, lifeSupport, override) {
  if (override) return override;

  const lower = (txt) => toList(txt).map(s => s.toLowerCase());
  const allergies  = lower(health?.allergies);
  const conditions = lower(health?.conditions);

  const severe   = ['anaphylaxis','peanut','shellfish','penicillin','contrast','latex'];
  const critical = ['cardiac','heart failure','myocardial','arrhythmia','seizure','epilepsy','stroke','copd','respiratory failure'];
  const chronic  = ['diabetes','hypertension','asthma','ckd','chronic kidney','hypothyroid'];

  const has = (arr, keys) => arr?.some(a => keys.some(k => a.includes(k)));
  const life = (lifeSupport || '').toLowerCase();

  if (life.includes('dnr') || life.includes('end')) return 'blue';
  if (has(allergies, severe) || has(conditions, critical)) return 'red';
  if (has(conditions, chronic)) return 'amber';
  return 'green';
}

async function computeAndSaveTriage() {
  try {
    const [p, h] = await Promise.all([
      supabase.from('profiles').select('triage_override, country, date_of_birth').eq('id', userId).single(),
      supabase.from('health_profiles').select('allergies, conditions, life_support_pref').eq('user_id', userId).single(),
    ]);
    const profile = p.data || {};
    const health  = h.data || {};
    const auto    = computeTriageColor(health, health.life_support_pref, profile.triage_override);
    setBadge(profile.triage_override || auto);
    await supabase.from('profiles').update({ triage_auto: auto }).eq('id', userId);
  } catch (e) {
    console.error('computeAndSaveTriage error:', e);
  }
}

/* ========== ICE contacts UI ========== */
function renderContacts(list) {
  const wrap = $('#iceList');
  if (!wrap) return;

  // If list empty, show "empty" block if you have one
  if (list.length === 0) {
    wrap.innerHTML = '';
    $('#emptyIce')?.classList.remove('hidden');
    return;
  }
  $('#emptyIce')?.classList.add('hidden');

  // Append (don't blow away existing edits)
  list.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'ice-row glass';
    row.innerHTML = `
      <input class="ice-name"  value="${c.name || ''}"     placeholder="${i18next.t('labels.name')}">
      <input class="ice-rel"   value="${c.relation || ''}" placeholder="${i18next.t('labels.relationship')}">
      <input class="ice-phone" value="${c.phone || ''}"    placeholder="${i18next.t('labels.phone')}">
      <button class="pill remove" aria-label="Remove">✕</button>
    `;

    row.querySelector('.ice-name')?.addEventListener('input', debounce(async (e)=>{
      await supabase.from('ice_contacts').update({ name: e.target.value }).eq('id', c.id);
    }));
    row.querySelector('.ice-rel')?.addEventListener('input', debounce(async (e)=>{
      await supabase.from('ice_contacts').update({ relation: e.target.value }).eq('id', c.id);
    }));
    row.querySelector('.ice-phone')?.addEventListener('input', debounce(async (e)=>{
      await supabase.from('ice_contacts').update({ phone: e.target.value }).eq('id', c.id);
    }));
    row.querySelector('.remove')?.addEventListener('click', async ()=>{
      await supabase.from('ice_contacts').delete().eq('id', c.id);
      // Re-fetch and re-render after delete
      const { data } = await supabase.from('ice_contacts').select('*').eq('user_id', userId).order('id', { ascending: true });
      wrap.innerHTML = '';
      renderContacts(data || []);
    });

    wrap.appendChild(row);
  });
}

// Insert a brand-new contact row
document.getElementById('addIce')?.addEventListener('click', async () => {
  try {
    const { data, error } = await supabase
      .from('ice_contacts')
      .insert({ user_id: userId, name: '', relation: '', phone: '' })
      .select()
      .single();
    if (error) throw error;

    // Add to the list immediately
    renderContacts([data]);
  } catch (e) {
    console.error('Add contact failed:', e);
  }
});

/* ========== QR preview (placeholder) ========== */
let qr;
function ensureQrFromCode(code) {
  if (!code) return;
  const url  = `${location.origin}/card.html?code=${code}`;
  const link = document.getElementById('cardLink');
  if (link) { link.href = url; link.value = url; link.textContent = url; }

  const box = document.getElementById('qr');
  if (!box) return;

  // QRCodeStyling is exposed globally by the CDN build
  if (!qr) {
    qr = new QRCodeStyling({
      width: 240, height: 240, data: url,
      dotsOptions: { type: 'rounded' },
      backgroundOptions: { color: 'transparent' }
    });
    qr.append(box);
  } else {
    qr.update({ data: url });
  }
}

/* ========== Init ========== */
applyTranslations();
loadAll();

/* ========== Logout (return to pretty modal) ========== */
document.getElementById('logout')?.addEventListener('click', async ()=>{
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error('Logout error:', e);
  } finally {
    window.location.replace(`/?${AUTH_QUERY}`);
  }
});
