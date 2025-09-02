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
})();
<script>
/* ===== Emergency QR generator ===== */
(function () {
  // --- config: change only if your function name differs ---
  const EDGE_QR_ENDPOINT =
    "https://dmntmhkncldynufajei.supabase.co/functions/v1/qr-generate";
  // The public “card viewer” is served via Render rewrite: https://www.myqer.com/c/:code

  // --- element hooks ---
  const $ = (id) => document.getElementById(id);
  const btnGen   = $("btn-generate-code");
  const btnPrint = $("btn-print");
  const qrSlot   = $("qr-slot");
  const statusEl = $("qr-status");
  const shortEl  = $("short-code");
  const linkEl   = $("card-link");
  const copyCode = $("copy-code");
  const copyLink = $("copy-link");
  const openLink = $("open-link");

  // util
  const setBusy = (busy) => {
    btnGen && (btnGen.disabled = busy);
    statusEl && (statusEl.textContent = busy ? "Generating…" : statusEl.textContent);
  };

  const toast = (msg) => {
    // minimal toast; replace with your own UI kit
    console.log(msg);
    try { if (window.showToast) return window.showToast(msg); } catch(_) {}
    alert(msg);
  };

  // Render a raw SVG string into the QR slot
  const renderSVG = (svg) => {
    if (!qrSlot) return;
    qrSlot.innerHTML = svg;
  };

  // Persist last generated code for “Print” / re-open
  let last = { short: null, url: null, svg: null };

  async function generate() {
    try {
      setBusy(true);

      // Ensure supabase client exists (you said you already create it elsewhere)
      if (!window.supabase) {
        toast("Supabase not initialized.");
        return;
      }

      // Require login (we need a user to own the code)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast("Please sign in first.");
        return;
      }

      // Call the secured Edge Function to mint a new code and build QR
      const res = await fetch(EDGE_QR_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({}) // no body needed; function infers user from JWT
      });

      if (!res.ok) {
        const err = await res.text().catch(()=>"");
        throw new Error(`QR generate failed (${res.status}) ${err}`);
      }
      const data = await res.json();

      // Expected payload from your function:
      // {
      //   ok: true,
      //   short_code: "R7Q2-K9",
      //   pretty_code: "R7Q2-K9",
      //   card_url: "https://www.myqer.com/c/R7Q2K9",
      //   qr_svg: "<svg …></svg>"
      // }

      // Update UI
      renderSVG(data.qr_svg);
      statusEl && (statusEl.textContent = "Generated");
      shortEl  && (shortEl.textContent  = data.pretty_code || data.short_code || "—");
      if (linkEl)  { linkEl.value = data.card_url || ""; }
      copyLink && (copyLink.disabled = !data.card_url);
      openLink && (openLink.disabled = !data.card_url);
      btnPrint && (btnPrint.disabled = !data.qr_svg);

      last = { short: data.short_code, url: data.card_url, svg: data.qr_svg };

    } catch (e) {
      console.error(e);
      statusEl && (statusEl.textContent = "Failed");
      toast("Failed to generate QR code.");
    } finally {
      setBusy(false);
    }
  }

  // Copy helpers
  async function doCopy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied!"); }
    catch { toast("Copy failed."); }
  }

  // Print helper: open a temporary window with the SVG and print
  function doPrint() {
    if (!last.svg) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`
      <html><head><title>MYQER — Emergency QR</title>
        <style>
          body{margin:0;padding:24px;font-family:system-ui,sans-serif}
          .wrap{display:flex;align-items:center;justify-content:center;height:100vh}
          .qr svg{width:320px;height:320px}
          .meta{margin-top:16px;text-align:center}
          code{font-size:18px}
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="qr">
            ${last.svg}
            <div class="meta">
              <div><strong>Code:</strong> <code>${last.short || ""}</code></div>
              <div style="margin-top:8px">${last.url ? last.url : ""}</div>
            </div>
          </div>
        </div>
        <script>window.onload=() => window.print();</script>
      </body></html>
    `);
    w.document.close();
  }

  // Wire up events
  btnGen  && btnGen.addEventListener("click", generate);
  copyCode && copyCode.addEventListener("click", () => shortEl && doCopy(shortEl.textContent.trim()));
  copyLink && copyLink.addEventListener("click", () => linkEl && doCopy(linkEl.value));
  openLink && openLink.addEventListener("click", () => linkEl && linkEl.value && window.open(linkEl.value, "_blank"));
  btnPrint && btnPrint.addEventListener("click", doPrint);
})();
</script>
