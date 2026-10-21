(function () {
  'use strict';
  const key = 'rep_atlas_theme';
  const themes = { dark: '#090a0d', light: '#f5f7f6', college: '#f6f7f9' };
  function read() {
    try { return JSON.parse(localStorage.getItem(key)) || 'dark'; } catch { return 'dark'; }
  }
  function apply(value, persist) {
    const theme = Object.hasOwn(themes, value) ? value : 'dark';
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themes[theme]);
    document.title = theme === 'college' ? 'Product Catalogue' : 'REP ATLAS — Catalogues, combined';
    const picker = document.getElementById('appearance');
    if (picker) picker.value = theme;
    if (persist) { try { localStorage.setItem(key, JSON.stringify(theme)); } catch {} }
    return theme;
  }
  window.RepAppearance = {
    current: () => document.documentElement.dataset.theme,
    set: value => apply(value, true)
  };
  apply(read(), false);
  window.addEventListener('storage', event => { if (event.key === key) apply(read(), false); });
})();
