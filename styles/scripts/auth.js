// styles/scripts/auth.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(window.MYQER_SUPABASE_URL, window.MYQER_SUPABASE_ANON);

// ---------- Login ----------
async function loginUser(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// ---------- Register ----------
async function registerUser(fullName, email, password) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
}

// Wire up forms on any page that has them
document.addEventListener('DOMContentLoaded', () => {
  // LOGIN
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    const emailEl = document.getElementById('loginEmail');
    const passEl  = document.getElementById('loginPassword');
    const btn     = document.getElementById('loginBtn');
    const errBox  = document.getElementById('login-err');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      btn.disabled = true;

      try {
        await loginUser(emailEl.value.trim(), passEl.value);
        // go to app
        window.location.href = 'app.html';
      } catch (err) {
        errBox.textContent = `⚠️ ${err.message}`;
        errBox.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    });
  }

  // REGISTER (works for register.html with these IDs)
  const regForm = document.getElementById('register-form');
  if (regForm) {
    const nameEl = document.getElementById('fullName');
    const emailEl = document.getElementById('registerEmail');
    const passEl  = document.getElementById('registerPassword');
    const btn = document.getElementById('registerBtn');
    const ok = document.getElementById('register-ok');
    const err = document.getElementById('register-err');

    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      ok.style.display = 'none';
      err.style.display = 'none';
      btn.disabled = true;

      try {
        await registerUser(nameEl.value.trim(), emailEl.value.trim(), passEl.value);
        ok.textContent = '✅ Check your email to confirm your account.';
        ok.style.display = 'block';
        regForm.reset();
      } catch (ex) {
        err.textContent = `⚠️ ${ex.message}`;
        err.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    });
  }
});
