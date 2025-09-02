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
