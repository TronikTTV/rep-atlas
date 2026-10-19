# REP ATLAS — Mobile catalogue

A free, mobile-first website for finding Husky and Taurus Yupoo clothing products in one place.

## Website
Once GitHub Pages is enabled: **https://tronikttv.github.io/rep-atlas/**

The site starts with an **empty catalogue**. No listings or prices have been invented. Run the importer through GitHub Actions to populate it. Some Yupoo pages may block automated requests or change layouts.

## Turn on GitHub Pages (iPhone or desktop)
1. Open repository **Settings → Pages**.
2. Under *Build and deployment*, select **GitHub Actions** as the source.
3. Open **Actions → Update Catalogue** and run the workflow if the site has not deployed automatically.
4. When the green deploy completes, open https://tronikttv.github.io/rep-atlas/.
5. On iPhone Safari, tap **Share → Add to Home Screen**.

## Import selected catalogues
1. Open **Actions → Update Catalogue → Run workflow**.
2. Choose **Both**, **Husky**, or **Taurus**.
3. Set **brands** to a comma-separated list such as `Moncler,Nike,Stone Island,Essentials`. To import all discoverable categories, explicitly use `ALL` (potentially very slow).
4. Choose the number of listing pages to import per matching category.
5. Optionally provide **extra_sources**: `Moncler=https://example.x.yupoo.com;Nike=https://another.x.yupoo.com`. Only actual Yupoo hosts are accepted. Use this when a dedicated brand catalogue wasn't discovered automatically.
6. Start the workflow. It loads the public category listings, discovers links to other Yupoo websites, conservatively groups similar offers and writes `docs/data/catalogue.json`, then deploys the website.

**No always-on computer is required.** GitHub Actions runs the updater in the cloud on demand. Favourites and manual grouping corrections are stored in your browser's local storage and do not follow you between devices.

## Project files
- `docs/index.html` — self-contained mobile website.
- `docs/data/catalogue.json` — catalogue data, empty until synced.
- `sync_catalogue.py` — public Yupoo scraper / category discovery / matching.
- `.github/workflows/update-catalogue.yml` — GitHub Pages deploy and on-demand catalogue sync.
- `requirements.txt` — Python dependencies.

### Important limitations
- Importing Yupoo pages relies on their public HTML being available. Captchas, blocked requests, private galleries, missing metadata or changed layouts may prevent a successful sync. The importer does not bypass restrictions.
- Price is shown only when explicitly extractable from album titles; missing prices stay unknown.
- Matching different sellers or colourways is **best effort**. The website provides manual merge/split group-key controls to fix mistakes locally.
- Source categories are discovered at import time. Additional verified brand links can be entered in `extra_sources`.
- Website content and imported catalogue data are public in this repository. Do not add personal or private data.

This is an independent catalogue browser, not an official seller.
