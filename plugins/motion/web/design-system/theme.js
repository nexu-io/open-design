/* Optional, dependency-free document theme controller. Load before the CSS. */
(() => {
  const root = document.documentElement;
  const storageKey = 'motion.appearance.v1';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const modes = ['light', 'dark', 'system'];
  const labels = { light: '浅色', dark: '深色', system: '跟随系统' };
  let preference = 'system';
  try { const saved = localStorage.getItem(storageKey); if (modes.includes(saved)) preference = saved; } catch {}
  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    root.dataset.theme = theme;
    root.dataset.themePreference = preference;
    const color = getComputedStyle(root).getPropertyValue('--motion-bg').trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      const next = modes[(modes.indexOf(preference) + 1) % modes.length];
      const label = `外观：${labels[preference]}。切换为${labels[next]}`;
      button.setAttribute('aria-label', label); button.setAttribute('title', label);
      button.querySelector('use')?.setAttribute('href', '/web/design-system/icons.svg#icon-' + (preference === 'system' ? 'monitor' : theme === 'dark' ? 'moon' : 'sun'));
    }
    for (const select of document.querySelectorAll('[data-theme-select]')) select.value = preference;
  }
  function choose(value) {
    if (!modes.includes(value)) return;
    preference = value;
    try { localStorage.setItem(storageKey, value); } catch {}
    apply();
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();

    for (const select of document.querySelectorAll('[data-theme-select]')) select.addEventListener('change', () => choose(select.value));
  });
  document.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('[data-theme-toggle]')) choose(modes[(modes.indexOf(preference) + 1) % modes.length]); });
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = modes.includes(event.newValue) ? event.newValue : 'system';
    apply();
  });
})();
