// /public/scripts/auth.js
const supabase = window.supabase.createClient(
  window.MYQER.SUPABASE_URL,
  window.MYQER.SUPABASE_ANON_KEY
);
window.supabaseClient = supabase; // expose for other scripts
// ⬇️ ADD THIS BLOCK RIGHT HERE
(async () => {
  // If the confirm link contained a PKCE code, exchange it for a session
  const url = new URL(window.location.href);
  if (url.searchParams.get('code')) {
    const { error } = await window.supabaseClient.auth.exchangeCodeForSession(window.location.href);
    if (error) console.error('exchangeCodeForSession error:', error);
    // Clean the query string so refresh doesn't re-exchange
    history.replaceState({}, '', url.origin + url.pathname);
  }
})();

// --- Small utilities
const go = (p) => window.location.replace(p);
export const q = (sel, root = document) => root.querySelector(sel);

// --- Gate: require a valid session or bounce to landing modal sign-in
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) go(`/?${AUTH_QUERY}`);
  return session;
}

// --- If already logged in, send to the dashboard (use on landing-only pages if needed)
export async function redirectIfAuthed() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) go(APP_URL);
}

// --- Sign out and send to landing with sign-in modal
export async function signOutToLogin() {
  await supabase.auth.signOut();
  go(`/?${AUTH_QUERY}`);
}

// --- Hook: pages can listen too if needed (no auto-redirects here to avoid loops)
supabase.auth.onAuthStateChange((_event, _session) => {
  // Intentionally empty
});

// --- Password toggle helper (for Show/Hide inside inputs)
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
