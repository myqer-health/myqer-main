// styles/scripts/auth.js
// Uses Supabase directly from the browser.
// Needs window.MYQER_SUPABASE_URL and window.MYQER_SUPABASE_ANON from config.js

// 1) Bootstrap supabase client
const supabase = window.supabase.createClient(
  window.MYQER_SUPABASE_URL,
  window.MYQER_SUPABASE_ANON
);

// 2) Helpers for UI alerts
function show(el, text) {
  if (!el) return;
  if (text) el.textContent = text;
  el.style.display = "block";
}
function hide(el) {
  if (!el) return;
  el.style.display = "none";
}

// 3) SIGN IN form (login.html)
(() => {
  const form = document.getElementById("login-form");
  if (!form) return;

  const emailEl = document.getElementById("loginEmail");
  const passEl  = document.getElementById("loginPassword");
  const errEl   = document.getElementById("login-err");
  const okEl    = document.getElementById("login-ok");
  const toggle  = document.getElementById("togglePw");

  if (toggle && passEl) {
    toggle.onclick = () => {
      const t = passEl.type === "password" ? "text" : "password";
      passEl.type = t;
      toggle.textContent = t === "text" ? "Hide" : "Show";
    };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide(errEl); hide(okEl);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailEl.value.trim(),
        password: passEl.value
      });
      if (error) throw error;
      show(okEl, "Signed in — redirecting…");
      setTimeout(() => location.href = window.MYQER_APP_URL || "/app.html", 600);
    } catch (err) {
      show(errEl, "⚠️ " + (err.message || "Sign in failed"));
    }
  });
})();

// 4) REGISTER form (register.html)
(() => {
  const form = document.getElementById("reg-form");
  if (!form) return;

  const nameEl = document.getElementById("fullName");
  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const errEl = document.getElementById("reg-err");
  const okEl  = document.getElementById("reg-ok");
  const toggle = document.getElementById("togglePw");

  if (toggle && passEl) {
    toggle.onclick = () => {
      const t = passEl.type === "password" ? "text" : "password";
      passEl.type = t;
      toggle.textContent = t === "text" ? "Hide" : "Show";
    };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide(errEl); hide(okEl);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailEl.value.trim(),
        password: passEl.value,
        options: {
          data: { full_name: nameEl.value.trim() }
        }
      });
      if (error) throw error;
      show(okEl, "✅ Check your email to confirm your account.");
    } catch (err) {
      show(errEl, "⚠️ " + (err.message || "Couldn’t create account"));
    }
  });
})();
