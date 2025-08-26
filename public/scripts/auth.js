// /public/scripts/auth.js
import { supabase, APP_URL } from '/scripts/config.js';

// --- Small utilities
const go = (p) => window.location.replace(p);
export const q = (sel, root = document) => root.querySelector(sel);

// --- Gate: require a valid session or bounce to landing modal sign-in
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) go('/?auth=signin');
  return session;
}

// --- If already logged in, send to the dashboard (use on landing-only pages if needed)
export async function redirectIfAuthed() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) go(APP_URL); // APP_URL is /dashboard.html in config.js
}

// --- Sign out and send to landing with sign-in modal
export async function signOutToLogin() {
  await supabase.auth.signOut();
  go('/?auth=signin');
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
