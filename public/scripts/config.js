// /public/scripts/config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// /public/scripts/config.js
window.MYQER = {
  SUPABASE_URL: 'https://dmntmhkncldgynufajei.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtbnRtaGtuY2xkZ3ludWZhamVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MzQ2MzUsImV4cCI6MjA3MjQxMDYzNX0.6DzOSb0xu5bp4g2wKy3SNtEEuSQavs_ohscyawvPmrY',
  RENDER_BASE: 'https://www.myqer.com' // used to build short QR URLs
};
// Shared client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth:   { persistSession: true, storage: window.localStorage },
  global: { headers: { 'x-myqer-client': 'web' } }
});

// App URLs (used by auth flows)
export const APP_URL   = `${location.origin}/dashboard.html`; // dashboard is the home after sign-in
export const RESET_URL = `${location.origin}/?type=recovery`;  // opens the reset view in the landing modal
export const AUTH_QUERY = 'auth=signin';                       // landing should open login modal when present

// Keep a handy copy of the token for any hooks
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.access_token && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
    localStorage.setItem('myqer_jwt', session.access_token);
  }
  if (event === 'SIGNED_OUT') {
    localStorage.removeItem('myqer_jwt');
  }
});

// Optional: debug
window.SUPABASE_URL = SUPABASE_URL;
