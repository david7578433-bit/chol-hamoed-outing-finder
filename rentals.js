/* Rentals / Dira: list approved rentals (rentals_live) with filters, and send new listings to the admin (rentals_pending).
   Same backend as "Add your place" (world-config.js + backend/schema.sql + backend/rentals.sql). Nothing goes live without the admin. */
(function () {
  'use strict';
  var C = window.WORLD_CONFIG || {};
  var URL_ = String(C.supabaseUrl || '').replace(/\/+$/, '');
  var KEY = String(C.supabaseAnonKey || '');
  var LIVE = !!(URL_ && KEY);
  var T = function (s, v) { return window.T ? window.T(s, v) : s; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var TOWNS = [['monroe_kj', 'Monroe / KJ'], ['williamsburg', 'Williamsburg'], ['monsey', 'Monsey'], ['boro_park', 'Boro Park'], ['lakewood', 'Lakewood'], ['catskills', 'Catskills / Mountains'], ['other', 'Other area']];
  var KINDS = [['yomtov', 'Yom Tov / seasonal rental'], ['bungalow', 'Summer bungalow'], ['apt_rent', 'Apartment for rent'], ['house_sale', 'House for sale']];
  var PER = { night: 'night', week: 'week', month: 'month', season: 'season', yomtov: 'Yom Tov', total: '' };
  var townName = {}, kindName = {};
  TOWNS.forEach(function (t) { townName[t[0]] = t[1]; });
  KINDS.forEach(function (k) { kindName[k[0]] = k[1]; });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function headers() {
    var h = { apikey: KEY, 'Content-Type': 'application/json' };
    if (!/^sb_/.test(KEY)) h.Authorization = 'Bearer ' + KEY;
    return h;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtDay(s, withYear) {
    try { return new Date(s + 'T12:00:00Z').toLocaleDateString(window.LANG === 'yi' ? 'en-US' : undefined, { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' }); } catch (e) { return s; }
  }
  function fmtDates(a, b) {
    if (a && b) return fmtDay(a, a.slice(0, 4) !== b.slice(0, 4)) + ' – ' + fmtDay(b, true);
    if (a) return T('From') + ' ' + fmtDay(a, true);
    if (b) return T('Until') + ' ' + fmtDay(b, true);
    return '';
  }
  function fmtPrice(r) {
    if (r.price == null) return T('Price on request');
    var p = '$' + Number(r.price).toLocaleString('en-US');
    var per = PER[r.price_per];
    return per ? p + ' / ' + T(per) : p;
  }
  function isFeatured(r) { return !!r.featured && (!r.featured_until || r.featured_until >= today()); }

  /* dropdowns */
  $$('select[data-towns]').forEach(function (sel) {
    sel.innerHTML = (sel.hasAttribute('data-any') ? '<option value="">All towns</option>' : '<option value="">Choose…</option>') +
      TOWNS.map(function (t) { return '<option value="' + t[0] + '">' + esc(t[1]) + '</option>'; }).join('');
  });
  $$('select[data-kinds]').forEach(function (sel) {
    sel.innerHTML = (sel.hasAttribute('data-any') ? '<option value="">All types</option>' : '<option value="">Choose…</option>') +
      KINDS.map(function (k) { return '<option value="' + k[0] + '">' + esc(k[1]) + '</option>'; }).join('');
  });

  /* tabs */
  var tabs = $$('[role=tab]');
  function show(id) {
    tabs.forEach(function (t) {
      var on = t.id === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.id); history.replaceState(null, '', t.id === 't-post' ? '#post' : location.pathname + location.search); }); });
  if (location.hash === '#post') show('t-post');
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-go-post]');
    if (!a) return;
    e.preventDefault(); show('t-post'); history.replaceState(null, '', '#post');
    $('#t-post').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* banner */
  var banner = $('#banner');
  if (!LIVE) {
    banner.innerHTML = '<strong>' + esc(T('Coming soon.')) + '</strong> ' + esc(T('Posting opens shortly.'));
    banner.hidden = false;
    $$('[data-submit]').forEach(function (b) { b.disabled = true; b.textContent = T('Coming soon'); });
  }

  /* ---------- list + filters ---------- */
  var all = [], loaded = false, loadError = '';
  var ff = $('#f-filter');
  if (window.matchMedia && window.matchMedia('(max-width: 699px)').matches) $('#filters').open = false;

  function filters() {
    return {
      town: ff.town.value, kind: ff.kind.value, beds: Number(ff.beds.value || 0),
      pmin: ff.pmin.value === '' ? null : Number(ff.pmin.value), pmax: ff.pmax.value === '' ? null : Number(ff.pmax.value),
      dfrom: ff.dfrom.value, dto: ff.dto.value, q: ff.q.value.trim().toLowerCase()
    };
  }
  function match(r, f) {
    if (f.town && r.town !== f.town) return false;
    if (f.kind && r.kind !== f.kind) return false;
    if (f.beds && !(r.beds >= f.beds)) return false;
    if (f.pmin != null || f.pmax != null) {
      if (r.price == null) return false;
      if (f.pmin != null && r.price < f.pmin) return false;
      if (f.pmax != null && r.price > f.pmax) return false;
    }
    if (f.dfrom && r.date_to && r.date_to < f.dfrom) return false;
    if (f.dto && r.date_from && r.date_from > f.dto) return false;
    if (f.q) {
      var hay = [r.near_shul, r.title, r.description].join(' ').toLowerCase();
      if (f.q.split(/\s+/).some(function (w) { return hay.indexOf(w) < 0; })) return false;
    }
    return true;
  }
  function activeCount(f) {
    return ['town', 'kind', 'dfrom', 'dto', 'q'].filter(function (k) { return f[k]; }).length + (f.beds ? 1 : 0) + (f.pmin != null || f.pmax != null ? 1 : 0);
  }
  function telHref(p) { var d = String(p || '').replace(/[^\d+]/g, ''); return d.length >= 7 ? 'tel:' + d : ''; }
  function card(r) {
    var feat = isFeatured(r);
    var facts = [kindName[r.kind] ? T(kindName[r.kind]) : '', townName[r.town] ? T(townName[r.town]) : '',
      r.beds != null ? (r.beds === 0 ? T('Studio') : T(r.beds === 1 ? '{n} bedroom' : '{n} bedrooms', { n: r.beds })) : ''].filter(Boolean).join(' · ');
    var dates = fmtDates(r.date_from, r.date_to);
    var tel = telHref(r.contact_phone);
    var mail = r.contact_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.contact_email) ? 'mailto:' + r.contact_email + '?subject=' + encodeURIComponent(r.title) : '';
    var photo = r.photo_url && /^https:\/\//i.test(r.photo_url)
      ? '<div class="ph"><img src="' + esc(r.photo_url) + '" alt="' + esc(T('Photo of the home')) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>' : '';
    return '<article class="rent' + (feat ? ' featured' : '') + '">' + photo + '<div class="bd">' +
      (feat ? '<span class="badge"><span aria-hidden="true">★</span> ' + esc(T('Featured')) + '</span>' : '') +
      '<h3>' + esc(r.title) + '</h3>' +
      '<div class="price">' + esc(fmtPrice(r)) + '</div>' +
      '<div class="line">' + esc(facts) + '</div>' +
      (dates ? '<div class="line">📅 ' + esc(dates) + '</div>' : '') +
      (r.near_shul ? '<div class="line">' + esc(T('Near shul:')) + ' <span dir="auto">' + esc(r.near_shul) + '</span></div>' : '') +
      (r.description ? '<p class="desc" dir="auto">' + esc(r.description) + '</p>' : '') +
      '<div class="acts">' +
        (tel ? '<a class="btn small" href="' + esc(tel) + '">' + esc(T('Call')) + (r.contact_name ? ' ' + '<span dir="auto">' + esc(r.contact_name) + '</span>' : '') + '</a>' : '') +
        (mail ? '<a class="btn ghost small" href="' + esc(mail) + '">' + esc(T('Email')) + '</a>' : '') +
      '</div>' +
      '<div class="posted">' + esc(T('Posted')) + ' ' + esc(fmtDay(String(r.created_at || '').slice(0, 10), true)) + '</div>' +
      '</div></article>';
  }
  function emptyFirst() {
    return '<div class="card empty"><div class="ico"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg></div>' +
      '<h2>' + esc(T('Be the first to post a rental')) + '</h2>' +
      '<p>' + esc(T('No rentals are listed yet. Landlords and brokers can post one for free; we check each listing before it shows.')) + '</p>' +
      '<a class="btn" href="#post" data-go-post>' + esc(T('Post a listing')) + '</a></div>';
  }
  function render() {
    var f = filters(), n = activeCount(f), el = $('#results'), cnt = $('#count');
    $('#f-active').textContent = n ? T('({n} on)', { n: n }) : '';
    if (!loaded) { cnt.textContent = LIVE ? T('Loading…') : ''; if (!LIVE) el.innerHTML = emptyFirst(); return; }
    if (loadError) { cnt.textContent = ''; el.innerHTML = '<div class="note bad">' + esc(T('Could not load rentals right now. Please try again later.')) + '</div>'; return; }
    if (!all.length) { cnt.textContent = ''; el.innerHTML = emptyFirst(); return; }
    var list = all.filter(function (r) { return match(r, f); });
    cnt.textContent = T(list.length === 1 ? 'Showing {n} rental' : 'Showing {n} rentals', { n: list.length });
    el.innerHTML = list.length ? list.map(card).join('')
      : '<div class="card empty"><h2>' + esc(T('No rentals match these filters')) + '</h2><p>' + esc(T('Try fewer filters, or check back soon.')) + '</p><button class="btn ghost" type="button" data-clear>' + esc(T('Clear filters')) + '</button></div>';
  }
  ff.addEventListener('input', render);
  ff.addEventListener('change', render);
  ff.addEventListener('reset', function () { setTimeout(render, 0); });
  $('#results').addEventListener('click', function (e) { if (e.target.closest('[data-clear]')) { ff.reset(); } });

  async function load() {
    if (!LIVE) { render(); return; }
    render();
    try {
      var r = await fetch(URL_ + '/rest/v1/rentals_live?select=id,created_at,title,town,kind,beds,price,price_per,date_from,date_to,near_shul,description,contact_name,contact_phone,contact_email,photo_url,featured,featured_until&order=created_at.desc&limit=500', { headers: headers() });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      all = await r.json();
      all.sort(function (a, b) { return (isFeatured(b) - isFeatured(a)) || String(b.created_at).localeCompare(String(a.created_at)); });
    } catch (e) { loadError = e.message || 'error'; }
    loaded = true; render();
  }
  (window.I18N_READY || Promise.resolve()).then(function () {
    var ph = document.querySelector('#f-post textarea[name=description]'); if (ph) ph.placeholder = T(ph.placeholder);
    load();
  });

  /* ---------- post a listing ---------- */
  var fp = $('#f-post');
  function syncKind() {
    var sale = fp.kind.value === 'house_sale';
    [fp.date_from, fp.date_to].forEach(function (i) { i.closest('label').hidden = sale; if (sale) i.value = ''; });
    if (sale) fp.price_per.value = 'total';
  }
  fp.kind.addEventListener('change', syncKind);
  var cnt = $('[data-count]', fp), ta = fp.description;
  ta.addEventListener('input', function () { cnt.textContent = ta.value.length + '/' + ta.maxLength; });

  function validate() {
    var bad = [], v = function (n) { return String(fp[n].value || '').trim(); };
    if (v('title').length < 3) bad.push([fp.title, T('Please add a title.')]);
    if (!v('town')) bad.push([fp.town, T('Please choose a town.')]);
    if (!v('kind')) bad.push([fp.kind, T('Please choose a type.')]);
    if (!v('contact_phone') && !v('contact_email')) bad.push([fp.contact_phone, T('Please give a phone number or an email.')]);
    if (v('contact_email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('contact_email'))) bad.push([fp.contact_email, T('Please check the email.')]);
    if (v('photo_url') && !/^https:\/\/\S+$/i.test(v('photo_url'))) bad.push([fp.photo_url, T('The photo link must start with https://')]);
    if (v('beds') && !(Number(v('beds')) >= 0 && Number(v('beds')) <= 20)) bad.push([fp.beds, T('Bedrooms: 0 to 20.')]);
    if (v('date_from') && v('date_to') && v('date_to') < v('date_from')) bad.push([fp.date_to, T('The end date is before the start date.')]);
    if (!fp.ok.checked) bad.push([fp.ok, T('Please confirm you may rent or sell this home.')]);
    return bad;
  }
  fp.addEventListener('submit', async function (e) {
    e.preventDefault();
    var st = $('[data-status]', fp), res = $('[data-result]', fp), btn = $('[data-submit]', fp);
    $$('[aria-invalid]', fp).forEach(function (x) { x.removeAttribute('aria-invalid'); });
    if (!LIVE) { st.textContent = T('Coming soon.'); return; }
    var bad = validate();
    if (bad.length) {
      bad.forEach(function (b) { b[0].setAttribute('aria-invalid', 'true'); });
      res.innerHTML = '<div class="note bad" style="margin-top:12px"><ul>' + bad.map(function (b) { return '<li>' + esc(b[1]) + '</li>'; }).join('') + '</ul></div>';
      bad[0][0].focus(); return;
    }
    var thanks = '<div class="note" style="margin-top:12px"><strong>' + esc(T('Thank you!')) + '</strong> ' + esc(T('Your listing was sent for review. It will show on this page after we approve it.')) + '</div>';
    if (fp.hp.value) { fp.reset(); res.innerHTML = thanks; return; }
    var num = function (n) { var x = String(fp[n].value || '').trim(); return x === '' ? null : Math.round(Number(x)); };
    var txt = function (n) { var x = String(fp[n].value || '').trim(); return x || null; };
    var body = {
      title: txt('title'), town: txt('town'), kind: txt('kind'), beds: num('beds'), price: num('price'), price_per: txt('price_per'),
      date_from: txt('date_from'), date_to: txt('date_to'), near_shul: txt('near_shul'), description: txt('description'),
      contact_name: txt('contact_name'), contact_phone: txt('contact_phone'), contact_email: txt('contact_email') ? txt('contact_email').toLowerCase() : null,
      photo_url: txt('photo_url'), wants_featured: fp.wants_featured.checked
    };
    if (body.price == null) body.price_per = null;
    btn.disabled = true; st.textContent = T('Sending…'); res.innerHTML = '';
    try {
      var r = await fetch(URL_ + '/rest/v1/rentals_pending', { method: 'POST', headers: Object.assign(headers(), { Prefer: 'return=minimal' }), body: JSON.stringify(body) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fp.reset(); syncKind(); cnt.textContent = '0/1200'; st.textContent = '';
      res.innerHTML = thanks;
      try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'rental-posted', title: 'Rental posted', event: true }); } catch (e2) { /* ignore */ }
    } catch (err) {
      st.textContent = '';
      res.innerHTML = '<div class="note bad" style="margin-top:12px">' + esc(T('Sorry, that did not go through. Please try again in a minute.')) + '</div>';
    }
    btn.disabled = false;
  });
})();
