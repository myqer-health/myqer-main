<script type="module">
// /scripts/auth.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/scripts/config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Small utilities
const go = (p) => location.replace(p);
export const q  = (sel, root=document) => root.querySelector(sel);

// --- Gate: require a valid session or bounce to login
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) go('/login.html');
  return session;
}

// --- If already logged in, send to app (use on login/register pages)
export async function redirectIfAuthed() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) go('/app.html');
}

// --- Sign out everywhere and send to login
export async function signOutToLogin() {
  await supabase.auth.signOut();
  go('/login.html');
}

// --- Hook: keep pages in sync when session changes
supabase.auth.onAuthStateChange((_event, session) => {
  // If a page cares about auth, it can listen to this event too.
  // We don't redirect here automatically to avoid loops.
});

// --- Password toggle helper (for Show/Hide inside inputs)
export function wirePasswordToggles() {
  document.querySelectorAll('.password-wrapper').forEach(w => {
    const input = q('input', w);
    const btn   = q('.password-toggle', w);
    if (!input || !btn) return;
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });
  });
}
</script>
