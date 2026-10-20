# REP ATLAS

A free, phone-first catalogue combining Husky Reps, Alaska, Taurus Reps, Scorpio and Pisces Yupoo catalogues.

## Use it

- Main app: **https://rep-atlas-mobile.vercel.app**
- Free static mirror: **https://tronikttv.github.io/rep-atlas/**
- On iPhone, open the app in Safari, tap **Share → Add to Home Screen**.

## Fast importing

Catalogue pages import in parallel with no six-page / roughly 450-product ceiling. Product cards and original image URLs save first; a full gallery loads only when its product is opened. Paste a public album, category, collection or full-store Yupoo URL in the app, choose Husky or Taurus, optionally enter the brand, and tap **Import catalogue**.

The shared directory recognises Husky's Alaska catalogue and Taurus's Scorpio and Pisces catalogues. Products can be favourited, searched, filtered and compared by seller and price. Conservative matching groups only strong duplicates; manual merge/split controls remain available.

## Main files

- docs/index.html — installable mobile catalogue.
- docs/data/catalogue.json — shared combined product index.
- docs/data/catalogues.json — five-store category directory.
- api/yupoo.js — batched listing and on-demand gallery bridge.
- api/image.js — cached image proxy using the matching Yupoo referrer.
- fast_sync.py — parallel index-first full scanner.
- sync_catalogue.py — targeted cloud importer.

Only public Yupoo pages are read. Captchas, private albums and blocked pages are not bypassed. Prices remain unknown when sellers do not publish them. Favourites and manual grouping corrections stay in the current browser.
