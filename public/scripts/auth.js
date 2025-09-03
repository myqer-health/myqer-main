// public/scripts/auth.js

// --- 1) Supabase client ------------------------------------------
const supabase = window.supabase.createClient(
  window.MYQER.SUPABASE_URL,
  window.MYQER.SUPABASE_ANON_KEY
);
window.supabaseClient = supabase; // expose to other scripts

// --- 2) Small UI helpers (alerts + modal show/hide) ---------------
function showAlert(msg, type = 'info') {
  // Minimal toast; replace with your own if you have one
  console.log(`[${type}]`, msg);
  try {
    const el = document.getElementById('authAlert');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3500);
  } catch {}
}

// Modal helpers (used by inline JS in index.html)
function showAuthView(view) {
  // views are the <div id="view-login">, <div id="view-register">, <div id="view-reset">
  document.querySelectorAll('.auth-view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.remove('hidden');
}
function openModal(view = 'login') {
  const m = document.getElementById('authModal');
  if (!m) return;
  m.classList.remove('hidden');
  showAuthView(view);
}
function closeModal() {
  const m = document.getElementById('authModal');
  if (!m) return;
  m.classList.add('hidden');
}

// Make modal helpers callable from inline scripts
window.openModal = openModal;
window.closeModal = closeModal;
window.showAuthView = showAuthView;

// Optional: password “show/hide” toggles inside modal
function wirePasswordToggles() {
  document.querySelectorAll('.password-wrapper').forEach(w => {
    const input = w.querySelector('input');
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

// --- 3) Redirect handlers (magic-link hash or PKCE code) ----------
(async () => {
  const url = new URL(window.location.href);

  // Case A: magic-link sent by Supabase — tokens in the URL hash
  // e.g. https://myqer.com/#access_token=...&refresh_token=...&type=signup
  const hash = new URLSearchParams(url.hash.slice(1));
  const access = hash.get('access_token');
  const refresh = hash.get('refresh_token');

  if (access && refresh) {
    const { error } = await supabase.auth.setSession({
      access_token: access,
      refresh_token: refresh,
    });
    if (error) console.error('setSession error:', error);
    // Clean the hash so we don’t repeat on refresh
    history.replaceState({}, '', url.origin + url.pathname + url.search);
  }

  // Case B: PKCE flow (?code=…) (some templates / providers use this)
  if (url.searchParams.get('code')) {
    const { error } = await supabase.auth.exchangeCodeForSession(url.toString());
    if (error) console.error('exchangeCodeForSession error:', error);
    // Clean query string
    history.replaceState({}, '', url.origin + url.pathname);
  }
})();

// --- 4) High-level auth helpers you can call from buttons ---------
async function checkSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error('getSession error:', error);
  return session ?? null;
}
window.checkSession = checkSession;

async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showAlert(error.message || 'Invalid credentials', 'error');
    return false;
  }
  showAlert('Signed in', 'success');
  return true;
}
window.signIn = signIn;

async function signUp(name, email, password) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });
  if (error) {
    showAlert(error.message || 'Sign up failed', 'error');
    return false;
  }
  showAlert('Check your email to confirm your account.', 'success');
  return true;
}
window.signUp = signUp;

async function sendResetEmail(email) {
  // Supabase will send a password reset email; the link returns to your Site URL
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin // fine for static sites
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
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    showAlert(error.message || 'Failed to update password', 'error');
    return false;
  }
  showAlert('Password updated successfully', 'success');
  return true;
}
window.updatePassword = updatePassword;

async function signOutToLogin() {
  await supabase.auth.signOut();
  // On landing page, you open the modal; on dashboard you may redirect:
  if (location.pathname.endsWith('/dashboard.html')) {
    location.href = '/?login';
  }
}
window.signOutToLogin = signOutToLogin;

// Keep a log (handy when debugging)
supabase.auth.onAuthStateChange((_e, s) => {
  console.log('Auth state changed — has session?', !!s);
});
// --- 5) Bind landing modal buttons by ID (so index.html doesn't need extra code)
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // Create account
  $('doRegister')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const name     = $('registerName')?.value?.trim() || '';
    const email    = $('registerEmail')?.value?.trim() || '';
    const password = $('registerPassword')?.value || '';
    console.log('[auth] doRegister clicked', { email });
    const ok = await window.signUp(name, email, password);
    if (ok) window.closeModal?.();
  });

  // Sign in
  $('doLogin')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email    = $('loginEmail')?.value?.trim() || '';
    const password = $('loginPassword')?.value || '';
    console.log('[auth] doLogin clicked', { email });
    const ok = await window.signIn(email, password);
    if (ok) window.location.href = '/dashboard.html';
  });

  // Send password reset email
  $('doSendReset')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = $('resetEmail')?.value?.trim() || '';
    console.log('[auth] doSendReset clicked', { email });
    await window.sendResetEmail(email);
  });

  // Update password (optional "new password" view)
  $('doUpdate')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const pass = $('updatePassword')?.value || '';
    console.log('[auth] doUpdate clicked');
    const ok = await window.updatePassword(pass);
    if (ok) window.location.href = '/dashboard.html';
  });

  // “Open App” buttons: go to dashboard if authed; else open login modal
  const wireOpen = async () => {
    const session = await window.checkSession?.();
    if (session) window.location.href = '/dashboard.html';
    else window.openModal?.('login');
  };
  document.getElementById('btnOpenApp')?.addEventListener('click', (e) => { e.preventDefault(); wireOpen(); });
  document.getElementById('btnOpenAppHero')?.addEventListener('click', (e) => { e.preventDefault(); wireOpen(); });
});
