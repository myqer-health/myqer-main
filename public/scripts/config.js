// /public/scripts/config.js

// Global app config (safe to use in browser)
window.MYQER = {
  SUPABASE_URL: 'https://dmntmhkncldgynufajei.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  APP_URL: '/dashboard.html',
  AUTH_QUERY: 'auth=login',
  RENDER_BASE: 'https://www.myqer.com',
  LANGS: ['en','es','fr','de','it','pt','ro','ar','hi','zh']
};

console.log('MYQER config loaded:', window.MYQER);
