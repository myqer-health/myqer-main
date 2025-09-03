// /public/scripts/config.js
// Global app config (safe to use in browser)

(function () {
  // current origin (useful for dev vs prod)
  const ORIGIN = window.location.origin;

  window.MYQER = {
    // 🔑 Supabase (public values, safe to expose)
    SUPABASE_URL: 'https://dmntmhkncldgynufajei.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtbnRtaGtuY2xkZ3ludWZhamVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MzQ2MzUsImV4cCI6MjA3MjQxMDYzNX0.6DzOSb0xu5bp4g2wKy3SNtEEuSQavs_ohscyawvPmrY',

    // 🌐 App URLs
    // Your production domain
    RENDER_BASE: 'https://www.myqer.com',
    // Path to the dashboard page that handles magic link callbacks
    APP_URL: '/dashboard.html',
    // optional query flag if you’re using it in redirects
    AUTH_QUERY: 'auth=login',

    // 🌍 Supported languages
    LANGS: ['en','es','fr','de','it','pt','ro','ar','hi','zh'],

    // 🔧 Derived values
    SITE_URL: ORIGIN, // whatever host you’re currently running on
    DASHBOARD_ABSOLUTE: 'https://www.myqer.com/dashboard.html' // explicit prod URL
  };

  // Log only safe config for debugging (never log private keys — anon is okay)
  console.log('✅ MYQER config loaded:', {
    SUPABASE_URL: window.MYQER.SUPABASE_URL,
    RENDER_BASE: window.MYQER.RENDER_BASE,
    APP_URL: window.MYQER.APP_URL,
    SITE_URL: window.MYQER.SITE_URL
  });
})();
