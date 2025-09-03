<script type="module">
// ============================
// MYQER Auth (email + password)
// ============================

// 1) Create client
const supabase = window.supabase.createClient(
  window.MYQER.SUPABASE_URL,
  window.MYQER.SUPABASE_ANON_KEY
);
window.supabaseClient = supabase; // expose for other scripts

// ---------- Small helpers ----------
const go = (p) => window.location.assign(p);
export const q = (sel, root = document) => root.querySelector(sel);

// 2) Handle special links from Supabase emails
//    A) ?code=...  (PKCE confirm / recovery)
//    B) #access_token=... (rare in v2, but harmless to support)
(async () => {
  const url = new URL(window.location.href);

  // A) PKCE code in query (confirm / OAuth / recovery)
  if (url.searchParams.get('code')) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(url.toString());
      if (error) console.error('exchangeCodeForSession:', error);
    } catch (e) {
      console.error('PKCE exchange failed:', e);
    } finally {
      history.replaceState({}, '', url.origin + url.pathname);
    }
  }

  // B) Hash tokens (legacy magic link)
  if (url.hash.includes('access_token=') && url.hash.includes('refresh_token=')) {
    const hash = new URLSearchParams(url.hash.slice(1));
    try {
      const { error } = await supabase.auth.setSession({
        access_token: hash.get('access_token'),
        refresh_token: hash.get('refresh_token'),
      });
      if (error) console.error('setSession:', error);
    } catch (e) {
      console.error('setSession failed:', e);
    } finally {
      history.replaceState({}, '', url.origin + url.pathname + url.search);
    }
  }
})();

// 3) Email + password flows
export async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // after clicking "Confirm", bring them to the dashboard
    options: { emailRedirectTo: `${location.origin}${window.MYQER.APP_URL}` }
  });
  if (error) throw error;
  return data;
}

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutToLogin() {
  await supabase.auth.signOut();
  go(`/?${window.MYQER.AUTH_QUERY}`);
}

export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) go(`/?${window.MYQER.AUTH_QUERY}`);
  return session;
}

export async function redirectIfAuthed() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) go(window.MYQER.APP_URL);
}

// 4) Password reset (forgot + set new password)
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${window.MYQER.APP_URL}`
  });
  if (error) throw error;
}

// If the user just arrived via a recovery link, prompt for new password.
(async () => {
  const url = new URL(window.location.href);
  if (url.hash.includes('type=recovery')) {
    const newPass = prompt('Set a new password:');
    if (newPass) {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) alert(error.message);
      else alert('Password updated. Please sign in with the new password.');
    }
    history.replaceState({}, '', url.origin + url.pathname);
  }
})();

// 5) Optional UI sugar
export function wirePasswordToggles() {
  document.querySelectorAll('.password-wrapper').forEach(w => {
    const input = q('input', w);
    const btn   = q('.password-toggle', w);
    if (!input || !btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const toPwd = input.type !== 'password';
      input.type = toPwd ? 'password' : 'text';
      btn.textContent = toPwd ? 'Show' : 'Hide';
    });
  });
}

// 6) Debug: observe session changes (safe to keep)
supabase.auth.onAuthStateChange((_e, sess) => {
  console.log('Auth state changed → session?', !!sess);
});

// 7) Expose for inline handlers if needed
window.MYQER_AUTH = {
  signUpWithPassword,
  signInWithPassword,
  sendPasswordReset,
  signOutToLogin,
  requireAuth,
  redirectIfAuthed,
  wirePasswordToggles
};
</script>
