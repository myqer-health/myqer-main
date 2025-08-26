// /public/scripts/config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// --- Supabase project keys (frontend-safe) ---
export const SUPABASE_URL = 'https://tgddpmxpbgrzrbzpomou.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZGRwbXhwYmdyenJienBvbW91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNDgxMTMsImV4cCI6MjA3MTYyNDExM30.uXntx0rZISv927MQAG1LgGKA-lA08hSkzXMre7Bk2QM';

// --- Single shared client for the whole app ---
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth:  { persistSession: true, storage: window.localStorage },
  global:{ headers: { 'x-myqer-client': 'web' } }
});

// Expose for pages that still expect window._supabase (landing modal)
window._supabase = supabase;

// App URLs used by auth flows
export const APP_URL   = `${location.origin}/dashboard.html`; // redirect after login
export const RESET_URL = `${location.origin}/?type=recovery`;  // index modal handles recovery

// Keep latest access token handy for hooks (optional)
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.access_token && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
    localStorage.setItem('myqer_jwt', session.access_token);
  }
  if (event === 'SIGNED_OUT') {
    localStorage.removeItem('myqer_jwt');
  }
});

// Optional: quick debug handle
window.SUPABASE_URL = SUPABASE_URL;
