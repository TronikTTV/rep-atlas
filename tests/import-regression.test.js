const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parsePage } = require('../lib/yupoo-parser');
const matcher = require('../docs/matcher');

const category = 'https://deateath.x.yupoo.com/categories/4563382';
function fixture(page, totalPages = 2) {
  return `<div class="categories__box-right-total">in total 4 albums</div>
    <span class="categories__box-right-pagination-span">${page} / ${totalPages}</span>
    <div class="album__categories-box">${[1, 2].map(i => {
      const id = page * 10 + i;
      return `<div class="categories__children"><a class="album__main" href="/albums/${id}" title="￥218 STUSSY JACKET ${id}"><img data-src="https://photo.yupoo.com/deateath/photo${id}/small.jpg"></a><div class="album__title">STUSSY JACKET ${id}</div></div>`;
    }).join('')}</div>`;
}

test('each album keeps its own title, cover and visible card', () => {
  const result = parsePage(fixture(1), category + '?page=1', 'Taurus', 'Stussy');
  assert.equal(result.products.length, 2);
  assert.equal(new Set(result.products.map(p => p.title)).size, 2);
  assert.equal(new Set(result.products.map(p => p.image)).size, 2);
  assert.equal(matcher.group(result.products).length, 2);
  assert.equal(result.total_pages, 2);
  assert.equal(result.has_more, true);
  assert.ok(result.products.every(p => p.image.endsWith('/medium.jpg')));
});

test('gallery selects original product photos and excludes the store avatar', () => {
  const html = `<img src="https://photo.yupoo.com/deateath/avatar/medium.jpg">
    <h1><span class="showalbumheader__gallerytitle">Stussy jacket</span>24</h1>
    <div class="image__main"><img data-src="https://photo.yupoo.com/deateath/product/big.jpg" data-origin-src="https://photo.yupoo.com/deateath/product/original-file.jpg"><noscript><img src="https://photo.yupoo.com/deateath/product/medium.jpg"></noscript></div>`;
  const result = parsePage(html, 'https://deateath.x.yupoo.com/albums/11', 'Taurus', 'Stussy');
  assert.deepEqual(result.products[0].images, ['https://photo.yupoo.com/deateath/product/original-file.jpg']);
  assert.equal(result.products[0].title, 'Stussy jacket');
  assert.equal(result.products[0].gallery_loaded, true);
});

test('a response without real product cards fails instead of importing an empty listing', () => {
  assert.throws(() => parsePage('<h1>Restricted Access</h1>', category + '?page=1', 'Taurus'), /no product cards/);
});

function appHarness(failPage) {
  const elements = new Map(), listeners = [], storage = new Map([['rep_atlas_hide_cloud', 'true']]), requested = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, value: '', textContent: '', innerHTML: '', disabled: false, hidden: false, style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelectorAll() { return []; }, click() { return this.onclick?.(); } });
    return elements.get(id);
  }
  const context = {
    URL, URLSearchParams, console, setTimeout: fn => { fn(); return 0; }, clearTimeout() {},
    location: { hostname: 'rep-atlas-mobile.vercel.app' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    document: { getElementById: element, querySelectorAll: () => [], addEventListener: (name, fn) => { if (name === 'click') listeners.push(fn); }, body: { style: {} } },
    window: { RepMatcher: matcher, scrollTo() {} }, confirm: () => true, alert: message => { throw Error(message); },
    fetch: async raw => {
      const url = new URL(raw, 'https://rep-atlas-mobile.vercel.app');
      if (url.pathname !== '/api/yupoo') return { ok: true, json: async () => ({ categories: [] }) };
      const page = Number(url.searchParams.get('page'));
      requested.push(page);
      if (page === failPage) return { ok: false, json: async () => ({ error: 'temporary failure' }) };
      return { ok: true, json: async () => parsePage(fixture(page, 3), category + '?page=' + page, 'Taurus', 'Stussy') };
    }
  };
  const html = fs.readFileSync(require.resolve('../docs/index.html'), 'utf8');
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  return { element, storage, requested, listeners };
}

test('category selection starts import and saves every page with distinct photos in custom mode', async () => {
  const app = appHarness();
  const categoryButton = { dataset: { importCategory: category, importLabel: 'Stussy' } };
  const importButton = app.element('quickImport');
  let importing;
  importButton.click = () => { importing = importButton.onclick(); };
  for (const listener of app.listeners) listener({ target: { closest: selector => selector === '[data-import-category]' ? categoryButton : null } });
  await importing;
  const products = JSON.parse(app.storage.get('rep_atlas_imports_v2'));
  assert.equal(products.length, 6);
  assert.equal(new Set(products.map(p => p.image)).size, 6);
  assert.deepEqual(app.requested.sort(), [1, 2, 3]);
  assert.equal(app.storage.get('rep_atlas_hide_cloud'), 'true');
  assert.match(app.element('importState').textContent, /6 products imported with photos/);
  assert.equal(app.element('sProducts').textContent, '6');
});

test('a failed page retains successful pages and reports an incomplete import', async () => {
  const app = appHarness(2);
  app.element('quickUrl').value = category;
  app.element('quickSeller').value = 'Taurus';
  app.element('quickBrand').value = 'Stussy';
  await app.element('quickImport').onclick();
  assert.equal(JSON.parse(app.storage.get('rep_atlas_imports_v2')).length, 4);
  assert.match(app.element('importState').textContent, /Import stopped:.*page 2/);
  assert.doesNotMatch(app.element('importState').textContent, /✓/);
});
