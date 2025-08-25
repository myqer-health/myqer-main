import { supabase, APP_URL, RESET_URL } from './config.js';

const byId = (id) => document.getElementById(id);
const toast = (msg, ok = true) => {
  const el = document.querySelector('[data-toast]');
  if (!el) { alert(msg); return; }
  el.textContent = msg;
  el.className = ok ? 'toast ok' : 'toast err';
  el.style.opacity = 1;
  setTimeout(() => (el.style.opacity = 0), 4000);
};

export async function loginWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  location.href = APP_URL;
}

export async function registerWithPassword(email, password, fullName = '') {
  const { error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: APP_URL, data: { full_name: fullName } }
  });
  if (error) throw error;
  toast('Check your email to confirm your account', true);
}

export async function loginWithOAuth(provider) {
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: APP_URL } });
  if (error) throw error;
}

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_URL });
  if (error) throw error;
  toast('Password reset email sent', true);
}

// Attach handlers if forms exist
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = byId('loginForm');
  const registerForm = byId('registerForm');
  const resetForm = byId('resetForm');

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await loginWithPassword(loginForm.email.value, loginForm.password.value);
    } catch (err) { toast(err.message, false); }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await registerWithPassword(
        registerForm.email.value,
        registerForm.password.value,
        registerForm.full_name?.value || ''
      );
    } catch (err) { toast(err.message, false); }
  });

  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await requestPasswordReset(resetForm.email.value);
    } catch (err) { toast(err.message, false); }
  });
});
