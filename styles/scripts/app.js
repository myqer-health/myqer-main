// Dashboard logic
const sb = supabase.createClient(window.MYQER_SUPABASE_URL, window.MYQER_SUPABASE_ANON);
const $ = (s)=>document.querySelector(s);

async function requireAuth(){
  const { data:{session} } = await sb.auth.getSession();
  if(!session) { location.href='login.html'; return null; }
  return session;
}

async function load(){
  const session = await requireAuth(); if(!session) return;
  $('#who').textContent = session.user.user_metadata?.full_name || session.user.email;

  // Load or create profile
  const uid = session.user.id;
  let { data: rows } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if(!rows){
    await sb.from('profiles').insert({ id: uid, full_name: session.user.user_metadata?.full_name || null });
    rows = { full_name: session.user.user_metadata?.full_name || '' };
  }
  $('#full_name').value = rows.full_name || '';
  $('#emergency_contact').value = rows.emergency_contact || '';
  $('#allergies').value = rows.allergies || '';
  $('#medications').value = rows.medications || '';
}

$('#save').addEventListener('click', async ()=>{
  const { data:{session} } = await sb.auth.getSession(); if(!session) return;
  const body = {
    id: session.user.id,
    full_name: $('#full_name').value.trim(),
    emergency_contact: $('#emergency_contact').value.trim(),
    allergies: $('#allergies').value.trim(),
    medications: $('#medications').value.trim(),
  };
  const { error } = await sb.from('profiles').upsert(body);
  const a = $('#save-ok'), e = $('#save-err');
  if(error){ e.textContent = '⚠️ ' + error.message; e.style.display='block'; a.style.display='none'; }
  else { a.style.display='block'; e.style.display='none'; }
});

$('#logout').addEventListener('click', async ()=>{
  await sb.auth.signOut(); location.href = 'login.html';
});

document.addEventListener('DOMContentLoaded', load);
