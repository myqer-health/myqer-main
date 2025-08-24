// scripts/auth.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Grab config from config.js
const supabase = createClient(window.MYQER_SUPABASE_URL, window.MYQER_SUPABASE_ANON);

// ===== SIGN UP =====
async function registerUser(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: { data: { full_name: fullName } }
  });
  if (error) {
    alert(error.message);
  } else {
    alert("✅ Check your email to confirm your account!");
  }
}

// ===== LOGIN =====
async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    alert(error.message);
  } else {
    window.location.href = "app.html"; // send them to app after login
  }
}

// ===== HOOK UP FORMS =====
document.addEventListener("DOMContentLoaded", () => {
  const regForm = document.getElementById("register-form");
  if (regForm) {
    regForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fullName = document.getElementById("fullName").value;
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      registerUser(email, password, fullName);
    });
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      loginUser(email, password);
    });
  }
});
