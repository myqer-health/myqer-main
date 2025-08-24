// styles/scripts/reset.js
// Needs: window.MYQER_SUPABASE_URL, window.MYQER_SUPABASE_ANON, window.MYQER_RESET_REDIRECT

const supabase = supabase.createClient(
  window.MYQER_SUPABASE_URL,
  window.MYQER_SUPABASE_ANON
);

// els
const emailEl = document.getElementById('resetEmail');
const newPwEl = document.getElementById('newPassword');
const resetErr = document.getElementById('reset-err');
const resetOk  = document.getElementById('reset-ok');
const setErr   = document.getElementById('set-err');
const setOk    = document.getElementById('set-ok');

// show/hide new password
document.getElementById('togglePw').onclick = () => {
  const t = newPwEl.type === 'password' ? 'text' : 'password';
  newPwEl.type = t;
  document.getElementById('togglePw').textContent = (t==='text'?'Hide':'Show');
};

// Step A: send reset email
document.getElementById('reset-request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  resetErr.style.display = 'none';
  resetOk.style.display  = 'none';

  const redirectTo = window.MYQER_RESET_REDIRECT || (location.origin + '/reset.html');

  const { error } = await supabase.auth.resetPasswordForEmail(emailEl.value.trim(), {
    redirectTo
  });

  if (error) {
    resetErr.textContent = '⚠️ ' + (error.message || 'Could not send reset link.');
    resetErr.style.display = 'block';
  } else {
    resetOk.style.display = 'block';
  }
});

// Step B: if we arrive from the email link, Supabase puts a recovery session in memory.
// show a hint by trying to set a password; if token missing, we’ll get a specific error.
document.getElementById('set-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setErr.style.display = 'none';
  setOk.style.display  = 'none';

  const { error } = await supabase.auth.updateUser({ password: newPwEl.value });

  if (error) {
    // The most common cause is opening reset.html directly without the email token.
    setErr.textContent = '⚠️ ' + (error.message || 'Could not update password. Open this page from the email link.');
    setErr.style.display = 'block';
  } else {
    setOk.style.display = 'block';
    setTimeout(() => location.href = 'login.html', 800);
  }
});
