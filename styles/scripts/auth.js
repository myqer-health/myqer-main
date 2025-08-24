// scripts/auth.js
// Tiny auth helper for MYQER forms

(async () => {
  // Load Supabase client from CDN (light and fast)
  if (!window.supabase) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const supabaseUrl = window.MYQER_SUPABASE_URL;
  const supabaseKey = window.MYQER_SUPABASE_ANON;
  const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  // REGISTER
  const regForm = document.getElementById('register-form');
  if (regForm) {
    const fullName = document.getElementById('fullName');
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const ok = document.getElementById('reg-ok');
    const err = document.getElementById('reg-err');

    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      ok.style.display = 'none'; err.style.display = 'none';

      const { data, error } = await supabase.auth.signUp({
        email: email.value.trim(),
        password: password.value,
        options: { data: { full_name: fullName.value.trim() } }
      });

      if (error) {
        err.style.display = 'block';
        err.textContent = `⚠️ ${error.message}`;
        return;
      }
      ok.style.display = 'block';
      regForm.reset();
    });
  }

  // LOGIN
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    const email = document.getElementById('loginEmail');
    const password = document.getElementById('loginPassword');
    const err = document.getElementById('login-err');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.style.display = 'none';

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value
      });

      if (error) {
        err.style.display = 'block';
        err.textContent = `⚠️ ${error.message}`;
        return;
      }
      // Logged in — go to app
      window.location.href = 'app.html';
    });
  }
})();
