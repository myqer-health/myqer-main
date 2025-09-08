// /public/scripts/app.js
// One-file dashboard logic (Supabase UMD + QRCode UMD are loaded by <script> tags in HTML)

(function () {
  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function wait(ms) { return new Promise(function (r) { return setTimeout(r, ms); }); }
  function withTimeout(p, ms, label) {
    if (!label) label = 'promise';
    return Promise.race([
      p,
      new Promise(function (_ , rej){ setTimeout(function(){ rej(new Error(label + ' timed out')); }, ms); })
    ]);
  }

  var supabase, isSupabaseAvailable = false;
  var isOnline = navigator.onLine;

  // IMPORTANT: keep module state mirrored on window for any code that expects globals
  var userData = { profile: {}, health: {} };
  var iceContacts = [];
  window.userData = userData;
  window.iceContacts = iceContacts;

  var autoSaveTimers = {};
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1

  /* ---------- supabase init ---------- */
  try {
    // Avoid shadowing the global URL API
    var SUPABASE_URL = 'https://dmntmhkncldgynufajei.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtbnRtaGtuY2xkZ3ludWZhamVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MzQ2MzUsImV4cCI6MjA3MjQxMDYzNX0.6DzOSb0xu5bp4g2wKy3SNtEEuSQavs_ohscyawvPmrY';
    if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      isSupabaseAvailable = true;
      console.log('✅ Supabase ready');
    }
  } catch (e) { console.warn('⚠️ Supabase init failed:', e); }

  function getUserId() {
    if (!isSupabaseAvailable) return Promise.resolve(null);
    return supabase.auth.getUser().then(function (res) {
      if (res.error) throw res.error;
      return res.data && res.data.user ? res.data.user.id : null;
    });
  }

  /* ---------- toasts ---------- */
  function toast(msg, type, ms) {
    if (!type) type = 'success';
    if (!ms) ms = 2200;
    var area = $('toastArea');
    if (!area) {
      area = document.createElement('div');
      area.id = 'toastArea';
      area.setAttribute('aria-live', 'polite');
      document.body.appendChild(area);
    }
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    area.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 250); }, ms);
  }

  /* ---------- net status ---------- */
  function updateNetworkStatus() {
    var badge = $('netStatus'), banner = $('offlineBanner');
    if (navigator.onLine) {
      if (badge) { badge.textContent = 'ONLINE'; badge.className = 'online'; }
      if (banner) banner.style.display = 'none';
      if (!isOnline) toast('Back online — syncing…', 'success');
      isOnline = true;
    } else {
      if (badge) { badge.textContent = 'OFFLINE'; badge.className = 'offline'; }
      if (banner) banner.style.display = 'block';
      if (isOnline) toast('Working offline — changes saved locally', 'info');
      isOnline = false;
    }
  }

  /* ---------- autosave ---------- */
  function setupAutoSave(id, fn, delay) {
    if (!delay && delay !== 0) delay = 600;
    var el = $(id);
    if (!el) return;
    var handler = function () {
      clearTimeout(autoSaveTimers[id]);
      autoSaveTimers[id] = setTimeout(function () {
        fn().catch(function (e) { console.warn('autosave err', e); });
      }, delay);
    };
    // Checkboxes are weird on 'input' across browsers; also listen to 'change'
    on(el, 'input', handler);
    on(el, 'change', handler);
  }

  /* ---------- triage ---------- */
  var TRIAGE = ['green', 'amber', 'red', 'black'];
  function updateTriagePill(level) {
    if (!level) level = 'green';
    var pill = $('triagePill'); if (!pill) return;
    for (var i = 0; i < TRIAGE.length; i++) pill.classList.remove(TRIAGE[i]);
    pill.classList.add(level);
    pill.textContent = level.toUpperCase();
  }
  function calculateTriage() {
    var overSel = $('triageOverride');
    var override = overSel ? overSel.value : 'auto';
    if (override !== 'auto') { updateTriagePill(override); return; }
    var allergies = (($('hfAllergies') && $('hfAllergies').value) || '').toLowerCase();
    var conditions = (($('hfConditions') && $('hfConditions').value) || '').toLowerCase();
    if (allergies.indexOf('anaphylaxis') !== -1 || allergies.indexOf('severe') !== -1) { updateTriagePill('red'); return; }
    updateTriagePill((allergies || conditions) ? 'amber' : 'green');
  }

  /* ---------- QR + short code ---------- */
  function makeShort_3_4_3() {
    function pick(n) {
      var s = '';
      for (var i = 0; i < n; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      return s;
    }
    return pick(3) + '-' + pick(4) + '-' + pick(3);
  }

  function generateShortCode() {
    var valid = /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{3}$/;
    var code = localStorage.getItem('myqer_shortcode');
    if (!valid.test(code || '')) { code = makeShort_3_4_3(); localStorage.setItem('myqer_shortcode', code); }
    return code;
  }

  function ensureShortCode() {
    var code = localStorage.getItem('myqer_shortcode') || generateShortCode();
    if (!(isSupabaseAvailable && isOnline)) return Promise.resolve(code);
    return getUserId().then(function (uid) {
      if (!uid) return code;

      var attempt = 0;
      function tryUpsert() {
        attempt++;
        return supabase.from('profiles').upsert({ user_id: uid, code: code }, { onConflict: 'user_id' })
          .then(function (res) {
            if (!res.error) return code;
            var msg = ((res.error.message || '') + ' ' + (res.error.details || '')).toLowerCase();
            if ((msg.indexOf('duplicate') !== -1 || msg.indexOf('unique') !== -1) && attempt < 6) {
              code = makeShort_3_4_3(); localStorage.setItem('myqer_shortcode', code);
              return tryUpsert();
            }
            console.warn('shortcode upsert err:', res.error);
            return code;
          })
          .catch(function (e) { console.warn('ensureShortCode failed', e); return code; });
      }
      return tryUpsert();
    });
  }

  function ensureQRCodeLib() {
    // If loaded via script tag, this will already be present
    if (window.QRCode && (typeof window.QRCode.toCanvas === 'function' || typeof window.QRCode?.default?.toCanvas === 'function')) {
      return Promise.resolve();
    }
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
      s.onload = res;
      s.onerror = function () { rej(new Error('QRCode lib failed to load')); };
      document.head.appendChild(s);
    });
  }

  function getQRApi() {
    // Normalize UMD/default export across environments
    if (!window.QRCode) return null;
    if (typeof window.QRCode.toCanvas === 'function') return window.QRCode;
    if (typeof window.QRCode?.default?.toCanvas === 'function') return window.QRCode.default;
    return null;
  }

  function buildOfflineText(shortUrl) {
    var pf = (userData && userData.profile) ? userData.profile : {};
    var hd = (userData && userData.health) ? userData.health : {};
    var name = pf.full_name != null ? pf.full_name : (pf.fullName != null ? pf.fullName : '');
    var dob  = pf.date_of_birth != null ? pf.date_of_birth : (pf.dob != null ? pf.dob : '');
    var nat  = pf.national_id != null ? pf.national_id : (pf.healthId != null ? pf.healthId : '');
    var country = pf.country != null ? pf.country : '';
    var donor = hd && hd.organDonor ? 'Y' : 'N';

    var L = [];
    var L1 = [];
    if (name)   L1.push('Name: ' + name);
    if (dob)    L1.push('DOB: ' + dob);
    if (country)L1.push('C: ' + country);
    if (nat)    L1.push('ID: ' + nat);
    if (L1.length) L.push(L1.join(' | '));

    var L2 = [];
    if (hd && hd.bloodType) L2.push('BT: ' + hd.bloodType);
    if (hd && hd.allergies) L2.push('ALG: ' + hd.allergies);
    if (L2.length) L.push(L2.join(' | '));

    var L3 = [];
    if (hd && hd.conditions)  L3.push('COND: ' + hd.conditions);
    if (hd && hd.medications) L3.push('MED: ' + hd.medications);
    if (hd && hd.implants)    L3.push('IMP: ' + hd.implants);
    L3.push('DONOR:' + donor);
    if (L3.length) L.push(L3.join(' | '));

    L.push('URL:' + shortUrl);
    return L.join('\n').slice(0, 1200);
  }

  async function generateQRCode() {
    const qrCanvas      = $('qrCanvas');
    const qrPlaceholder = $('qrPlaceholder');
    const codeUnderQR   = $('codeUnderQR');
    const cardUrlInput  = $('cardUrl');
    const qrStatus      = $('qrStatus');

    if (!qrCanvas) return; // no slot on page

    // allow QR as soon as *any* section has data (name OR health OR ICE)
    const hasProfile = !!(userData?.profile?.full_name ?? userData?.profile?.fullName);
    const hasHealth  = !!(userData?.health?.bloodType || userData?.health?.allergies);
    const hasICE     = Array.isArray(iceContacts) && iceContacts.length > 0;

    if (!(hasProfile || hasHealth || hasICE)) {
      qrPlaceholder && (qrPlaceholder.style.display = 'flex');
      qrCanvas && (qrCanvas.style.display = 'none');
      codeUnderQR && (codeUnderQR.textContent = '');
      cardUrlInput && (cardUrlInput.value = '');
      qrStatus && (qrStatus.hidden = true);
      return;
    }

    // short URL + show it in UI
    const code = await ensureShortCode();
    const shortUrl = `https://www.myqer.com/c/${code}`;
    codeUnderQR && (codeUnderQR.textContent = code);
    cardUrlInput && (cardUrlInput.value = shortUrl);

    try {
      // make sure QR library is present
      await ensureQRCodeLib();

      const QR = getQRApi();
      if (!QR) throw new Error('QRCode lib not ready');

      // prep canvas for high-DPI
      const size  = 220;
      const scale = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      qrCanvas.width  = size * scale;
      qrCanvas.height = size * scale;
      qrCanvas.style.width  = size + 'px';
      qrCanvas.style.height = size + 'px';
      const ctx = qrCanvas.getContext('2d');
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // try direct draw; if some environments block canvas draw, fall back to dataURL
      try {
        await new Promise((res, rej) =>
          QR.toCanvas(
            qrCanvas,
            shortUrl,
            { errorCorrectionLevel: 'H', margin: 1, width: size },
            e => (e ? rej(e) : res())
          )
        );
      } catch {
        const dataUrl = await new Promise((res, rej) =>
          QR.toDataURL(
            shortUrl,
            { errorCorrectionLevel: 'H', margin: 1, width: size },
            (e, s) => (e ? rej(e) : res(s))
          )
        );
        await new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => { ctx.drawImage(img, 0, 0, size, size); res(); };
          img.onerror = rej;
          img.src = dataUrl;
        });
      }

      // success UI
      qrPlaceholder && (qrPlaceholder.style.display = 'none');
      qrCanvas.style.display = 'block';
      if (qrStatus) {
        qrStatus.textContent = 'QR Code generated successfully';
        qrStatus.style.background = 'rgba(5,150,105,0.1)';
        qrStatus.style.color = 'var(--green)';
        qrStatus.hidden = false;
      }

      // fill offline text block
      const offlineEl = $('offlineText');
      if (offlineEl) offlineEl.value = buildOfflineText(shortUrl);

    } catch (err) {
      console.error('QR render error:', err);
      // graceful failure UI
      qrPlaceholder && (qrPlaceholder.style.display = 'flex');
      qrCanvas && (qrCanvas.style.display = 'none');
      if (qrStatus) {
        qrStatus.textContent = '⚠️ Couldn’t draw QR. Check connection/ad-blockers and try again.';
        qrStatus.style.background = 'rgba(252,211,77,0.15)';
        qrStatus.style.color = '#92400E';
        qrStatus.hidden = false;
      }
    }
  }

  /* ---------- ICE (local-first + server-sync) ---------- */
  function renderIceContacts() {
    var box = $('iceContactsList'); if (!box) return;
    box.innerHTML = '';
    var list = Array.isArray(iceContacts) ? iceContacts : [];
    list.forEach(function (contact, idx) {
      var row = document.createElement('div');
      row.className = 'ice-row'; row.dataset.index = String(idx);
      row.innerHTML =
        '<div class="ice-contact-header">' +
          '<div class="contact-number">' + (idx + 1) + '</div>' +
          '<div class="ice-actions">' +
            '<button class="iceSaveBtn" data-act="save" data-idx="' + idx + '">Save</button>' +
            '<button class="iceDeleteBtn" data-act="del" data-idx="' + idx + '" aria-label="Delete contact">✖</button>' +
          '</div>' +
        '</div>' +
        '<div class="ice-form-grid">' +
          '<div class="form-group"><label>Name</label>' +
            '<input type="text" class="iceName" data-field="name" data-idx="' + idx + '" value="' + (contact.name || '') + '" placeholder="Name">' +
          '</div>' +
          '<div class="form-group"><label>Relationship</label>' +
            '<input type="text" class="iceRelation" data-field="relationship" data-idx="' + idx + '" value="' + (contact.relationship || '') + '" placeholder="Spouse, Parent">' +
          '</div>' +
          '<div class="form-group"><label>Phone</label>' +
            '<input type="tel" class="icePhone" data-field="phone" data-idx="' + idx + '" value="' + (contact.phone || '') + '" placeholder="+1 555 123 4567">' +
          '</div>' +
        '</div>';
      box.appendChild(row);
    });
    var addBtn = $('addIce');
    if (addBtn) {
      if (list.length >= 3) { addBtn.disabled = true; addBtn.textContent = 'Maximum 3 contacts reached'; }
      else { addBtn.disabled = false; addBtn.textContent = 'Add Emergency Contact'; }
    }
  }
  function persistIceLocally() {
    localStorage.setItem('myqer_ice', JSON.stringify(iceContacts || []));
    window.iceContacts = iceContacts;
  }
  function addIceContact() {
    if (!Array.isArray(iceContacts)) iceContacts = [];
    iceContacts.push({ name: '', relationship: '', phone: '' });
    persistIceLocally(); renderIceContacts();
  }
  function updateIceContact(idx, field, value) {
    if (!iceContacts[idx]) return;
    iceContacts[idx][field] = value;
    persistIceLocally();
  }
  function saveICEToServer() {
    if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
    return getUserId().then(function (uid) {
      if (!uid) return;
      return supabase.from('ice_contacts').delete().eq('user_id', uid).then(function () {
        var rows = (iceContacts || []).filter(function (c){ return c.name || c.phone; })
          .map(function (c, i){ return { user_id: uid, contact_order: i, name: c.name || '', relationship: c.relationship || '', phone: c.phone || '' }; });
        if (!rows.length) return;
        return supabase.from('ice_contacts').insert(rows);
      });
    });
  }
  function saveICE() {
    var entries = (iceContacts || []).map(function (c) {
      return { name: (c.name || '').trim(), relationship: (c.relationship || '').trim(), phone: (c.phone || '').trim() };
    }).filter(function (c){ return c.name || c.phone; });
    if (entries.length > 3) { toast('Maximum 3 emergency contacts allowed', 'error'); return; }
    var bad = null;
    for (var i = 0; i < entries.length; i++) { if (!(entries[i].name && entries[i].phone)) { bad = entries[i]; break; } }
    if (bad) { toast('Each contact needs a name and phone', 'error'); return; }
    iceContacts = entries; persistIceLocally();
    saveICEToServer().then(function(){ toast('Emergency contacts saved','success'); generateQRCode(); })
      .catch(function(e){ console.error(e); toast('Error saving emergency contacts','error'); });
  }

  /* ---------- profile & health ---------- */
  function upsertProfileSmart(rowBase) {
    return getUserId().then(function (uid) {
      if (!uid) return;
      return ensureShortCode().then(function (code) {
        var snake = { user_id: uid, code: code,
          full_name: rowBase.full_name, date_of_birth: rowBase.date_of_birth,
          country: rowBase.country, national_id: rowBase.national_id
        };
        var camel = { user_id: uid, code: code,
          fullName: rowBase.full_name, dob: rowBase.date_of_birth,
          country: rowBase.country, healthId: rowBase.national_id
        };
        return supabase.from('profiles').upsert(snake, { onConflict: 'user_id' }).then(function (r1) {
          if (!r1.error) return;
          return supabase.from('profiles').upsert(camel, { onConflict: 'user_id' }).then(function (r2) {
            if (r2.error) throw r2.error;
          });
        });
      });
    });
  }

  function saveProfile() {
    var profile = {
      full_name:     $('profileFullName') ? $('profileFullName').value.trim() : '',
      date_of_birth: $('profileDob') ? $('profileDob').value.trim() : '',
      country:       $('profileCountry') ? $('profileCountry').value.trim() : '',
      national_id:   $('profileHealthId') ? $('profileHealthId').value.trim() : ''
    };

    userData.profile = profile;
    window.userData = userData; // mirror to global for any other code paths
    localStorage.setItem('myqer_profile', JSON.stringify(profile));

    // NEW: warn if not authenticated (server write will be skipped)
    if (!isSupabaseAvailable) { toast('Saved locally (offline mode)', 'info'); generateQRCode(); return; }

    supabase.auth.getSession().then(function(r){
      var session = r && r.data ? r.data.session : null;
      if (!session) { toast('Saved locally — please sign in to sync', 'info'); generateQRCode(); return; }

      upsertProfileSmart(profile)
        .then(function(){ toast('Profile saved', 'success'); generateQRCode(); })
        .catch(function(e){ console.error(e); toast('Error saving profile','error'); });
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

    // local-first
    userData.health = health;
    window.userData = userData;
    localStorage.setItem('myqer_health', JSON.stringify(health));

    if (!isSupabaseAvailable) {
      calculateTriage();
      toast('Saved locally (offline mode)', 'info');
      generateQRCode();
      return;
    }

    supabase.auth.getSession().then((r) => {
      const session = r && r.data ? r.data.session : null;
      if (!session) {
        calculateTriage();
        toast('Saved locally — please sign in to sync', 'info');
        generateQRCode();
        // prevent success .then from running
        return Promise.reject(new Error('no session'));
      }

      return getUserId().then((uid) => {
        if (!uid) {
          calculateTriage();
          toast('Saved locally — please sign in to sync', 'info');
          generateQRCode();
          return Promise.reject(new Error('no uid'));
        }

        return supabase
          .from('health_data')
          .upsert(
            {
              user_id: uid,
              bloodType: health.bloodType,
              allergies: health.allergies,
              conditions: health.conditions,
              medications: health.medications,
              implants: health.implants,
              organDonor: health.organDonor,
              triageOverride: health.triageOverride
            },
            { onConflict: 'user_id' }
          )
          .then(({ error }) => {
            if (error) throw error;
          });
      });
    })
    .then(() => {
      calculateTriage();
      toast('Health info saved', 'success');
      generateQRCode();
    })
    .catch((e) => {
      if (e && (e.message === 'no session' || e.message === 'no uid')) return;
      console.error(e);
      toast('Error saving health','error');
    });
  }

  /* ---------- load (local-first, then server) ---------- */
  function fillFromLocal() {
    try {
      var lp = localStorage.getItem('myqer_profile');
      if (lp) userData.profile = JSON.parse(lp) || {};
      window.userData = userData;
      var p = userData.profile;
      function set(id, v){ var el=$(id); if (el) el.value = v || ''; }
      set('profileFullName', p.full_name != null ? p.full_name : p.fullName);
      set('profileDob',     p.date_of_birth != null ? p.date_of_birth : p.dob);
      set('profileCountry', p.country);
      set('profileHealthId',p.national_id != null ? p.national_id : p.healthId);

      var lh = localStorage.getItem('myqer_health');
      if (lh) userData.health = JSON.parse(lh) || {};
      window.userData = userData;
      var h = userData.health;
      set('hfBloodType', h.bloodType);
      set('hfAllergies', h.allergies);
      set('hfConditions',h.conditions);
      set('hfMeds',      h.medications);
      set('hfImplants',  h.implants);
      if ($('hfDonor')) $('hfDonor').checked = !!h.organDonor;
      if ($('triageOverride')) $('triageOverride').value = h.triageOverride || 'auto';
      calculateTriage();

      var li = localStorage.getItem('myqer_ice');
      iceContacts = li ? (JSON.parse(li) || []) : [];
      window.iceContacts = iceContacts;
      renderIceContacts();
    } catch(e){ console.warn('Local fill failed', e); }
  }

  function loadFromServer() {
    if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
    return withTimeout(supabase.auth.getSession(), 3000, 'getSession').then(function (res) {
      if (!res.data || !res.data.session) return;
      return withTimeout(getUserId(), 3000, 'getUserId').then(function (uid) {
        if (!uid) return;

        // profiles
        return withTimeout(supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(), 4000, 'profiles.select')
          .then(function (rp) {
            var prof = rp && rp.data ? rp.data : null;
            if (prof) {
              userData.profile = Object.assign({}, userData.profile, prof);
              window.userData = userData;
              localStorage.setItem('myqer_profile', JSON.stringify(userData.profile));
              var p = userData.profile;
              function set(id, v){ var el=$(id); if (el) el.value = v || ''; }
              set('profileFullName', p.full_name != null ? p.full_name : p.fullName);
              set('profileDob',     p.date_of_birth != null ? p.date_of_birth : p.dob);
              set('profileCountry', p.country);
              set('profileHealthId',p.national_id != null ? p.national_id : p.healthId);
            }
          })
          .then(function () {
            // health
            return withTimeout(supabase.from('health_data').select('*').eq('user_id', uid).maybeSingle(), 4000, 'health_data.select')
              .then(function (rh) {
                var health = rh && rh.data ? rh.data : null;
                if (health) {
                  userData.health = Object.assign({}, userData.health, health);
                  window.userData = userData;
                  localStorage.setItem('myqer_health', JSON.stringify(userData.health));
                  var h = userData.health;
                  function set(id, v){ var el=$(id); if (el) el.value = v || ''; }
                  set('hfBloodType', h.bloodType);
                  set('hfAllergies', h.allergies);
                  set('hfConditions',h.conditions);
                  set('hfMeds',      h.medications);
                  set('hfImplants',  h.implants);
                  if ($('hfDonor')) $('hfDonor').checked = !!h.organDonor;
                  if ($('triageOverride')) $('triageOverride').value = h.triageOverride || 'auto';
                  calculateTriage();
                }
              });
          })
          .then(function () {
            // ice
            return withTimeout(supabase.from('ice_contacts').select('*').eq('user_id', uid).order('contact_order', { ascending: true }), 4000, 'ice_contacts.select')
              .then(function (ri) {
                var ice = ri && ri.data ? ri.data : [];
                if (Object.prototype.toString.call(ice) === '[object Array]') {
                  iceContacts = ice.map(function (r){ return { name: r.name || '', relationship: r.relationship || '', phone: r.phone || '' }; });
                  window.iceContacts = iceContacts;
                  localStorage.setItem('myqer_ice', JSON.stringify(iceContacts));
                  renderIceContacts();
                }
              });
          });
      });
    }).catch(function (e){ console.warn('Server load failed', e); });
  }

  /* ---------- wire UI ---------- */
  function wireQRButtons() {
    on($('copyLink'), 'click', function () {
      var url = ($('cardUrl') && $('cardUrl').value) || '';
      if (!url) { toast('No link to copy','error'); return; }
      navigator.clipboard.writeText(url).then(function(){ toast('Link copied','success'); })
        .catch(function(){ toast('Copy failed','error'); });
    });
    on($('openLink'), 'click', function () {
      var url = ($('cardUrl') && $('cardUrl').value) || '';
      if (!url) { toast('No link to open','error'); return; }
      window.open(url, '_blank', 'noopener');
    });
    on($('dlPNG'), 'click', function () {
      var canvas = $('qrCanvas'); if (!canvas || canvas.style.display === 'none') { toast('Generate QR first','error'); return; }
      var a = document.createElement('a'); a.download = 'myqer-emergency-qr.png'; a.href = canvas.toDataURL('image/png'); a.click();
      toast('PNG downloaded','success');
    });
    on($('dlSVG'), 'click', function () {
      var urlStr = ($('cardUrl') && $('cardUrl').value) || '';
      if (!urlStr) { toast('Generate QR first','error'); return; }
      ensureQRCodeLib().then(function(){
        var QR = getQRApi();
        if (!QR) throw new Error('QRCode lib not ready');
        return new Promise(function (res, rej) {
          (QR.toString || QR.toString).call(QR, urlStr, { type: 'svg', errorCorrectionLevel: 'H', margin: 1 }, function (e, s) { if (e) rej(e); else res(s); });
        }).then(function (svg) {
          var blob = new Blob([svg], { type: 'image/svg+xml' });
          var a = document.createElement('a');
          a.href = window.URL.createObjectURL(blob); // use global URL explicitly
          a.download = 'myqer-emergency-qr.svg';
          a.click();
          setTimeout(function(){ window.URL.revokeObjectURL(a.href); }, 1000);
          toast('SVG downloaded','success');
        }).catch(function(e){ console.error(e); toast('SVG download failed','error'); });
      });
    });
    on($('printQR'), 'click', function () {
      var canvas = $('qrCanvas'); var code = ($('codeUnderQR') && $('codeUnderQR').textContent) || '';
      if (!canvas || canvas.style.display === 'none' || !code) { toast('Generate QR first','error'); return; }
      var dataUrl = canvas.toDataURL('image/png');
      var w = window.open('', '_blank', 'noopener'); if (!w) { toast('Pop-up blocked','error'); return; }
      w.document.write(
        '<html><head><title>MYQER Emergency Card - ' + code + '</title>' +
        '<meta charset="utf-8"><style>body{font-family:Arial,sans-serif;text-align:center;padding:2rem}.code{font-weight:700;letter-spacing:.06em}img{width:300px;height:300px;image-rendering:pixelated}@media print{@page{size:auto;margin:12mm}}</style></head>' +
        '<body><h1>MYQER™ Emergency Card</h1><p class="code">Code: ' + code + '</p>' +
        '<img alt="QR Code" src="' + dataUrl + '"><p>Scan this QR code for emergency information</p>' +
        '<p style="font-size:.8em;color:#666">www.myqer.com</p><script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script></body></html>'
      );
      w.document.close();
    });
    on($('copyOffline'), 'click', function () {
      var txt = ($('offlineText') && $('offlineText').value) || '';
      if (!txt.trim()) { toast('No offline text to copy','error'); return; }
      navigator.clipboard.writeText(txt).then(function(){ toast('Offline text copied','success'); })
        .catch(function(){ toast('Copy failed','error'); });
    });
    on($('dlOffline'), 'click', function () {
      var txt = ($('offlineText') && $('offlineText').value) || '';
      if (!txt.trim()) { toast('No offline text to download','error'); return; }
      var blob = new Blob([txt], { type: 'text/plain' });
      var a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob); // global URL
      a.download = 'myqer-offline.txt';
      a.click();
      setTimeout(function(){ window.URL.revokeObjectURL(a.href); }, 1000);
      toast('Offline text downloaded','success');
    });
  }

  /* ---------- delete / logout ---------- */
  function deleteAccount() {
    var phrase = (($('deletePhrase') && $('deletePhrase').value) || '').trim().toUpperCase();
    if (phrase !== 'DELETE MY ACCOUNT') { toast('Type the phrase exactly','error'); return; }
    if (!confirm('Are you sure? This permanently deletes your data.')) return;
    (function () {
      if (!(isSupabaseAvailable && isOnline)) return Promise.resolve();
      return getUserId().then(function (uid) {
        if (!uid) return;
        return supabase.from('ice_contacts').delete().eq('user_id', uid)
          .then(function(){ return supabase.from('health_data').delete().eq('user_id', uid); })
          .then(function(){ return supabase.from('profiles').delete().eq('user_id', uid); });
      });
    })().then(function () {
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      location.href = 'index.html';
    }).catch(function (e) { console.error(e); toast('Delete failed','error'); });
  }

  /* ---------- DOM ready ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    updateNetworkStatus();
    window.addEventListener('online',  updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    // binds
    on($('saveProfile'), 'click', saveProfile);
    on($('saveHealth'),  'click', saveHealth);
    on($('saveIce'),     'click', saveICE);
    on($('addIce'),      'click', addIceContact);
    on($('deleteBtn'),   'click', deleteAccount);
    on($('btnSignOut'),  'click', function () {
      (isSupabaseAvailable ? supabase.auth.signOut().catch(function(e){ console.warn(e); }) : Promise.resolve())
        .then(function(){
          location.href = 'index.html';
        });
    });

    // Also listen to auth state to refresh data if session changes without a full reload
    if (isSupabaseAvailable && supabase.auth && supabase.auth.onAuthStateChange) {
      try {
        supabase.auth.onAuthStateChange(function () {
          loadFromServer().then(generateQRCode).catch(function(){});
        });
      } catch (e) { /* noop */ }
    }

    // ICE delegated events
    on($('iceContactsList'), 'input', function (e) {
      var t = e.target, idx = t ? +t.dataset.idx : NaN, field = t ? t.dataset.field : '';
      if (Number.isInteger(idx) && field) updateIceContact(idx, field, t.value);
    });
    on($('iceContactsList'), 'click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null; if (!btn) return;
      var idx = +btn.dataset.idx;
      if (btn.dataset.act === 'del') {
        iceContacts.splice(idx, 1); persistIceLocally(); renderIceContacts();
        saveICEToServer().catch(function(){}); generateQRCode(); toast('Contact removed','success');
      } else if (btn.dataset.act === 'save') {
        saveICE();
      }
    });

    // triage live + override
    ['hfAllergies','hfConditions'].forEach(function(id){ on($(id), 'input', calculateTriage); });
    on($('triageOverride'), 'change', function(){ calculateTriage(); saveHealth(); });

    // autosaves
    ['profileFullName','profileDob','profileCountry','profileHealthId'].forEach(function(id){ setupAutoSave(id, saveProfile); });
    ['hfBloodType','hfAllergies','hfConditions','hfMeds','hfImplants','hfDonor'].forEach(function(id){ setupAutoSave(id, saveHealth); });

    // QR buttons
    wireQRButtons();

    // load sequence
    fillFromLocal();
    generateQRCode();          // draw from local data if possible
    loadFromServer().then(function(){ generateQRCode(); });

    // hide spinner (and a hard failsafe)
    var loading = $('loadingState'); if (loading) loading.style.display = 'none';
    setTimeout(function(){ var l=$('loadingState'); if (l) l.style.display='none'; }, 4000);
  });

  /* ---------- never-stuck loader guards ---------- */
  window.addEventListener('error', function () { var el = $('loadingState'); if (el) el.style.display = 'none'; });
  window.addEventListener('unhandledrejection', function () { var el = $('loadingState'); if (el) el.style.display = 'none'; });

  /* ---------- optional: tiny heartbeat so Safari keeps session alive ---------- */
  setInterval(function(){
    try { navigator.sendBeacon ? navigator.sendBeacon('/ping', '') : null; } catch(e){}
  }, 120000);

})();
