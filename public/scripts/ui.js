(function () {
  const sheet = document.getElementById('menuSheet');
  const toggle = document.getElementById('menuToggle');
  const closeBtn = document.getElementById('menuClose');

  function open() {
    if (!sheet) return;
    sheet.hidden = false;
    document.body.classList.add('no-scroll');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }
  function close() {
    if (!sheet) return;
    sheet.hidden = true;
    document.body.classList.remove('no-scroll');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  toggle && toggle.addEventListener('click', () => {
    sheet && (sheet.hidden ? open() : close());
  });
  closeBtn && closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  sheet && sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close(); // click outside card
  });
// QR Code generator logic
document.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("qrCanvas");
  const codeText = document.getElementById("codeUnderQR");
  if (!canvas || !codeText) return;

  try {
    // Call Supabase Edge Function to fetch short code
    const resp = await fetch("/c/test"); // test route, replace later with real user code
    const data = await resp.json();

    if (!data || !data.card) {
      codeText.textContent = "⚠️ No code generated yet";
      return;
    }

    const shortCode = data.card.code;
    codeText.textContent = shortCode;

    // Build QR pointing to your Render domain (short URL)
    const qrUrl = `https://www.myqer.com/c/${shortCode}`;

    // Use QRCode library
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    new QRCode(canvas, {
      text: qrUrl,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });

  } catch (err) {
    console.error("QR error:", err);
    codeText.textContent = "❌ Error loading QR";
  }
});
