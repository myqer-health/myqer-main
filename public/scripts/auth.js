// /public/scripts/auth.js
import { supabase, APP_URL } from '/scripts/config.js';

// Small utilities…

// Require a valid session (used by protected pages like dashboard.html)
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) go('/?auth=signin'); // open pretty modal on landing
  return session;
}

// If already logged in, send to dashboard (use on landing-only pages if you want)
export async function redirectIfAuthed() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) go(APP_URL); // /dashboard.html
}

// Sign out then return to landing with sign-in modal open
export async function signOutToLogin() {
  await supabase.auth.signOut();
  go('/?auth=signin');
}

// Pages can listen too if they need; no auto-redirects here
supabase.auth.onAuthStateChange((_event, _session) => {});

// Password toggle helper
export function wirePasswordToggles() {
  document.querySelectorAll('.password-wrapper').forEach(wrap => {
    const input = q('input', wrap);
    const btn   = q('.password-toggle', wrap);
    if (!input || !btn) return;
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      const toPwd = input.type !== 'password';
      input.type = toPwd ? 'password' : 'text';
      btn.textContent = toPwd ? 'Show' : 'Hide';
    });
  });
}
