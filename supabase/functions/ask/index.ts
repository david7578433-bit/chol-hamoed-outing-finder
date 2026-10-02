// Supabase Edge Function: answers "Ask AI" questions with Google Gemini (free tier),
// using only the places in the guide. The place list is read from the website (ai/catalog.txt).

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim());
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
let cache: { at: number; catalog: string; trips: string } | null = null;
async function guide() {
  if (cache && Date.now() - cache.at < 6 * 3600 * 1000) return cache;
  const [c, t] = await Promise.all([fetch(`${SITE_URL}/ai/catalog.txt`), fetch(`${SITE_URL}/ai/trip_info.txt`)]);
  if (!c.ok) throw new Error("catalog " + c.status);
  cache = { at: Date.now(), catalog: await c.text(), trips: t.ok ? await t.text() : "" };
  return cache;
}

function cors(origin: string | null) {
  const allow = ALLOWED.includes("*") ? "*" : (origin && ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

const RULES = `You are the helper inside "Chol Hamoed Outing Finder", a website listing the places in the Navigation Sukkos 5787 outings guide. The guide is made for frum (Orthodox Jewish) families from Williamsburg, Boro Park, Flatbush, Crown Heights, Monsey, Monroe/Kiryas Joel, New Square, Lakewood, Passaic, the Five Towns and Queens.

Strict rules:
1. Recommend ONLY places from the CATALOG below. Never name, suggest or describe any place, restaurant, store, event or activity that is not in the catalog, even if asked and even if you know one. This is a kosher guide and the family only wants places from it. If nothing fits, say so and suggest widening the search (longer drive, another category, trips away).
2. Keep everything appropriate for a kosher, frum family. Don't claim a place has kosher food unless the catalog says so; suggest bringing their own food. For trips, you may mention the shuls, mikvahs and kosher food listed under TRIP INFO.
3. Every time you recommend a place, write its id in double square brackets right after its name, like: Bounce! Trampoline Sports [[0]]. The website turns that into a button with photos and details.
4. Hours and prices are from the printed guide for Chol Hamoed Sukkos 5787 and may be out of date; remind them to call ahead.
5. Be practical: fit to the kids' ages, the drive time from their community, indoor or outdoor, and an estimated total cost for the family when the price allows (for example "$25 x 5 kids = about $125").
6. Use the family reviews in the catalog. Mention helpful tips, and clearly mention any caution that matters to a frum family (for example a review saying it was crowded with immodest people or goyim, mixed swimming, or non-kosher food). Prefer well-reviewed places. Never invent reviews.
7. Keep answers short and clear: 2 to 4 suggestions, one or two lines each, best first. Ask one short question only if you truly can't suggest anything without it.
8. Answer in the language the person writes in (English or Yiddish).
9. Only talk about planning outings from this guide. Politely decline anything else.

Catalog line format: id|name|category|town|ages|indoors or outdoors|starting price per person|drive times|hours|price|family reviews`;

type Turn = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method" }), { status: 405, headers });
  if (!ALLOWED.includes("*") && origin && !ALLOWED.includes(origin)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers });
  }
  if (!GEMINI_KEY || !SITE_URL) return new Response(JSON.stringify({ error: "not_configured" }), { status: 500, headers });
  let g;
  try { g = await guide(); } catch (e) { console.error(e); return new Response(JSON.stringify({ error: "not_configured" }), { status: 500, headers }); }
  let body: { messages?: Turn[]; origin?: string; today?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers }); }
  const turns = (body.messages ?? []).filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .slice(-12).map((t) => ({ role: t.role, content: t.content.slice(0, 2500) }));
  if (!turns.length || turns[turns.length - 1].role !== "user") {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers });
  }
  const from = String(body.origin ?? "").slice(0, 40);
  const today = String(body.today ?? new Date().toDateString()).slice(0, 40);
  const system = `${RULES}\n\nToday is ${today}. The website is set to drive times from: ${from || "not set"} (use it unless they say otherwise).\n\nTRIP INFO (shuls, mikvahs, kosher food at trip destinations):\n${g.trips}\n\nCATALOG:\n${g.catalog}`;
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
    generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify(payload),
  });
  if (r.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    console.error("gemini error", r.status, detail);
    return new Response(JSON.stringify({ error: "upstream_error" }), { status: 502, headers });
  }
  const j = await r.json();
  const text = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!text) return new Response(JSON.stringify({ error: "empty" }), { status: 502, headers });
  return new Response(JSON.stringify({ text }), { headers });
});
