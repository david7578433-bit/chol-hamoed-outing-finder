/* Loads community listings + sponsors for world.html.
   window.WorldListings.load() -> { listings: [...], sponsors: [...] }  (never throws)
   With keys in world-config.js: Supabase REST (listings_live, active sponsors).
   Without keys: data/sponsors.json and no listings. No tracking, no external scripts. */
(function () {
  'use strict';
  var TYPES = ['hotel', 'shul', 'restaurant', 'mikvah_men', 'mikvah_women', 'chabad', 'car_service'];
  var cache = null;

  function cfg() {
    var c = window.WORLD_CONFIG || {};
    return { url: String(c.supabaseUrl || '').replace(/\/+$/, ''), key: String(c.supabaseAnonKey || '') };
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function str(v) { return v == null ? '' : String(v); }
  function safeUrl(u) {
    u = str(u).trim();
    return /^https?:\/\//i.test(u) ? u : '';
  }
  function getJSON(url, headers) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    return fetch(url, { headers: headers || {}, signal: ctl ? ctl.signal : undefined, cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(function () { if (t) clearTimeout(t); });
  }
  function cleanListing(r) {
    if (!r || TYPES.indexOf(r.type) < 0 || !r.name) return null;
    var o = {
      type: r.type, name: str(r.name), city_id: str(r.city_id),
      phone: str(r.phone), website: safeUrl(r.website), description: str(r.description),
      verified: r.verified === true, verified_at: r.verified_at || null
    };
    if (r.type !== 'mikvah_women') o.address = str(r.address);   // never an address for women's mikvaos
    if (r.type === 'shul' && r.minyan_times) o.minyan_times = str(r.minyan_times);
    if (r.type === 'restaurant' && r.kashrus) o.kashrus = str(r.kashrus);
    return o;
  }
  function activeSponsor(s, d) {
    if (!s || !s.name || !s.text) return false;
    if (s.active === false) return false;
    if (s.start_date && s.start_date > d) return false;
    if (s.end_date && s.end_date < d) return false;
    return true;
  }
  function cleanSponsor(s) {
    return { name: str(s.name), city_id: str(s.city_id || 'all'), text: str(s.text).slice(0, 120), url: safeUrl(s.url) };
  }

  async function load() {
    if (cache) return cache;
    var out = { listings: [], sponsors: [] };
    var c = cfg(), d = today();
    try {
      if (c.url && c.key) {
        var h = { apikey: c.key, Accept: 'application/json' };
        if (!/^sb_/.test(c.key)) h.Authorization = 'Bearer ' + c.key; // legacy JWT anon keys
        var lq = c.url + '/rest/v1/listings_live?select=type,name,city_id,address,phone,website,description,minyan_times,kashrus,verified,verified_at&order=name.asc&limit=2000';
        var sq = c.url + '/rest/v1/sponsors?select=name,city_id,text,url,active,start_date,end_date&active=eq.true&limit=500';
        var res = await Promise.allSettled([getJSON(lq, h), getJSON(sq, h)]);
        if (res[0].status === 'fulfilled' && Array.isArray(res[0].value)) out.listings = res[0].value.map(cleanListing).filter(Boolean);
        if (res[1].status === 'fulfilled' && Array.isArray(res[1].value)) out.sponsors = res[1].value.filter(function (s) { return activeSponsor(s, d); }).map(cleanSponsor);
      } else {
        var s = await getJSON('data/sponsors.json');
        if (Array.isArray(s)) out.sponsors = s.filter(function (x) { return activeSponsor(x, d); }).map(cleanSponsor);
      }
    } catch (e) { /* quiet: empties */ }
    cache = out;
    return out;
  }

  window.WorldListings = {
    load: function () { return load().catch(function () { return { listings: [], sponsors: [] }; }); },
    /* helpers for world.html (optional) */
    forCity: function (data, cityId) {
      data = data || {};
      return {
        listings: (data.listings || []).filter(function (l) { return l.city_id === cityId; }),
        sponsors: (data.sponsors || []).filter(function (s) { return s.city_id === cityId || s.city_id === 'all'; })
      };
    }
  };
})();
