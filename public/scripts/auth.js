<script type="module">
  import { supabase, APP_URL, RESET_URL } from './config.js';

  const byId = (id) => document.getElementById(id);
  const toast = (msg, ok = true) => {
    const el = document.querySelector('[data-toast]'); if (!el) return alert(msg);
    el.textContent = msg; el.className = ok ? 'toast ok' : 'toast err'; el.style.opacity = 1;
    setTimeout(() => (el.style.opacity = 0), 4000);
  };

  export async function loginWithPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    location.href = APP_URL;
    return data;
  }

  export async function registerWithPassword(email, password, fullName = '') {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: APP_URL, data: { full_name: fullName } }
    });
    if (error) throw error;
    return data;
  }

  export async function loginWithOAuth(provider) {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: APP_URL } });
    if (error) throw error;
    return data;
  }

  export async function requestPasswordReset(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_URL });
    if (error) throw error;
    return data;
  }

  async function maybeHandleRecovery() {
    const { data: { session } } = await supabase.auth.getSession();
    const hashHasToken = location.hash.includes('access_token');
    if (hashHasToken || session) {
      const form = byId('newPasswordForm'); if (form) form.style.display = 'block';
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPass = byId('newPassword').value;
        if (!newPass || newPass.length < 8) return toast('Password must be at least 8 chars', false);
        const { error } = await supabase.auth.updateUser({ password: newPass });
        if (error) return toast(error.message, false);
        toast('Password updated. Redirecting…', true);
        setTimeout(()=> location.href = APP_URL, 800);
      }, { once: true });
    }
  }

  (function bindAuthForms(){
    const loginForm = byId('loginForm');
    const registerForm = byId('registerForm');
    const resetForm = byId('resetForm');

    loginForm?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      try { await loginWithPassword(loginForm.email.value, loginForm.password.value); }
      catch(err){ toast(err.message, false); }
    });

    registerForm?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      try {
        await registerWithPassword(registerForm.email.value, registerForm.password.value, registerForm.full_name.value);
        toast('Check your inbox to confirm your email.', true);
      } catch(err){ toast(err.message, false); }
    });

    resetForm?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      try {
        await requestPasswordReset(resetForm.email.value);
        const ok = byId('resetOk'); if (ok) ok.style.display = 'block';
      } catch(err){ toast(err.message, false); }
    });

    document.querySelector('[data-oauth="google"]')?.addEventListener('click', ()=> loginWithOAuth('google'));
    document.querySelector('[data-oauth="apple"]')?.addEventListener('click', ()=> loginWithOAuth('apple'));
    document.querySelector('[data-oauth="facebook"]')?.addEventListener('click', ()=> loginWithOAuth('facebook'));

    if (location.pathname.endsWith('/reset.html')) maybeHandleRecovery();
  })();
</script>
