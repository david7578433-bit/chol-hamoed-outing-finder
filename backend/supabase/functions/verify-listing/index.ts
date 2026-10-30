// verify-listing — Supabase Edge Function (Deno). Deploy with:  supabase functions deploy verify-listing --no-verify-jwt
//
// POST {listing fields}          -> saves the submission, runs the checks, returns {status, failed}
// GET  ?confirm=<token>          -> one-time email link; marks the email confirmed, re-checks, redirects to SITE_URL/list.html
// POST {action:"recheck", id}    -> admin only (Authorization: Bearer <admin session token>)
//
// Auto-publish rule:  (A website live + shows name + phone) AND (B email on the website's domain + link clicked)
//                     OR (C shul whose name + city is already in the site's GoDaven data).
// Women's mikvaos and "sponsor" requests never auto-publish.
//
// Secrets (supabase secrets set ...): RESEND_API_KEY, MAIL_FROM, SITE_URL, ADMIN_EMAIL
// Optional: WORLD_DATA_URL (default SITE_URL + /data/world-cities.json)
// Provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SB_SECRET_KEY") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://david7578433-bit.github.io/chol-hamoed-outing-finder").replace(/\/+$/, "");
const WORLD_DATA_URL = Deno.env.get("WORLD_DATA_URL") ?? `${SITE_URL}/data/world-cities.json`;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "";
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") ?? "").toLowerCase();

const TYPES = ["hotel", "shul", "restaurant", "mikvah_men", "mikvah_women", "chabad", "car_service", "sponsor"];
const UA = "Mozilla/5.0 (compatible; OutingFinderVerify/1.0; +" + SITE_URL + ")";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Failed = { check: string; note: string };
type Row = Record<string, any>;

// ---------- tiny REST client (service role) ----------
async function db(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const getRow = async (id: string): Promise<Row | null> =>
  (await db(`listings_pending?id=eq.${encodeURIComponent(id)}&select=*`))?.[0] ?? null;
const patchRow = (id: string, patch: Row) =>
  db(`listings_pending?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });

// ---------- helpers ----------
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "") || null;
const digits = (s: string) => (s || "").replace(/\D+/g, "");
export function normName(s: string): string {
  return (s || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(the|congregation|cong|kehillas|kehilat|kehillat)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function hostOf(u: string): string | null {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null;
    const h = url.hostname.toLowerCase().replace(/^www\./, "");
    // refuse local / raw-IP targets (keeps the fetch on the public web)
    if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal)$/.test(h)) return null;
    return h;
  } catch { return null; }
}
export function sameDomain(emailDomain: string, siteHost: string): boolean {
  const a = emailDomain.toLowerCase().replace(/^www\./, ""), b = siteHost.toLowerCase();
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;|&apos;|&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/&ndash;|&mdash;/gi, "-")
    .replace(/\s+/g, " ");
}
export function pageHasPhone(raw: string, text: string, phone: string): boolean {
  let want = digits(phone);
  if (want.length < 7) return false;
  if (want.length === 11 && want.startsWith("1")) want = want.slice(1);       // US +1
  const key = want.slice(-9);                                                  // ignores country / trunk prefixes
  const cands = [
    ...(text.match(/\+?\d[\d\s().\-\/]{5,22}\d/g) ?? []),
    ...((raw.match(/tel:[^"'\s>]+/gi) ?? []).map((t) => t.slice(4))),
  ];
  return cands.some((c) => { const d = digits(c); return d.length >= 7 && d.endsWith(key); });
}

async function fetchPage(url: string): Promise<{ status: number; raw: string; finalHost: string | null }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
    const raw = (await r.text()).slice(0, 2_000_000);
    return { status: r.status, raw, finalHost: hostOf(r.url || url) };
  } finally { clearTimeout(t); }
}

// ---------- check A: website live, shows name + phone ----------
async function checkWebsite(row: Row): Promise<{ ok: boolean; failed: Failed[]; detail: Row }> {
  const failed: Failed[] = [];
  const host = row.website ? hostOf(row.website) : null;
  if (!host) return { ok: false, failed: [{ check: "website", note: "No valid website given" }], detail: {} };
  let page;
  try { page = await fetchPage(row.website); }
  catch (e) { return { ok: false, failed: [{ check: "website_live", note: "Website did not load (" + String(e).slice(0, 80) + ")" }], detail: { host } }; }
  if (page.status !== 200) return { ok: false, failed: [{ check: "website_live", note: `Website answered HTTP ${page.status}` }], detail: { host, status: page.status } };
  // also read a contact page if the homepage lacks the phone
  let raw = page.raw, text = htmlToText(page.raw);
  if (!pageHasPhone(raw, text, row.phone ?? "")) {
    const m = page.raw.match(/href=["']([^"']*contact[^"']*)["']/i);
    if (m) {
      try {
        const u = new URL(m[1], row.website).toString();
        if (hostOf(u) && sameDomain(hostOf(u)!, host)) {
          const p2 = await fetchPage(u);
          if (p2.status === 200) { raw += " " + p2.raw; text += " " + htmlToText(p2.raw); }
        }
      } catch { /* ignore */ }
    }
  }
  const nameOk = !!normName(row.name) && normName(text).includes(normName(row.name));
  const phoneOk = pageHasPhone(raw, text, row.phone ?? "");
  if (!nameOk) failed.push({ check: "website_name", note: "Business name not found on the website" });
  if (!phoneOk) failed.push({ check: "website_phone", note: row.phone ? "Phone number not found on the website" : "No phone given" });
  return { ok: nameOk && phoneOk, failed, detail: { host, finalHost: page.finalHost, status: 200, nameOk, phoneOk } };
}

// ---------- check C: shul already in the site's GoDaven data ----------
let worldCache: any = null;
async function inGoDavenData(row: Row): Promise<boolean> {
  if (row.type !== "shul") return false;
  try {
    if (!worldCache) {
      const r = await fetch(WORLD_DATA_URL, { headers: { "User-Agent": UA } });
      if (!r.ok) return false;
      worldCache = await r.json();
    }
    const cities: any[] = Array.isArray(worldCache) ? worldCache : (worldCache.cities ?? Object.values(worldCache));
    const city = cities.find((c: any) => c && c.id === row.city_id);
    if (!city) return false;
    const names: string[] = [];
    for (const [k, v] of Object.entries(city)) {
      if (/shul|minyan|synagog/i.test(k) && Array.isArray(v)) for (const s of v as any[]) if (s?.name) names.push(String(s.name));
    }
    const want = normName(row.name);
    return !!want && names.some((n) => normName(n) === want);
  } catch { return false; }
}

// ---------- check B: email on the site's domain + one-time link ----------
async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function sendConfirmEmail(row: Row): Promise<string | null> {
  if (!RESEND_API_KEY || !MAIL_FROM) return "Email sending not set up (RESEND_API_KEY / MAIL_FROM)";
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, "0")).join("");
  await db("email_confirmations", { method: "POST", body: JSON.stringify({ token_hash: await sha256hex(token), pending_id: row.id, email: row.contact_email }) });
  const link = `${SB_URL}/functions/v1/verify-listing?confirm=${token}`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM, to: [row.contact_email],
      subject: `Confirm your listing: ${row.name}`,
      text: `Please confirm "${row.name}" for the Outing Finder by opening this link (valid 48 hours, one time):\n\n${link}\n\nIf you didn't submit this, ignore this email.`,
    }),
  });
  return r.ok ? null : `Confirmation email failed (HTTP ${r.status})`;
}

// ---------- evaluate one submission ----------
async function evaluate(row: Row, opts: { sendEmail: boolean }): Promise<{ status: string; failed: Failed[] }> {
  const failed: Failed[] = [];
  const checks: Row = { at: new Date().toISOString() };

  if (row.type === "mikvah_women") failed.push({ check: "policy", note: "Women's mikvah: always reviewed by admin" });
  if (row.type === "sponsor") failed.push({ check: "policy", note: "Sponsored request: always reviewed by admin" });
  if (failed.length) {
    await patchRow(row.id, { status: "pending", checks: { ...checks, policy: true }, failed_checks: failed, checked_at: new Date().toISOString() });
    return { status: "pending", failed };
  }

  // C (shuls)
  const c = await inGoDavenData(row);
  checks.godaven = c;
  if (c) {
    await patchRow(row.id, { checks, failed_checks: [], checked_at: new Date().toISOString() });
    await db("rpc/publish_listing", { method: "POST", body: JSON.stringify({ p_id: row.id, p_by: "auto_godaven" }) });
    return { status: "published", failed: [] };
  }

  // A
  const a = await checkWebsite(row);
  checks.website = a.detail;
  failed.push(...a.failed);

  // B
  const emailDomain = String(row.contact_email).split("@")[1] ?? "";
  const domainOk = !!a.detail.host && sameDomain(emailDomain, a.detail.host);
  checks.email_domain = domainOk;
  if (!domainOk) failed.push({ check: "email_domain", note: `Email (${emailDomain}) is not on the website's domain` });
  const confirmed = !!row.email_confirmed_at;
  checks.email_confirmed = confirmed;

  if (a.ok && domainOk && confirmed) {
    await patchRow(row.id, { checks, failed_checks: [], checked_at: new Date().toISOString() });
    await db("rpc/publish_listing", { method: "POST", body: JSON.stringify({ p_id: row.id, p_by: "auto_website_email" }) });
    return { status: "published", failed: [] };
  }
  let status = "pending";
  if (a.ok && domainOk && !confirmed) {
    if (opts.sendEmail) {
      const err = await sendConfirmEmail(row);
      if (err) failed.push({ check: "email_confirm", note: err });
      else { failed.push({ check: "email_confirm", note: "Waiting for the email link to be clicked" }); status = "awaiting_email"; }
    } else failed.push({ check: "email_confirm", note: "Email link not clicked yet" });
  } else {
    failed.push({ check: "email_confirm", note: "Not sent (website/domain checks failed)" });
  }
  await patchRow(row.id, { status, checks, failed_checks: failed, checked_at: new Date().toISOString() });
  return { status, failed };
}

// ---------- handlers ----------
async function handleSubmit(body: Row): Promise<Response> {
  if (body.hp) return json({ status: "pending", failed: [] });            // honeypot: bots fill it
  const type = String(body.type ?? "");
  if (!TYPES.includes(type)) return json({ error: "Unknown type" }, 400);
  const row: Row = {
    type,
    name: clip(body.name, 120), city_id: clip(body.city_id, 60),
    address: type === "mikvah_women" ? null : clip(body.address, 200),
    phone: clip(body.phone, 40), website: clip(body.website, 300),
    contact_email: (clip(body.contact_email, 200) ?? "").toLowerCase(),
    description: clip(body.description, 600),
    minyan_times: type === "shul" ? clip(body.minyan_times, 400) : null,
    kashrus: type === "restaurant" ? clip(body.kashrus, 120) : null,
  };
  if (row.website && !/^https?:\/\//i.test(row.website)) row.website = "https://" + row.website;
  if (!row.name || !row.city_id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.contact_email)) return json({ error: "Name, city and a valid email are required" }, 400);

  // simple flood guard: 5 submissions per email per hour
  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent = await db(`listings_pending?contact_email=eq.${encodeURIComponent(row.contact_email)}&created_at=gt.${since}&select=id`);
  if ((recent?.length ?? 0) >= 5) return json({ error: "Too many submissions, try later" }, 429);

  const saved = (await db("listings_pending", { method: "POST", body: JSON.stringify(row) }))[0];
  try {
    return json(await evaluate(saved, { sendEmail: true }));
  } catch (e) {
    await patchRow(saved.id, { failed_checks: [{ check: "error", note: String(e).slice(0, 200) }] }).catch(() => {});
    return json({ status: "pending", failed: [{ check: "error", note: "Checks could not finish; an admin will review" }] });
  }
}

async function handleConfirm(token: string): Promise<Response> {
  const go = (q: string) => new Response(null, { status: 302, headers: { Location: `${SITE_URL}/list.html?confirm=${q}` } });
  if (!/^[a-f0-9]{48}$/.test(token)) return go("bad");
  const hash = await sha256hex(token);
  const rows = await db(`email_confirmations?token_hash=eq.${hash}&select=*`);
  const t = rows?.[0];
  if (!t || t.used_at) return go("used");
  if (new Date(t.expires_at).getTime() < Date.now()) return go("expired");
  await db(`email_confirmations?token_hash=eq.${hash}&used_at=is.null`, { method: "PATCH", body: JSON.stringify({ used_at: new Date().toISOString() }) });
  const row = await getRow(t.pending_id);
  if (!row || row.status === "approved" || row.status === "rejected") return go("done");
  if (String(row.contact_email).toLowerCase() !== String(t.email).toLowerCase()) return go("bad");
  await patchRow(row.id, { email_confirmed_at: new Date().toISOString() });
  row.email_confirmed_at = new Date().toISOString();
  const r = await evaluate(row, { sendEmail: false });   // re-checks the website at click time
  return go(r.status === "published" ? "live" : "review");
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!ADMIN_EMAIL || !auth.startsWith("Bearer ")) return false;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: auth } });
  if (!r.ok) return false;
  const u = await r.json();
  return String(u?.email ?? "").toLowerCase() === ADMIN_EMAIL;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!SB_URL || !SB_KEY) return json({ error: "Function not configured" }, 500);
    const url = new URL(req.url);
    if (req.method === "GET") {
      const token = url.searchParams.get("confirm");
      return token ? await handleConfirm(token) : json({ ok: true });
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const body = await req.json().catch(() => ({}));
    if (body?.action === "recheck") {
      if (!(await isAdminRequest(req))) return json({ error: "Admin only" }, 403);
      const row = await getRow(String(body.id ?? ""));
      if (!row) return json({ error: "Not found" }, 404);
      return json(await evaluate(row, { sendEmail: !!body.resendEmail }));
    }
    return await handleSubmit(body ?? {});
  } catch (e) {
    console.error(e);
    return json({ error: "Server error" }, 500);
  }
});
