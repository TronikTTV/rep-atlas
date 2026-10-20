const cheerio = require('cheerio');

function catalogueUrl(raw, base) {
  if (!raw) return '';
  try {
    let value = String(raw).replace(/&amp;/g, '&').replace(/\\\//g, '/');
    let url = new URL(value, base);
    if (url.hostname === 'x.yupoo.com' && url.pathname === '/external') {
      value = url.searchParams.get('url') || '';
      for (let n = 0; n < 3 && /%[0-9a-f]{2}/i.test(value); n++) value = decodeURIComponent(value);
      url = new URL(value);
    }
    if (!['http:', 'https:'].includes(url.protocol) || !/^[a-z0-9-]+\.x\.yupoo\.com$/.test(url.hostname) || url.port || url.username || url.password) return '';
    if (!/^\/(?:$|albums\/?(?:\d+)?|categories\/\d+|collections\/\d+)\/?$/.test(url.pathname)) return '';
    url.protocol = 'https:';
    url.searchParams.delete('page');
    url.hash = '';
    return url.href;
  } catch { return ''; }
}

function linkedCatalogues($, base) {
  const links = new Set();
  const add = raw => { const url = catalogueUrl(raw, base); if (url) links.add(url); };
  // Limit discovery to the album/category description, never the navigation menu.
  const description = $('.showalbumheader__gallerysubtitle, .categories__description, .categories__box-right-desc');
  description.find('a[href]').each((_, el) => add($(el).attr('href')));
  const text = description.text() + ' ' + ($('meta[property="og:description"]').attr('content') || '');
  for (const match of text.matchAll(/https?:\/\/[a-z0-9-]+\.x\.yupoo\.com[^\s<>"']*/gi)) add(match[0].replace(/[.,;)]+$/, ''));
  return [...links];
}

function photo(raw, base) {
  if (!raw) return '';
  try {
    const url = new URL(String(raw).replace(/\\\//g, '/'), base);
    if (url.protocol !== 'https:' || url.hostname !== 'photo.yupoo.com' || !/\.(jpe?g|png|webp)$/i.test(url.pathname)) return '';
    url.pathname = url.pathname.replace(/\/small\.(jpe?g|png|webp)$/i, '/medium.$1');
    return url.href;
  } catch { return ''; }
}

function imageOf($, element, base) {
  for (const attr of ['data-origin-src', 'data-origin', 'data-original', 'data-src', 'data-lazy', 'data-photo-src', 'src']) {
    const src = photo($(element).attr(attr), base);
    if (src) return src;
  }
  return '';
}

function gallery($, url) {
  const images = new Map();
  $('.image__main img, .showalbum__children img, img[data-origin-src]').each((_, element) => {
    const src = imageOf($, element, url);
    if (!src) return;
    const key = new URL(src).pathname.split('/').slice(0, -1).join('/');
    if (!images.has(key)) images.set(key, src);
  });
  if (!images.size) {
    const src = photo($('meta[property="og:image"]').attr('content'), url);
    if (src) images.set(src, src);
  }
  return [...images.values()].slice(0, 200);
}

function price(title) {
  const values = [...title.matchAll(/[¥￥]\s*[~≈：:=]?\s*(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  const unique = [...new Set(values.filter(n => n > 0 && n < 50000))].sort((a, b) => a - b);
  return { price_yuan: unique[0] ?? null, price_text: unique.length > 1 ? `¥${unique[0]}–${unique.at(-1)}` : unique.length ? `¥${unique[0]}` : '' };
}

function pagination($, url) {
  const page = Number(new URL(url).searchParams.get('page')) || 1;
  let totalPages = null;
  $('[class*="pagination"]').each((_, el) => {
    const match = $(el).text().match(/\b\d+\s*\/\s*(\d+)\b/);
    if (match) totalPages = Math.max(totalPages || 1, Number(match[1]));
  });
  const current = new URL(url);
  let linkedMax = page;
  $('a[href]').each((_, el) => {
    try {
      const link = new URL($(el).attr('href'), url);
      if (link.origin === current.origin && link.pathname === current.pathname) linkedMax = Math.max(linkedMax, Number(link.searchParams.get('page')) || 1);
    } catch {}
  });
  const totalText = $('[class*="total"]').map((_, el) => $(el).text()).get().join(' ');
  const totalMatch = totalText.match(/(?:in total\s*)?(\d+)\s*(?:albums|相册)/i);
  return { page, total_pages: totalPages, has_more: totalPages ? page < totalPages : linkedMax > page, total_albums: totalMatch ? Number(totalMatch[1]) : null };
}

function parsePage(html, url, seller, forcedBrand = '') {
  const $ = cheerio.load(html), origin = new URL(url).origin;
  const isAlbum = /^\/albums\/\d+\/?$/.test(new URL(url).pathname);
  function make(href, title, images, loaded) {
    const albumId = /\/albums\/(\d+)/.exec(href)?.[1];
    title = String(title || '').replace(/\s+/g, ' ').trim();
    if (!albumId || !title || !title.replace(/[🔥⭐★✅\s]/g, '')) return null;
    const id = `${seller.toLowerCase()}:${new URL(href).hostname}:${albumId}`;
    return { id, seller, url: href, album_id: albumId, title, brand: forcedBrand || 'Other', ...price(title), color: 'Unknown', group_key: 'unique:' + id, preserve_listing: true, parser_version: 2, image: images[0] || '', images, gallery_loaded: loaded, source: url };
  }
  if (isAlbum) {
    const title = $('.showalbumheader__gallerytitle').first().text() || $('h1').first().text() || $('meta[property="og:title"]').attr('content')?.split(' | ')[0];
    const images = gallery($, url), item = make(url, title, images, true);
    const followLinks = linkedCatalogues($, url);
    const isPointer = item && followLinks.length > 0 && item.price_yuan == null && (images.length <= 2 || item.title.length <= 65);
    if (isPointer) return { kind: 'album', products: [], follow_links: followLinks, replaced_ids: [item.id], page: 1, total_pages: 1, has_more: false, total_albums: 0 };
    if (!item || !images.length) throw Error('This album did not return its title and photos. Please retry.');
    return { kind: 'album', products: [item], follow_links: [], page: 1, total_pages: 1, has_more: false, total_albums: 1 };
  }
  const products = new Map();
  $('a[href*="/albums/"]').each((_, element) => {
    const anchor = $(element);
    let href;
    try { href = new URL(anchor.attr('href'), url); } catch { return; }
    if (href.origin !== origin || !/^\/albums\/\d+\/?$/.test(href.pathname)) return;
    // The link itself is .album__main; parents() skips it and finds the whole grid.
    let card = anchor.closest('.categories__children, .showindex__children, .album__children, .album3__children');
    if (!card.length) card = anchor.closest('.album__main, .album3__main');
    if (!card.length) card = anchor;
    const title = anchor.attr('title') || card.find('.album__title, .album3__title, .album__main__name, .album3__main__name, .album__name').first().text() || anchor.text();
    let image = '';
    card.find('img').each((_, el) => { if (!image) image = imageOf($, el, url); });
    if (!image) return;
    const item = make(href.href, title, [image], false);
    const photoCount = Number(card.find('.album__photonumber, .album3__photonumber').first().text());
    if (item && item.price_yuan == null && item.title.length <= 65 && (!photoCount || photoCount <= 2)) item.check_catalogue_link = true;
    if (item) products.set(item.id, item);
  });
  const info = pagination($, url);
  if (!products.size && (info.page === 1 || info.total_albums > 0 && info.page <= info.total_pages)) throw Error('This page returned no product cards with photos. It was not imported.');
  return { kind: 'category', ...info, products: [...products.values()], follow_links: linkedCatalogues($, url) };
}

module.exports = { parsePage, photo, catalogueUrl };
