# Chol Hamoed Outing Finder

Every place from the Navigation Sukkos 5787 outings guide (yazory.com), with booklet photos, family reviews,
websites, phone numbers, hours, prices and drive times from Monsey, Monroe (Kiryas Joel), New Square,
Williamsburg, Boro Park, Flatbush, Crown Heights, Queens, the Five Towns, Lakewood and Passaic.

- **Website:** plain HTML, hosted free on GitHub Pages (`index.html`, `app.js`, `features.js`, `i18n.js`, `yi.js`, `seasons.js`, `photos/`, `gallery/`, `img/`, `data/`, `ai/`).
- **Seasons:** the same site works for Chol Hamoed Sukkos, Chol Hamoed Pesach and winter vacation. `seasons.js` holds each
  season's dates, wording, winter categories and the few places added for winter. Without `?season=` in the address the site
  picks the season by date (winter until Jan 3, 2027, then Pesach, then Sukkos); `?season=winter`, `?season=pesach` or
  `?season=sukkos` picks one, and the hero and footer have a switch. Update the dates in `seasons.js` each year.
- **Place data:** `data/core.json` (lists and cards) and `data/details.json` (Yiddish descriptions and family reviews) load
  after the first screen. To edit them in one file, run `python3 scripts/data_tool.py merge`, edit `data/all-places.json`,
  then `python3 scripts/data_tool.py split`. The site needs a web server (GitHub Pages or `python3 -m http.server`); opening
  index.html straight from the disk won't load the places.
- **Hours & prices check:** `scripts/check_sites.py` runs every day (Sunday–Friday) on GitHub Actions,
  compares each website with the guide using Google Gemini (free), and saves the results into `data/checks.json`.
- **Ask AI:** a small Supabase Edge Function (`supabase/functions/ask/index.ts`) answers with Google Gemini (free),
  using only the places in this guide (it reads them from `ai/catalog.txt` on the website).

## Added features (features branch)
- **Day planner** (My Trips): pick 2–3 saved places, a starting community, the day and a start time. The site puts them in the order with the
  least driving and shows a timeline. Home ↔ place uses the guide's drive times; place ↔ place is an estimate from the straight-line
  distance and is labeled that way. Opening hours for that day are checked, with a warning when a place is closed or closes early.
- **Open today + winter hours**: `data/hours.json` holds a `winterHours` entry per place (same order as `core.json`), read only from each
  place's official website, with the page (`source`) and the date checked (`checked`). `status` is `holiday` (the site lists Dec 24–Jan 1
  hours), `regular` (weekly hours only), `closed_season`, or `unconfirmed` (the site shows "Hours not confirmed, call first"). The
  "Open today" filter and the day picker use it. It loads after the first screen, so the first load stays the same size.
- **Share my trip**: a saved list or a day plan becomes a PNG picture (drawn in the browser) for the phone's share sheet, or a download
  where sharing isn't available, plus a printable page (Save as PDF from the print dialog). No WhatsApp or social buttons.
- **Yiddish**: the English / יידיש switch is in the top bar and the footer. The choice is kept on the device. `i18n.js` switches the page
  to right-to-left and translates the interface with the words in `yi.js` (English → Yiddish, plus a few patterns for text with numbers).
  Place names and the guide's own text stay as they are. To fix a word, edit `yi.js`.
- **Rainy day**: the "☔ Rainy day?" button (and a quiet check on the home page) reads the free Open-Meteo forecast for the chosen
  community and day. When rain or snow is forecast it suggests indoor places nearby; when the forecast can't load it shows nothing.
- **Davening & Mikvah** (`#daven`, `data/daven.json`): shuls with weekday minyan times, men's mikvaos and women's mikvaos as separate lists,
  for the home communities, more NY/NJ/CT areas and the trip destinations. Every entry has its source page and a "last checked" date;
  women's mikvaos show only the name, town and phone (and a street address only where the directory prints it). Zmanim for the chosen area
  and day are worked out in the browser (sunrise/sunset and sun-angle times, no outside calls). The map has a "Show shuls and men's
  mikvaos" layer; women's mikvaos are never put on the map. Each place's details show the nearest shuls.
- **Ask AI**: `ai/catalog.txt` now carries each place's winter hours, and `ai/trip_info.txt` has the DAVENING & MIKVAH list, so the helper
  sees them without redeploying. The extra rule text in `supabase/functions/ask/index.ts` takes effect after you paste it into the function again.

Listings, booklet photos, Yiddish descriptions and family reviews come from the Navigation Sukkos 5787 guide.
Drive times are estimates from OpenStreetMap road data, calibrated against the guide's own times.

## One-time setup

### 1. GitHub Pages
Settings → Pages → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → Save.
The site appears at `https://david7578433-bit.github.io/chol-hamoed-outing-finder/` after a minute or two.

### 2. Daily check
1. Get a free Gemini key at https://aistudio.google.com/apikey → **Create API key**.
2. Settings → Secrets and variables → Actions → **New repository secret**: name `GEMINI_API_KEY`, value = your key.
3. Actions → **Daily hours and prices check** → **Run workflow** to test it once. After that it runs by itself every morning except Shabbos.

### 3. Ask AI (Supabase Edge Function)
1. In any Supabase project: **Edge Functions → Deploy a new function → Via Editor**, name it `ask`,
   replace the sample code with all of `supabase/functions/ask/index.ts`, and deploy.
   In the function's settings turn **off** "Verify JWT". It doesn't create tables or touch any data in the project.
2. **Edge Functions → Secrets**: add `GEMINI_API_KEY` (your key) and `SITE_URL` = `https://david7578433-bit.github.io/chol-hamoed-outing-finder`.
3. Put the function's URL (`https://YOUR-PROJECT.supabase.co/functions/v1/ask`) and the project's publishable/anon key into `config.js`.

## Free limits
Gemini's free tier allows a limited number of questions per minute and per day. If many people ask at once,
the site says "The free AI is busy right now". On the free tier Google may use the questions to improve its products,
so don't type private information.
