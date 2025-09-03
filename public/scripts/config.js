// /public/scripts/config.js
// Global app config (safe to expose in browser)

// --- Supabase (your project) ---
window.MYQER = {
  SUPABASE_URL: 'https://dmntmhkncldgynufajei.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtbnRtaGtuY2xkZ3ludWZhamVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MzQ2MzUsImV4cCI6MjA3MjQxMDYzNX0.6DzOSb0xu5bp4g2wKy3SNtEEuSQavs_ohscyawvPmrY',

  // --- Routing ---
  APP_URL: '/dashboard.html',       // after login/signup → dashboard
  AUTH_QUERY: 'auth=login',         // query param that opens modal
  RESET_URL: '/?type=recovery',     // Supabase password reset link target

  // --- Domain (for QR short links etc.)
  RENDER_BASE: 'https://www.myqer.com',

  // --- Languages supported ---
  LANGS: ['en','es','fr','de','it','pt','ro','ar','hi','zh']
};

// Debug convenience
console.log('MYQER config loaded', window.MYQER);
