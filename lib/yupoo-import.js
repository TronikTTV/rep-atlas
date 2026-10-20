const { parsePage } = require('./yupoo-parser');

async function resolveImport(url, seller, brand, readUrl) {
  const result = parsePage(await readUrl(url), url, seller, brand);
  const links = new Set(result.follow_links || []);
  const replaced = new Set(result.replaced_ids || []);
  const candidates = result.products.filter(item => item.check_catalogue_link);
  // Inspect only small unpriced signpost albums. Ordinary product imports stay index-first.
  for (let start = 0; start < candidates.length; start += 4) {
    const batch = await Promise.all(candidates.slice(start, start + 4).map(async item => {
      const album = parsePage(await readUrl(item.url), item.url, seller, brand);
      return { item, album };
    }));
    for (const { item, album } of batch) {
      if (!(album.follow_links || []).length) continue;
      for (const link of album.follow_links) links.add(link);
      replaced.add(item.id);
    }
  }
  return { ...result, products: result.products.filter(item => !replaced.has(item.id)), follow_links: [...links], replaced_ids: [...replaced] };
}

module.exports = { resolveImport };
