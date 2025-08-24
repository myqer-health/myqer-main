// styles/scripts/auth.js
// expects window.MYQER_SUPABASE_URL, window.MYQER_SUPABASE_ANON, window.MYQER_APP_URL

(() => {
  const required = ["MYQER_SUPABASE_URL", "MYQER_SUPABASE_ANON", "MYQER_APP_URL"];
  for (const k of required) {
    if (!window[k]) {
      alert(`Missing ${k} in config.js`);
      return;
    }
  }

  // init Supabase
  const supabase = window.supabase.createClient(
    window.MYQER_SUPABASE_URL,
    window.MYQER_SUPABASE_ANON
  );

  // helpers
  const byId = (id) => document.getElementById(id);
  const show  = (el) => el && (el.style.display = "block");
  const hide  = (el) => el && (el.style.display = "none");

  // --- LOGIN PAGE ---
  const loginForm = byId("login-form");
  if (loginForm) {
    const emailEl = byId("loginEmail");
    const passEl  = byId("loginPassword");
    const errEl   = byId("login-err");
    const okEl    = byId("login-ok");

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hide(errEl); hide(okEl);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailEl.value.trim(),
        password: passEl.value
      });

      if (error) { errEl.textContent = "⚠️ " + error.message; show(errEl); return; }

      show(okEl);
      // optional: store session
      try { localStorage.setItem("myqer_user", JSON.stringify(data.user || {})); } catch {}
      setTimeout(() => { location.href = window.MYQER_APP_URL; }, 600);
    });
  }

  // --- REGISTER PAGE ---
  const regForm = byId("reg-form");
  if (regForm) {
    const nameEl = byId("fullName");
    const emailEl = byId("email");
    const passEl  = byId("password");
    const errEl   = byId("reg-err");
    const okEl    = byId("reg-ok");

    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hide(errEl); hide(okEl);

      const { error } = await supabase.auth.signUp({
        email: emailEl.value.trim(),
        password: passEl.value,
        options: {
          data: { full_name: nameEl.value.trim() || null },
          emailRedirectTo: window.MYQER_RESET_REDIRECT // safe to leave; Supabase uses Site URL for confirm
        }
      });

      if (error) { errEl.textContent = "⚠️ " + error.message; show(errEl); return; }
      okEl.textContent = "✅ Check your email to confirm your account.";
      show(okEl);
    });
  }

  // --- FORGOT PASSWORD LINK (on login page) ---
  const forgotLink = document.querySelector('[data-forgot="1"]');
  if (forgotLink) {
    forgotLink.addEventListener("click", (e) => {
      e.preventDefault();
      const email = byId("loginEmail")?.value.trim();
      location.href = `reset.html${email ? ("?email=" + encodeURIComponent(email)) : ""}`;
    });
  }

})();
