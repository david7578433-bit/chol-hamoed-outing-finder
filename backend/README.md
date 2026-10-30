# Add-your-place backend (Supabase)

Not deployed. Use a NEW, separate Supabase project — never an existing one.

## 1. Create the project
supabase.com → New project → name `outing-finder`. Note the **Project URL** and the **anon / publishable key** (Settings → API).

## 2. Database
SQL Editor → paste `backend/schema.sql` → Run. Then add the admin:

    insert into public.admins(email) values ('admin@example.com');   -- lower-case

## 3. Admin login
Authentication → Users → **Add user** with the admin email (set a password, or use the email link).
Authentication → URL Configuration → add `https://david7578433-bit.github.io/chol-hamoed-outing-finder/admin.html` to **Redirect URLs**.
Authentication → Sign In / Providers → turn **off** "Allow new users to sign up" (only the admin needs an account).

## 4. Email (for the one-time confirmation link)
Make a free account at resend.com, verify a sending domain, create an API key.

## 5. Function
Install the Supabase CLI, then from the `backend/` folder:

    supabase login
    supabase link --project-ref YOUR_PROJECT_REF
    supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Outing Finder <listings@your-domain.com>" \
      SITE_URL=https://david7578433-bit.github.io/chol-hamoed-outing-finder ADMIN_EMAIL=admin@example.com
    supabase functions deploy verify-listing --no-verify-jwt

(`--no-verify-jwt` is needed so the emailed link works; the function checks admin rights itself.)
Optional secret: `WORLD_DATA_URL` (defaults to `SITE_URL/data/world-cities.json`, used to match shuls).

## 6. Switch the site on
Edit `world-config.js`:

    supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
    supabaseAnonKey: 'YOUR_ANON_OR_PUBLISHABLE_KEY',
    adminEmail: 'admin@example.com'

Never put the secret / service_role key in the site.

## How a listing goes live
- **Auto**: website loads (HTTP 200) and shows the same name + phone, AND the contact email is on that website's domain AND its owner clicks the emailed link (48 h, one use).
- **Auto (shuls)**: same name + city already in the site's GoDaven-sourced data.
- **Admin**: everything else, plus every women's mikvah (no street address is ever stored) and every "Advertise" request. Admin page: `admin.html`.
