// public/scripts/auth.js

const supabase = window.supabase.createClient(
  window.MYQER.SUPABASE_URL,
  window.MYQER.SUPABASE_ANON_KEY
);
window.supabaseClient = supabase; // for other scripts

// ✅ Handle post-email / OAuth redirects and establish a session
(async () => {
  const url = new URL(window.location.href);

  // --- Case A: email magic link (tokens in URL hash) ---
  // e.g. #access_token=...&refresh_token=...&type=signup
  const hash = new URLSearchParams(url.hash.slice(1));
  if (hash.get('access_token') && hash.get('refresh_token')) {
    const { error } = await supabase.auth.setSession({
      access_token: hash.get('access_token'),
      refresh_token: hash.get('refresh_token'),
    });
    if (error) console.error('setSession error:', error);
    // Clean hash so we don’t repeat on refresh
    history.replaceState({}, '', url.origin + url.pathname + url.search);
  }

  // --- Case B: PKCE / OAuth style (?code=...) ---
  if (url.searchParams.get('code')) {
    const { error } = await supabase.auth.exchangeCodeForSession(url.toString());
    if (error) console.error('exchangeCodeForSession error:', error);
    // Clean query
    history.replaceState({}, '', url.origin + url.pathname);
  }

  // Final: do we have a session now?
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error('getSession error:', error);

  if (!session) {
    // Show your login modal / redirect to home with login
    console.warn('No session yet — show login UI');
    // location.href = '/?auth=login';  // enable if you want an auto-bounce
  } else {
    console.log('Signed in as', session.user.email);
    // continue loading the dashboard (QR/profile/etc.)
  }
})();// /public/scripts/auth.js
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
