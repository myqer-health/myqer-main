// scripts/reset.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Config from your config.js
const supabase = createClient(window.MYQER_SUPABASE_URL, window.MYQER_SUPABASE_ANON)

const emailEl = document.getElementById('resetEmail')
const passEl = document.getElementById('newPassword')
const msgEl = document.getElementById('resetMsg')

// Step 1: Request reset link
document.getElementById('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  msgEl.textContent = "Sending reset email..."
  const { error } = await supabase.auth.resetPasswordForEmail(emailEl.value, {
    redirectTo: window.MYQER_RESET_REDIRECT // from config.js
  })
  msgEl.textContent = error ? "⚠️ " + error.message : "✅ Check your email for reset link"
})

// Step 2: If user came back with a token, allow new password
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    document.getElementById('newPwWrap').style.display = "block"
  }
})

document.getElementById('newPwForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const { error } = await supabase.auth.updateUser({ password: passEl.value })
  msgEl.textContent = error ? "⚠️ " + error.message : "✅ Password updated, you can log in now."
})
