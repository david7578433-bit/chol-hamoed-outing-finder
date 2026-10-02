# Chol Hamoed Outing Finder

Every place from the Navigation Sukkos 5787 outings guide (yazory.com), with booklet photos, family reviews,
websites, phone numbers, hours, prices and drive times from Monsey, Monroe (Kiryas Joel), New Square,
Williamsburg, Boro Park, Flatbush, Crown Heights, Queens, the Five Towns, Lakewood and Passaic.

- **Website:** plain HTML, hosted free on GitHub Pages (`index.html`, `photos/`, `gallery/`, `ai/`).
- **Hours & prices check:** `scripts/check_sites.py` runs every day (Sunday–Friday) on GitHub Actions,
  compares each website with the guide using Google Gemini (free), and saves results in Supabase.
- **Ask AI:** a Supabase Edge Function (`supabase/functions/ask/index.ts`) answers with Google Gemini (free),
  using only the places in this guide.

Listings, booklet photos, Yiddish descriptions and family reviews come from the Navigation Sukkos 5787 guide.
Drive times are estimates from OpenStreetMap road data, calibrated against the guide's own times.

## One-time setup

### 1. GitHub Pages
Settings → Pages → *Build and deployment* → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → Save.
The site appears at `https://YOUR-USERNAME.github.io/chol-hamoed-outing-finder/` after a minute or two.

### 2. Google Gemini key (free)
Go to https://aistudio.google.com/apikey → **Create API key** → copy it. Keep it private.

### 3. Supabase
1. Create a new project (free plan).
2. **SQL Editor → New query**: paste all of `supabase/schema.sql` → **Run**. Then paste `supabase/seed_checks.sql` → **Run**.
3. **Edge Functions → Deploy a new function → Via Editor**: name it `ask`, replace the sample code with all of
   `supabase/functions/ask/index.ts`, and deploy. Then open the function's settings and turn **off** "Verify JWT".
4. **Edge Functions → Secrets**: add
   - `GEMINI_API_KEY` = your Gemini key
   - `SITE_URL` = `https://YOUR-USERNAME.github.io/chol-hamoed-outing-finder`
5. **Project Settings → API Keys**: copy the **Project URL** and the **publishable / anon** key into `config.js`.
   (These two are meant to be public.)

### 4. GitHub secrets for the daily check
Repository **Settings → Secrets and variables → Actions**:
- *Secrets*: `GEMINI_API_KEY` (your Gemini key) and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys → **secret / service_role** key).
- *Variables*: `SUPABASE_URL` (the Project URL).

Then **Actions → Daily hours and prices check → Run workflow** to test it once.

## Free limits
Gemini's free tier allows a limited number of questions per minute and per day. If many people ask at once,
the site says "The free AI is busy right now". On the free tier Google may use the questions to improve its products,
so don't type private information.
