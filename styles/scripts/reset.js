// styles/scripts/reset.js
// Requires: config.js with MYQER_SUPABASE_URL, MYQER_SUPABASE_ANON, MYQER_RESET_REDIRECT
const supabase = supabasejs.createClient(
  window.MYQER_SUPABASE_URL,
  window.MYQER_SUPABASE_ANON
);

// Elements
const emailEl = document.getElementById('resetEmail');
const newPwEl = document.getElementById('newPassword');

const resetErr = document.getElementById('reset-err');
const resetOk  = document.getElementById('reset-ok');
const setErr   = document.getElementById('set-err');
const setOk    = document.getElementById('set-ok');

// Toggle password visibility
document.getElementById('togglePw').onclick = () => {
  const t = newPwEl.type === 'password' ? 'text' : 'password';
  newPwEl.type = t;
  document.getElementById('togglePw').textContent = (t === 'text' ? 'Hide' : 'Show');
};

// STEP A: Send reset link
document.getElementById('reset-request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  resetErr.style.display = 'none';
  resetOk.style.display = 'none';

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(emailEl.value.trim(), {
      redirectTo: window.MYQER_RESET_REDIRECT   // e.g. https://myqer.com/reset.html
    });
    if (error) throw error;

    resetOk.style.display = 'block';
  } catch (err) {
    resetErr.textContent = '⚠️ ' + (err.message || 'Could not send reset email.');
    resetErr.style.display = 'block';
  }
});

// STEP B: If the user arrived from the email link, allow password update
document.getElementById('set-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setErr.style.display = 'none';
  setOk.style.display  = 'none';

  try {
    // Supabase v2: if the URL contains a recovery token, the SDK can pick it up
    // Some tenants need this explicit exchange for session:
    // (harmless if not needed—will just no-op if there’s no code in URL)
    try {
      await supabase.auth.exchangeCodeForSession(window.location.href);
    } catch (_) {}

    const { error } = await supabase.auth.updateUser({ password: newPwEl.value });
    if (error) throw error;

    setOk.style.display = 'block';
    setTimeout(() => location.href = 'login.html', 800);
  } catch (err) {
    setErr.textContent = '⚠️ ' + (err.message || 'Could not update password.');
    setErr.style.display = 'block';
  }
});

// Optional: if URL looks like a recovery (after clicking the email), auto-scroll to Step B
(function autoFocusStepB() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('type') === 'recovery' || url.hash.includes('access_token')) {
    document.getElementById('newPassword').focus();
    // (You could also auto-hide Step A here if you want)
  }
})();
