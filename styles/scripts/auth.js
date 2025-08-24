// Requires the Supabase CDN script on each page (see the HTML pages below)
const supabase = (() => {
  return window.supabase.createClient(
    window.MYQER_SUPABASE_URL,
    window.MYQER_SUPABASE_ANON
  );
})();

function show(el, on = true){ if(el){ el.style.display = on ? 'block' : 'none'; } }

// ---- LOGIN ----
const loginForm = document.querySelector('#login-form');
if (loginForm){
  const email = document.querySelector('#loginEmail');
  const pass  = document.querySelector('#loginPassword');
  const okEl  = document.querySelector('#login-ok');
  const errEl = document.querySelector('#login-err');

  loginForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); show(errEl,false); show(okEl,false);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: pass.value
    });
    if (error){ errEl.textContent = '⚠️ ' + error.message; show(errEl,true); return; }
    show(okEl,true);
    setTimeout(()=> location.href = window.MYQER_APP_URL || '/app.html', 500);
  });
}

// ---- REGISTER ----
const regForm = document.querySelector('#reg-form');
if (regForm){
  const name = document.querySelector('#fullName');
  const email = document.querySelector('#email');
  const pass  = document.querySelector('#password');
  const okEl  = document.querySelector('#reg-ok');
  const errEl = document.querySelector('#reg-err');

  regForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); show(errEl,false); show(okEl,false);
    const { error } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: pass.value,
      options: {
        data: { full_name: name.value.trim() },
        emailRedirectTo: window.MYQER_RESET_REDIRECT || (location.origin + '/reset.html')
      }
    });
    if (error){ errEl.textContent = '⚠️ ' + error.message; show(errEl,true); return; }
    okEl.textContent = '✅ Check your email to confirm your account.'; show(okEl,true);
  });
}

// ---- RESET (send email) ----
const resetReqForm = document.querySelector('#reset-request-form');
if (resetReqForm){
  const email = document.querySelector('#resetEmail');
  const okEl  = document.querySelector('#reset-ok');
  const errEl = document.querySelector('#reset-err');

  resetReqForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); show(errEl,false); show(okEl,false);
    const { error } = await supabase.auth.resetPasswordForEmail(email.value.trim(), {
      redirectTo: window.MYQER_RESET_REDIRECT || (location.origin + '/reset.html')
    });
    if (error){ errEl.textContent = '⚠️ ' + error.message; show(errEl,true); return; }
    okEl.textContent = '✅ Check your inbox for the reset link.'; show(okEl,true);
  });
}

// ---- RESET (set new password on reset.html) ----
const setForm = document.querySelector('#set-password-form');
if (setForm){
  const newPw = document.querySelector('#newPassword');
  const okEl  = document.querySelector('#set-ok');
  const errEl = document.querySelector('#set-err');

  // When arriving from email link, Supabase sets a "recovery" session automatically.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      document.body.classList.add('ready');  // (optional) if you want to reveal UI
    }
  });

  setForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); show(errEl,false); show(okEl,false);
    const { error } = await supabase.auth.updateUser({ password: newPw.value });
    if (error){ errEl.textContent = '⚠️ ' + error.message; show(errEl,true); return; }
    okEl.textContent = '✅ Password updated. You can now sign in.'; show(okEl,true);
    setTimeout(()=> location.href='/login.html', 900);
  });
}

// ---- DASHBOARD GUARD + SIGN OUT ----
window.myqerRequire = async function(){
  const { data:{ session } } = await supabase.auth.getSession();
  if (!session) location.href = '/login.html';
  return session;
};

window.myqerSignOut = async function(){
  await supabase.auth.signOut();
  location.href = '/login.html';
};
