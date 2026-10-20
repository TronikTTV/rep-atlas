const { resolveImport } = require('../lib/yupoo-import');

function yupooUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && /^[a-z0-9-]+\.x\.yupoo\.com$/.test(url.hostname) && !url.port ? url : null;
  } catch { return null; }
}

async function readUrl(url) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
        'accept-language': 'en-GB,en;q=0.9'
      },
      redirect: 'error', signal: controller.signal
    });
    if (!response.ok) throw Error('Yupoo HTTP ' + response.status);
    const html = await response.text();
    if (html.length > 5000000) throw Error('Page too large');
    if (/captcha required|access denied|access restricted|restricted access|security policy of this website|enable javascript to continue|too many requests/i.test(html)) throw Error('Yupoo is temporarily restricting access. Try again later.');
    return html;
  } finally { clearTimeout(timeout); }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const url = yupooUrl(req.query.url);
  if (!url || !/^\/(?:$|albums\/?(?:\d+)?|categories\/\d+|collections\/\d+)\/?$/.test(url.pathname)) return res.status(400).json({ error: 'Paste a public HTTPS Yupoo album, category, collection or store URL' });
  const seller = req.query.seller === 'Taurus' ? 'Taurus' : 'Husky';
  const brand = String(req.query.brand || '').slice(0, 65);
  if (!/^\/albums\/\d+/.test(url.pathname)) {
    if (url.pathname === '/') url.pathname = '/albums';
    url.searchParams.set('page', String(Math.min(2000, Math.max(1, Number(req.query.page) || 1))));
  }
  try {
    return res.status(200).json(await resolveImport(url.href, seller, brand, readUrl));
  } catch (error) {
    return res.status(502).json({ error: 'Unable to import this Yupoo page: ' + error.message });
  }
};
