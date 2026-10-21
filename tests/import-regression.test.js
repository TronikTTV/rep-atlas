const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parsePage } = require('../lib/yupoo-parser');
const { resolveImport } = require('../lib/yupoo-import');
const { catalogueUrl } = require('../lib/yupoo-parser');
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

test('product names receive every matching clothing type', () => {
  assert.deepEqual(matcher.kinds({ title: 'Moncler cap, hoodie and shorts matching set' }), ['caps', 'hoodies', 'shorts', 'sets']);
  assert.deepEqual(matcher.kinds({ title: 'Nike Air Max 95 trainers with socks' }), ['shoes', 'socks']);
  assert.deepEqual(matcher.kinds({ title: 'Prada T-shirt' }), ['tshirts']);
});

test('grouped seller offers combine their clothing types', () => {
  const grouped = matcher.group([
    { id: 'one', title: 'Hoodie and joggers set', brand: 'Essentials', seller: 'Husky', preserve_listing: true },
    { id: 'two', title: 'Cap', brand: 'Essentials', seller: 'Taurus', preserve_listing: true }
  ]);
  assert.deepEqual(grouped.find(g => g.hero.id === 'one').types, ['hoodies', 'pants', 'sets']);
  assert.deepEqual(grouped.find(g => g.hero.id === 'two').types, ['caps']);
});

test('brand names can be normalised, renamed and merged', () => {
  assert.equal(matcher.canonicalBrand('C.P'), 'C.P. Company');
  assert.equal(matcher.canonicalBrand('CP'), 'C.P. Company');
  assert.equal(matcher.canonicalBrand('CP COMPANY'), 'C.P. Company');
  assert.equal(matcher.canonicalBrand('PRADA'), 'Prada');
  assert.equal(matcher.canonicalBrand('Prada'), 'Prada');
  assert.equal(matcher.canonicalBrand('Stone Island', { 'Stone Island': 'Stoney', Stoney: 'Stone Island Official' }), 'Stone Island Official');
  assert.equal(matcher.canonicalBrand('PRADA', { PRADA: 'Prada' }), 'Prada');
  assert.equal(matcher.canonicalBrand('Prada', { PRADA: 'Prada' }), 'Prada');
});

test('catalogue results alternate Husky and Taurus without changing either seller order', () => {
  const item = (id, seller) => ({ id, sellers: [seller] });
  const mixed = matcher.mixBySeller([
    item('h1', 'Husky'), item('h2', 'Husky'), item('h3', 'Husky'),
    item('t1', 'Taurus'), item('t2', 'Taurus')
  ]);
  assert.deepEqual(mixed.map(product => product.id), ['h1', 't1', 'h2', 't2', 'h3']);
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

test('the product screen keeps the listing cover and makes every gallery photo expandable', () => {
  const html = fs.readFileSync(require.resolve('../docs/index.html'), 'utf8');
  assert.match(html, /function firstImg\(o\)\{return o\.image\|\|o\.thumbnail\|\|\(o\.images\|\|\[\]\)\[0\]/);
  assert.match(html, /image:original\.image\|\|detail\.image/);
  assert.match(html, /image:o\.image\|\|item\.image/);
  assert.match(html, /data-view-photo/);
  assert.doesNotMatch(html, /\.slice\(0,20\)\.map\(src=>'<img/);
});

function appHarness(failPage, responder, profileState = { data: { profile: 'Lukas', favourites: [] }, index: { profiles: ['Lukas'] }, writes: [] }) {
  profileState.index ||= { profiles: ['Lukas'] };
  profileState.writes ||= [];
  profileState.profiles ||= { lukas: profileState.data };
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
    fetch: async (raw, options = {}) => {
      const url = new URL(raw, 'https://rep-atlas-mobile.vercel.app');
      if (url.hostname === 'mantledb.sh') {
        const isIndex = url.pathname.endsWith('/profiles/index');
        const profileKey = decodeURIComponent(url.pathname.split('/').pop()).toLowerCase();
        if ((options.method || 'GET') === 'POST') {
          if (isIndex) profileState.index = JSON.parse(options.body);
          else { profileState.profiles[profileKey] = JSON.parse(options.body); if (profileKey === 'lukas') profileState.data = profileState.profiles[profileKey]; }
          profileState.writes.push(isIndex ? profileState.index : profileState.profiles[profileKey]);
        }
        const value = isIndex ? profileState.index : profileState.profiles[profileKey];
        return { ok: Boolean(value), status: value ? 200 : 404, json: async () => value || { error: 'not found' } };
      }
      if (url.pathname !== '/api/yupoo') return { ok: true, json: async () => ({ categories: [] }) };
      const page = Number(url.searchParams.get('page'));
      requested.push(page);
      if (responder) return responder(url);
      if (page === failPage) return { ok: false, json: async () => ({ error: 'temporary failure' }) };
      return { ok: true, json: async () => parsePage(fixture(page, 3), category + '?page=' + page, 'Taurus', 'Stussy') };
    }
  };
  const html = fs.readFileSync(require.resolve('../docs/index.html'), 'utf8');
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  return { element, storage, requested, listeners, profileState };
}

test('Lukas profile loads and writes shared favourites without a password', async () => {
  const profileState = { data: { profile: 'Lukas', favourites: ['remote-favourite'] }, writes: [] };
  const app = appHarness(null, null, profileState);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(app.storage.get('rep_atlas_favs_lukas')), ['remote-favourite']);
  for (const listener of app.listeners) listener({ target: { closest: selector => selector === '[data-fav]' ? { dataset: { fav: 'new-favourite' } } : null } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(profileState.data.favourites.sort(), ['new-favourite', 'remote-favourite']);
  assert.match(app.element('profileStatus').textContent, /Lukas is synced/);
});

test('a mate can add a separate profile without replacing Lukas saved products', async () => {
  const profileState = { data: { profile: 'Lukas', favourites: ['lukas-saved'] }, index: { profiles: ['Lukas'] }, writes: [] };
  const app = appHarness(null, null, profileState);
  await new Promise(resolve => setImmediate(resolve));
  app.element('newProfile').value = 'Jamie';
  await app.element('addProfile').onclick();
  assert.deepEqual(profileState.index.profiles, ['Lukas', 'Jamie']);
  assert.equal(JSON.parse(app.storage.get('rep_atlas_profile')), 'Jamie');
  assert.deepEqual(profileState.profiles.lukas.favourites, ['lukas-saved']);
  assert.deepEqual(profileState.profiles.jamie.favourites, []);
  assert.ok(profileState.writes.some(write => write.profiles?.includes('Jamie')));
  assert.ok(profileState.writes.some(write => write.profile === 'Lukas' && write.favourites.includes('lukas-saved')));
});

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

const pointerAlbum = `<h1><span class="showalbumheader__gallerytitle">AMIRI</span></h1>
  <div class="showalbumheader__gallerysubtitle"><a href="https://huskyreps.x.yupoo.com/categories/4990396">AMIRI catalogue</a></div>
  <div class="image__main"><img data-src="https://photo.yupoo.com/alaskareps/logo/medium.jpeg"></div>`;

test('a logo category resolves its album description to the actual catalogue', async () => {
  const source = 'https://alaskareps.x.yupoo.com/categories/5093789?page=1';
  const logoId = 'husky:alaskareps.x.yupoo.com:220215818';
  const html = `<span class="categories__pagination">1 / 1</span><div class="categories__children"><a class="album__main" href="/albums/220215818" title="AMIRI"><img data-src="https://photo.yupoo.com/alaskareps/logo/medium.jpeg"></a><div class="album__photonumber">1</div></div>`;
  const reads = [];
  const result = await resolveImport(source, 'Husky', 'Amiri', async url => { reads.push(url); return url === source ? html : pointerAlbum; });
  assert.equal(result.products.length, 0);
  assert.deepEqual(result.follow_links, ['https://huskyreps.x.yupoo.com/categories/4990396']);
  assert.deepEqual(result.replaced_ids, [logoId]);
  assert.equal(reads.length, 2);
});

test('direct logo album imports follow links and ignore unrelated navigation', () => {
  const result = parsePage(`<nav><a href="https://unrelated.x.yupoo.com/albums">Other store</a></nav>${pointerAlbum}`, 'https://alaskareps.x.yupoo.com/albums/220215818', 'Husky', 'Amiri');
  assert.equal(result.products.length, 0);
  assert.deepEqual(result.follow_links, ['https://huskyreps.x.yupoo.com/categories/4990396']);
});

test('double-encoded Yupoo outgoing links are decoded, while unrelated hosts are rejected', () => {
  const target = 'https://huskyreps.x.yupoo.com/categories/4990396';
  assert.equal(catalogueUrl('https://x.yupoo.com/external?url=' + encodeURIComponent(encodeURIComponent(target)), category), target);
  assert.equal(catalogueUrl('https://example.com/private', category), '');
});

test('the app follows a chain of logo links, imports every destination page, removes old logos and stops cycles', async () => {
  const source = 'https://alaskareps.x.yupoo.com/categories/5093789';
  const bridge = 'https://huskyreps.x.yupoo.com/albums/207695892';
  const target = 'https://huskyreps.x.yupoo.com/categories/4990396';
  const oldId = 'husky:alaskareps.x.yupoo.com:220215818';
  const visited = [];
  const app = appHarness(null, async url => {
    const current = url.searchParams.get('url'), page = Number(url.searchParams.get('page'));
    visited.push(current + '#page=' + page);
    let result;
    if (current === source) result = { page: 1, total_pages: 1, has_more: false, products: [], follow_links: [bridge], replaced_ids: [oldId] };
    else if (current === bridge) result = { page: 1, total_pages: 1, has_more: false, products: [], follow_links: [target] };
    else {
      result = parsePage(fixture(page, 3), target + '?page=' + page, 'Husky', 'Amiri');
      result.follow_links = [source, target + '?uid=1'];
    }
    return { ok: true, json: async () => result };
  });
  app.storage.set('rep_atlas_imports_v2', JSON.stringify([{ id: oldId, title: 'AMIRI', image: 'logo.jpg' }]));
  app.element('quickUrl').value = source;
  app.element('quickSeller').value = 'Husky';
  app.element('quickBrand').value = 'Amiri';
  await app.element('quickImport').onclick();
  const products = JSON.parse(app.storage.get('rep_atlas_imports_v2'));
  assert.equal(products.length, 6);
  assert.ok(!products.some(p => p.id === oldId));
  assert.equal(visited.length, 5);
  assert.match(app.element('importState').textContent, /6 products imported with photos. Followed 2 linked catalogues/);
  assert.ok(JSON.parse(app.storage.get('rep_atlas_pointer_ids')).includes(oldId));
});
