/* Minimal UI glue: burger menu + ensure correct hero image on rotate */

(function(){
  const menu = document.getElementById('menu');
  const burger = document.getElementById('burger');
  const menuClose = document.getElementById('menuClose');

  function openMenu(){
    menu.classList.add('open');
    burger.setAttribute('aria-expanded','true');
  }
  function closeMenu(){
    menu.classList.remove('open');
    burger.setAttribute('aria-expanded','false');
  }

  if (burger){
    burger.addEventListener('click', () => {
      menu.classList.contains('open') ? closeMenu() : openMenu();
    });
  }
  if (menuClose){
    menuClose.addEventListener('click', closeMenu);
  }

  // Swap poster image on orientation change (fallback to CSS)
  const poster = document.getElementById('poster');
  function choosePoster(){
    if (!poster) return;
    const isPortrait = window.matchMedia('(max-aspect-ratio: 4/5)').matches;
    const src = isPortrait ? poster.dataset.portrait : poster.dataset.landscape;
    if (src) poster.style.backgroundImage = `url("${src}")`;
  }
  choosePoster();
  window.addEventListener('resize', choosePoster);
  window.addEventListener('orientationchange', choosePoster);
})();
