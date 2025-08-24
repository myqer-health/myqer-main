// styles/scripts/reset.js
// Needs window.MYQER_SUPABASE_URL, window.MYQER_SUPABASE_ANON, window.MYQER_RESET_REDIRECT from config.js

const supabase = window.supabase.createClient(
  window.MYQER_SUPABASE_URL,
  window.MYQER_SUPABASE_ANON
);

// UI bits
const emailEl = document.getElementById('resetEmail');
const newPwEl = document.getElementById('newPassword');

const resetErr = document.getElementById('reset-err');
const resetOk  = document.getElementById('reset-ok');

const setErr = document.getElementById('set-err');
const setOk  = document.getElementById('set-ok');

function show(el, msg='') { if (msg) el.textContent = msg; el.style.display = 'block'; }
function hide(...els) { els.forEach(e => e && (e.style.display = 'none')); }

// --- A) Send reset link ---
document.getElementById('reset-request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hide(resetErr, resetOk);

  const email = (emailEl.value || '').trim();
  if (!email) return show(resetErr, '⚠️ Please enter your email.');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.MYQER_RESET_REDIRECT
  });

  if (error) return show(resetErr, '⚠️ ' + error.message);
  show(resetOk, '✅ Check your inbox for the reset link.');
});

// --- B) Handle returning from email link & update password ---
(async () => {
  // Supabase V2 sends `?code=...` (PKCE). Some older flows use hash tokens. Support both.
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');

  // If we have a code, exchange it for a session so updateUser can run
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      show(setErr, '⚠️ Session exchange failed: ' + error.message);
      return;
    }
  }

  // Enable the "Update password" form only if we have a session (either through code above,
  // or the user was already signed in).
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // No session yet—user just opened the page directly. That’s fine;
    // they can still use the top form to request a link.
    return;
  }

  // Wire the submit for setting a new password
  document.getElementById('set-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hide(setErr, setOk);

    const newPw = (newPwEl.value || '').trim();
    if (newPw.length < 8) return show(setErr, '⚠️ Use at least 8 characters.');

    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) return show(setErr, '⚠️ ' + error.message);

    show(setOk, '✅ Password updated. Redirecting to sign in…');
    setTimeout(() => (window.location.href = 'login.html'), 900);
  }, { once: true });
})();
