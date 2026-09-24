// Browser source, inlined unchanged by compose.ts; keep this file type-free.
(() => {
  const root = document.documentElement;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 700px)');
  const scenes = [...document.querySelectorAll('.scene')];
  const links = [...document.querySelectorAll('.progress-rail a, .nav-list a')];
  const nav = document.querySelector('.nav');
  const tier = document.body.dataset.motionTier || 'medium';
  const intensity = { high: 1, medium: .7, low: .25, fallback: 0 }[tier] ?? .7;
  const staticMode = () => preference.matches || intensity === 0;
  const clamp = n => Math.max(0, Math.min(1, n));
  const state = scenes.map(scene => ({ scene, current: null, pin: null }));
  let frame = 0;
  let last = 0;
  function requestTick() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    const dt = Math.min(.05, (now - (last || now - 16)) / 1000);
    last = now;
    const still = staticMode();
    root.classList.toggle('motion-static', still);
    root.classList.toggle('motion-active', !still);
    const amount = intensity * (mobile.matches ? .4 : 1);
    // Read geometry once per scene before any writes.
    const rects = state.map(s => s.scene.getBoundingClientRect());
    let active = 0;
    let distance = Infinity;
    let unsettled = false;
    state.forEach((s, i) => {
      const r = rects[i];
      const d = r.top <= innerHeight / 2 && r.bottom >= innerHeight / 2 ? 0 : Math.min(Math.abs(r.top - innerHeight / 2), Math.abs(r.bottom - innerHeight / 2));
      if (d < distance) { distance = d; active = i; }
      const target = clamp((innerHeight - r.top) / (r.height + innerHeight));
      if (s.current === null || still) s.current = target;
      const visible = r.bottom > -100 && r.top < innerHeight + 100;
      if (!visible) { s.current = target; return; }
      const lambda = s.scene.dataset.motionSlow === 'true' ? 4.2 : 6.5;
      s.current += (target - s.current) * (1 - Math.exp(-lambda * dt));
      if (Math.abs(target - s.current) > .0005) unsettled = true;
      const pinTarget = clamp(-r.top / Math.max(1, r.height - innerHeight));
      if (s.pin === null || still) s.pin = pinTarget;
      s.pin += (pinTarget - s.pin) * (1 - Math.exp(-8 * dt));
      if (Math.abs(pinTarget - s.pin) > .0005) unsettled = true;
      s.scene.style.setProperty('--pin-p', (still ? 0 : s.pin * amount).toFixed(4));
      s.scene.style.setProperty('--reveal-p', (still ? 1 : clamp((innerHeight * .85 - r.top) / Math.max(innerHeight * .7, r.height * .65))).toFixed(4));
      const p = still ? 1 : s.current;
      const x = still ? 0 : (p - .5) * Number(s.scene.dataset.motionX) * amount;
      const y = still ? 0 : (p - .5) * Number(s.scene.dataset.motionY) * amount;
      // Reserve overscan for translation so planes never reveal their edges.
      const from = Number(s.scene.dataset.scaleFrom);
      const to = Number(s.scene.dataset.scaleTo);
      const scale = still ? 1 : Math.max(1.12, 1 + (from + (to - from) * p - 1) * amount);
      s.scene.style.setProperty('--scene-p', p.toFixed(4));
      s.scene.style.setProperty('--scene-x', `${x.toFixed(2)}px`);
      s.scene.style.setProperty('--scene-y', `${y.toFixed(2)}px`);
      s.scene.style.setProperty('--scene-scale', scale.toFixed(4));
    });
    links.forEach(a => {
      const selected = a.hash === `#${scenes[active]?.id}`;
      a.classList.toggle('is-active', selected);
      if (selected) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
    nav?.classList.toggle('is-scrolled', scrollY > 12);
    if (unsettled && !still) requestTick();
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.dataset.revealed = 'true';
        observer.unobserve(entry.target);
      }
    }, { threshold: .08 });
    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
    root.classList.add('reveal-ready');
  }
  const menu = document.querySelector('#chapter-menu');
  const toggle = document.querySelector('.menu-toggle');
  function closeMenu() { menu?.close(); }
  toggle?.addEventListener('click', () => {
    menu.showModal();
    document.body.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
  });
  menu?.addEventListener('close', () => {
    document.body.classList.remove('menu-open');
    toggle?.setAttribute('aria-expanded', 'false');
  });
  document.querySelector('.menu-close')?.addEventListener('click', closeMenu);
  menu?.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
  });
  document.querySelectorAll('.compare-control').forEach(control => {
    const input = control.querySelector('input');
    const compare = control.previousElementSibling;
    function updateCompare() {
      compare.style.setProperty('--split', `${input.value}%`);
      control.querySelector('output').value = `${input.value}%`;
    }
    input.addEventListener('input', updateCompare);
    let dragging = false;
    function dragTo(event) {
      const rect = compare.getBoundingClientRect();
      input.value = String(Math.round(clamp((event.clientX - rect.left) / rect.width) * 100));
      updateCompare();
    }
    compare.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      dragging = true;
      compare.setPointerCapture(event.pointerId);
      dragTo(event);
    });
    compare.addEventListener('pointermove', event => { if (dragging) dragTo(event); });
    compare.addEventListener('pointerup', () => { dragging = false; });
    compare.addEventListener('pointercancel', () => { dragging = false; });
    compare.addEventListener('lostpointercapture', () => { dragging = false; });
  });
  // Measure only at setup/resize, never in the animation write loop.
  function measureTracks() {
    document.querySelectorAll('.detail-track').forEach(track => {
      const travel = Math.max(0, track.scrollWidth - track.parentElement.clientWidth + 32);
      track.style.setProperty('--travel', `${travel}px`);
    });
  }
  measureTracks();
  addEventListener('resize', measureTracks);
  addEventListener('scroll', requestTick, { passive: true });
  addEventListener('resize', requestTick);
  preference.addEventListener('change', requestTick);
  mobile.addEventListener('change', requestTick);
  document.addEventListener('visibilitychange', requestTick);
  document.querySelectorAll('img').forEach(img => img.addEventListener('load', requestTick));
  requestTick();
})();
