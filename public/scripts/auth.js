// /public/scripts/auth.js
// -----------------------------------------------------------------------------
// MYQER password-only auth (Supabase v2, browser safe)
// Depends on: /public/scripts/config.js  (sets window.MYQER)
//             Supabase UMD bundle        (supabase-js v2.x)
// -----------------------------------------------------------------------------

(() => {
  if (!window.MYQER) {
    console.error('[auth] window.MYQER not found. Load /public/scripts/config.js first.');
  }
  if (!window.supabase) {
    console.error('[auth] Supabase SDK not found. Include the UMD bundle before this script.');
  }

  // -- 1) Client --------------------------------------------------------------
  const { SUPABASE_URL, SUPABASE_ANON_KEY, RENDER_BASE, APP_URL } = window.MYQER;
  const { createClient } = window.supabase;

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  window.sb = sb; // expose globally

  // -- 2) Tiny UI helper (optional toast placeholder) -------------------------
  function showAlert(msg, type = 'info') {
    console.log(`[${type}]`, msg);
    const el = document.getElementById('authAlert');
    if (!el) return;
    el.textContent = msg;
    el.dataset.type = type;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3500);
  }

  // Optional modal helpers (only used if your landing has an auth modal)
  function showAuthView(view) {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${view}`)?.classList.remove('hidden');
  }
  function openModal(view = 'login') {
    const m = document.getElementById('authModal');
    if (!m) return;
    m.classList.remove('hidden');
    showAuthView(view);
  }
  function closeModal() {
    document.getElementById('authModal')?.classList.add('hidden');
  }
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.showAuthView = showAuthView;

  // Show/hide password toggles (if present)
  function wirePasswordToggles() {
    document.querySelectorAll('.password-wrapper').forEach(w => {
      const input = w.querySelector('input[type="password"], input[type="text"]');
      const btn = w.querySelector('.password-toggle');
      if (!input || !btn) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const toPwd = input.type !== 'password';
        input.type = toPwd ? 'password' : 'text';
        btn.textContent = toPwd ? 'Show' : 'Hide';
      });
    });
  }
  document.addEventListener('DOMContentLoaded', wirePasswordToggles);

  // -- 3) High-level auth helpers --------------------------------------------
  async function checkSession() {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) console.error('[auth] getSession error:', error);
    return session ?? null;
  }
  window.checkSession = checkSession;

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      showAlert(error.message || 'Invalid credentials', 'error');
      return false;
    }
    showAlert('Signed in', 'success');
    return true;
  }
  window.signIn = signIn;

  async function signUp(name, email, password) {
    // If email confirmations are ON in Supabase Auth settings, the user
    // will need to confirm before they can sign in.
    const { error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        // Optional: where to send the email-confirmation completion
        emailRedirectTo: `${RENDER_BASE}${APP_URL}`
      }
    });
    if (error) {
      showAlert(error.message || 'Sign up failed', 'error');
      return false;
    }
    showAlert('Account created. Check your email to confirm (if required).', 'success');
    return true;
  }
  window.signUp = signUp;

  async function sendResetEmail(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      // When user clicks the reset link, Supabase will send them here to set a new password
      redirectTo: `${RENDER_BASE}${APP_URL}`
    });
    if (error) {
      showAlert(error.message || 'Could not send reset email', 'error');
      return false;
    }
    showAlert('Password reset email sent.', 'success');
    return true;
  }
  window.sendResetEmail = sendResetEmail;

  async function updatePassword(newPassword) {
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) {
      showAlert(error.message || 'Failed to update password', 'error');
      return false;
    }
    showAlert('Password updated successfully', 'success');
    return true;
  }
  window.updatePassword = updatePassword;

  async function signOutToLogin() {
    await sb.auth.signOut();
    if (location.pathname.endsWith('/dashboard.html')) {
      location.href = '/?login';
    } else {
      location.reload();
    }
  }
  window.signOutToLogin = signOutToLogin;

  // Debug: log auth state transitions
  sb.auth.onAuthStateChange((_event, session) => {
    console.log('[auth] state change → session?', !!session);
  });

  // -- 4) Wire common buttons if present -------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);

    // Create account
    $('doRegister')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const name     = $('registerName')?.value?.trim() || '';
      const email    = $('registerEmail')?.value?.trim() || '';
      const password = $('registerPassword')?.value || '';
      const ok = await window.signUp(name, email, password);
      if (ok) closeModal();
    });

    // Sign in with password
    $('doLogin')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const email    = $('loginEmail')?.value?.trim() || '';
      const password = $('loginPassword')?.value || '';
      const ok = await window.signIn(email, password);
      if (ok) window.location.href = window.MYQER.APP_URL;
    });

    // Send password reset email
    $('doSendReset')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = $('resetEmail')?.value?.trim() || '';
      await window.sendResetEmail(email);
    });

    // Update password (if you have a form for it on the dashboard)
    $('doUpdate')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const pass = $('updatePassword')?.value || '';
      const ok = await window.updatePassword(pass);
      if (ok) window.location.href = window.MYQER.APP_URL;
    });

    // “Open App” buttons: go to dashboard if authed; else open login modal
    const openOrLogin = async () => {
      const session = await window.checkSession?.();
      if (session) window.location.href = window.MYQER.APP_URL;
      else openModal('login');
    };
    $('btnOpenApp')?.addEventListener('click', (e) => { e.preventDefault(); openOrLogin(); });
    $('btnOpenAppHero')?.addEventListener('click', (e) => { e.preventDefault(); openOrLogin(); });
  });
})();
