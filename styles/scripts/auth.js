// Shared auth handlers for login/register/reset pages
const sb = supabase.createClient(window.MYQER_SUPABASE_URL, window.MYQER_SUPABASE_ANON);

// UTIL
const $ = (sel) => document.querySelector(sel);

// Page: login.html
(function () {
  const form = $('#login-form'); if (!form) return;
  const emailEl = $('#loginEmail'); const pwEl = $('#loginPassword');
  const err = $('#login-err'); const ok = $('#login-ok');
  $('#togglePw').onclick = () => { pwEl.type = (pwEl.type === 'password' ? 'text':'password'); $('#togglePw').textContent = pwEl.type==='text'?'Hide':'Show'; };
  form.addEventListener('submit', async (e)=>{
    e.preventDefault(); err.style.display='none'; ok.style.display='none';
    const { data, error } = await sb.auth.signInWithPassword({ email: emailEl.value.trim(), password: pwEl.value });
    if (error){ err.textContent = '⚠️ ' + error.message; err.style.display='block'; return; }
    ok.style.display='block'; setTimeout(()=>location.href = window.MYQER_APP_URL, 600);
  });
})();

// Page: register.html
(function () {
  const form = $('#reg-form'); if (!form) return;
  const nameEl = $('#fullName'); const emailEl = $('#email'); const pwEl = $('#password');
  const err = $('#reg-err'); const ok = $('#reg-ok');
  $('#togglePw').onclick = () => { pwEl.type = (pwEl.type === 'password' ? 'text':'password'); $('#togglePw').textContent = pwEl.type==='text'?'Hide':'Show'; };
  form.addEventListener('submit', async (e)=>{
    e.preventDefault(); err.style.display='none'; ok.style.display='none';
    const { error } = await sb.auth.signUp({
      email: emailEl.value.trim(),
      password: pwEl.value,
      options: { data: { full_name: nameEl.value.trim() }, emailRedirectTo: window.MYQER_RESET_REDIRECT }
    });
    if (error){ err.textContent = '⚠️ ' + error.message; err.style.display='block'; return; }
    ok.style.display='block';
  });
})();

// Page: reset.html
(function () {
  const reqForm = $('#reset-request-form'); if (!reqForm) return;
  const setForm = $('#set-password-form');
  const emailEl = $('#resetEmail'); const newPwEl = $('#newPassword');
  const reqErr = $('#reset-err'), reqOk = $('#reset-ok');
  const setErr = $('#set-err'), setOk = $('#set-ok');
  $('#togglePw').onclick = () => { newPwEl.type = (newPwEl.type === 'password' ? 'text':'password'); $('#togglePw').textContent = newPwEl.type==='text'?'Hide':'Show'; };

  reqForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); reqErr.style.display='none'; reqOk.style.display='none';
    const { error } = await sb.auth.resetPasswordForEmail(emailEl.value.trim(), { redirectTo: window.MYQER_RESET_REDIRECT });
    if (error){ reqErr.textContent = '⚠️ ' + error.message; reqErr.style.display='block'; return; }
    reqOk.style.display='block';
  });

  setForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); setErr.style.display='none'; setOk.style.display='none';
    const { error } = await sb.auth.updateUser({ password: newPwEl.value });
    if (error){ setErr.textContent = '⚠️ ' + (error.message || 'Open this page from the email link.'); setErr.style.display='block'; return; }
    setOk.style.display='block'; setTimeout(()=>location.href='login.html',700);
  });
})();
