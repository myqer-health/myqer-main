<script type="module">
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

  export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
  export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
  export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, storage: window.localStorage },
    global: { headers: { 'x-myqer-client': 'web' } }
  });

  export const APP_URL = `${location.origin}/app.html`;
  export const RESET_URL = `${location.origin}/reset.html`;

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.access_token && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
      localStorage.setItem('myqer_jwt', session.access_token);
    }
    if (event === 'SIGNED_OUT') {
      localStorage.removeItem('myqer_jwt');
    }
  });

  // Expose for backend_hooks convenience
  window.SUPABASE_URL = SUPABASE_URL;
</script>
