/* Outing Finder app. Data: data/core.json + data/details.json; season settings: seasons.js; website checks: data/checks.json. */
(async function () {
  const SEASON = window.SEASON || { id: 'sukkos', base: true, copyTitle: 'My Chol Hamoed list' };
  const WINTER = SEASON.id === 'winter';
  // Data lives in two files so the first screen is quick: data/core.json (what lists and cards need) and
  // data/details.json (Yiddish descriptions and family reviews), which loads right after.
  async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }
  const T = window.T || ((s, v) => v ? String(s).replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m) : s);
  const YI = window.LANG === 'yi';
  let DATA;
  const langReady = window.I18N_READY || Promise.resolve();
  try { [DATA] = await Promise.all([getJSON('data/core.json'), langReady]); }
  catch (e) { const g = document.getElementById('grid'); document.querySelectorAll('#fun-grid, #grid').forEach(el => { el.innerHTML = '<div class="empty">The places could not load. Check your internet connection and reload the page.</div>'; }); return; }
  (function expand() {
    const ok = (DATA.origins || []).map(o => o.k);
    DATA.places.forEach(p => {
      if (Array.isArray(p.t)) { const t = {}; p.t.forEach((m, k) => { if (m != null) t[ok[k]] = m; }); p.t = t; }
      p.d = p.d || ''; p.rv = new Array(p.rn || 0).fill(null);
    });
    (SEASON.addPlaces || []).forEach(x => {
      const from = x.tFrom != null ? DATA.places[x.tFrom] : null;
      DATA.places.push(Object.assign({ h: '', pr: '', g: '', d: '', mall: '', pg: 0, gal: [], gg: [], rv: [], fp: null, src: 'new' }, x, { t: from ? Object.assign({}, from.t) : {} }));
    });
  })();
  const P = DATA.places, TRIPS = DATA.trips, G = DATA.gal || { cols: 5, rows: 5 };
  const LOCAL_ORDER = ['Indoor Fun','Outdoor Fun','Water Fun','Zoos & Aquariums','Museums','Parks & Farms','Malls','Catskills','Airports'];
  const TRIP_ORDER = [...new Set(P.filter(p => p.k === 'trip').map(p => p.s))];
  if (SEASON.tripFirst) { const f = SEASON.tripFirst, r = s => f.indexOf(s) < 0 ? 99 : f.indexOf(s); TRIP_ORDER.sort((a, b) => r(a) - r(b)); }
  const AGE_TAGS = ['Toddler+','Entire Family','12+','Other ages'];
  const ORIG = DATA.origins || [];
  const SEC_COLOR = { 'Indoor Fun': '#8b5cf6', 'Outdoor Fun': '#f97316', 'Water Fun': '#0ea5e9', 'Zoos & Aquariums': '#16a34a', 'Museums': '#d97706', 'Parks & Farms': '#65a30d', 'Malls': '#ec4899', 'Catskills': '#0d9488', 'Airports': '#4f46e5' };
  const TRIP_COLORS = ['#0ea5e9', '#f97316', '#14b8a6', '#e11d48', '#7c3aed', '#ca8a04', '#059669', '#2563eb', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5'];
  const ORIG_NAME = Object.fromEntries(ORIG.map(o => [o.k, o.n]));
  const DEFAULT_ORIGIN = ORIG.length ? ORIG[0].k : 'monsey';
  const key = p => p.s + '|' + p.n + '|' + p.a.slice(0, 24);
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = m => m == null ? '' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' hr' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[֑-ׇ]/g, '');
  const host = u => u ? u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : '';
  const isFree = p => /^\s*free/i.test(p.pr);
  const isChm = p => SEASON.id === 'sukkos' && /chol ham|hoshana/i.test(p.h + ' ' + p.pr);
  P.forEach((p, i) => {
    p.i = i; p.key = key(p);
    p.ag = AGE_TAGS.includes(p.g) ? p.g : (p.g ? 'Other ages' : '');
    p.rv = p.rv || [];
    p.gal = p.gal || [];
    buildHay(p);
  });
  function buildHay(p) { p.hay = norm([p.n, p.s, p.a, p.h, p.pr, p.d, p.de || '', p.mall, p.g, p.w, p.rv.filter(Boolean).map(r => r.t).join(' '), p.snow ? 'ice skating ski snow winter' : ''].join(' ')); }
  // ----- season facts about each place, from the data only -----
  const SNOW = new Set(SEASON.snowIds || []);
  const CLOSED_RX = /closed\s*for\s*the\s*season|closed\s*fortheseason|closed for off-season|for the fall season|only open .{0,30}fall|\bmay\s*[-–]\s*sept|open june\s*[-–]\s*october/i;
  P.forEach(p => {
    if (SNOW.has(p.i)) p.snow = true;
    p.iwater = p.io === 'in' && (p.s === 'Water Fun' || /water ?park/i.test(p.n));
    p.closedSeason = !p.snow && CLOSED_RX.test(p.h);
    if (p.snow) buildHay(p);
  });
  const wClosed = p => WINTER && (p.closedSeason || (CHECKS[p.i] && !p.snow && CLOSED_RX.test(CHECKS[p.i].siteHours || '')));
  const wOutdoor = p => WINTER && p.io !== 'in' && !p.snow;
  let detailsReady = null, detailsLoaded = false;
  function loadDetails() {
    if (!detailsReady) detailsReady = getJSON('data/details.json').then(j => {
      (j.details || []).forEach((x, k) => { const p = P[k]; if (!p || p.src === 'new') return; p.d = x.d || ''; p.rv = x.rv || []; buildHay(p); });
      detailsLoaded = true;
      if (state.q.length && curView === 'search') render();
    }).catch(() => { detailsReady = null; });
    return detailsReady;
  }
  const DEST_REV = DATA.destReviews || {};
  let CHECKS = DATA.checks || {};

  const STORE = 'chm-outings-saved-v1';
  let saved = new Set();
  try { saved = new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch (e) {}
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify([...saved])); } catch (e) {} };

  const state = { area: 'local', sections: new Set(), ages: new Set(), states: new Set(), origin: DEFAULT_ORIGIN, max: Infinity, free: false, chm: false, web: false, indoor: false, rev: false, budget: 'any', q: [], sort: 'near', snow: false, iwater: false, noout: false, showclosed: false, open: false, openunk: false, day: '' };
  const PREFS = 'chm-outings-filters-v1';
  try {
    const s = JSON.parse(localStorage.getItem(PREFS) || 'null');
    if (s) {
      ['area', 'origin', 'free', 'chm', 'web', 'indoor', 'rev', 'budget', 'sort', 'noout', 'showclosed', 'open', 'openunk'].forEach(k => { if (s[k] !== undefined) state[k] = s[k]; });
      if (typeof s.max === 'number') state.max = s.max;
      if (state.origin === 'm1') state.origin = 'monsey';
      if (state.origin === 'm2') state.origin = 'monroe';
      if (!ORIG_NAME[state.origin]) state.origin = DEFAULT_ORIGIN;
      ['sections', 'ages', 'states'].forEach(k => { if (Array.isArray(s[k])) s[k].forEach(v => state[k].add(v)); });
    }
  } catch (e) {}
  function savePrefs() {
    try { localStorage.setItem(PREFS, JSON.stringify({ area: state.area, origin: state.origin, free: state.free, chm: state.chm, web: state.web, indoor: state.indoor, rev: state.rev, budget: state.budget, sort: state.sort, noout: state.noout, showclosed: state.showclosed, open: state.open, openunk: state.openunk, max: state.max === Infinity ? null : state.max, sections: [...state.sections], ages: [...state.ages], states: [...state.states] })); } catch (e) {}
  }

  const tm = (p, k) => (p.t && p.t[k || state.origin] != null) ? p.t[k || state.origin] : null;
  // ----- opening hours: winterHours (read from each place's own website, with the page and the date checked) -----
  const pad2 = n => ('0' + n).slice(-2);
  const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const TODAY = isoOf(new Date());
  const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dateOf = iso => new Date(iso + 'T12:00:00');
  const dayISO = () => state.day && state.day >= TODAY ? state.day : TODAY;
  const hm12 = s => { const [h, m] = s.split(':').map(Number); const hh = h % 24; const ap = hh < 12 ? 'AM' : 'PM'; const h12 = hh % 12 || 12; return h12 + (m ? ':' + pad2(m) : '') + ' ' + ap; };
  const rangeTxt = v => v.split(',').map(r => { const [a, b] = r.split('-'); return b ? hm12(a) + '–' + hm12(b) : hm12(a); }).join(', ');
  function hoursOn(p, iso) {
    const wh = p.winterHours;
    if (!wh || wh.status === 'unconfirmed') return { s: 'unknown' };
    if (wh.status === 'closed_season') return { s: 'closed', season: true };
    let v = wh.dates && wh.dates[iso];
    const special = v != null;
    if (v == null && wh.week) v = wh.week[DOW[dateOf(iso).getDay()]];
    if (v == null || v === '') return { s: 'unknown', partial: true };
    if (/^closed$/i.test(v)) return { s: 'closed', special };
    if (!/^\d{1,2}:\d{2}-\d{1,2}:\d{2}/.test(v)) return { s: 'unknown', partial: true };
    return { s: 'open', text: rangeTxt(v), special };
  }
  const dayWord = iso => iso === TODAY ? T('today') : T('on {day}', { day: dayName(iso) });
  function dayName(iso) {
    const d = dateOf(iso), t = new Date(dateOf(TODAY).getTime() + 864e5);
    if (iso === TODAY) return T('Today');
    if (iso === isoOf(t)) return T('Tomorrow');
    return T(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]) + ', ' + T(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]) + ' ' + d.getDate();
  }
  // the days you can pick: the next week, plus the winter break days
  function dayChoices() {
    const out = [], base = dateOf(TODAY);
    for (let k = 0; k < 8; k++) out.push(isoOf(new Date(base.getTime() + k * 864e5)));
    if (WINTER) for (let d = dateOf('2026-12-24'); isoOf(d) <= '2027-01-01'; d = new Date(d.getTime() + 864e5)) { const s = isoOf(d); if (s > out[out.length - 1]) out.push(s); }
    return out;
  }
  function hoursLine(p, iso, short) {
    const h = hoursOn(p, iso || dayISO());
    const when = dayWord(iso || dayISO());
    if (h.s === 'open') return `<span class="hrs open">${esc(T('Open {when}', { when }))} · <bdi dir="ltr">${esc(h.text)}</bdi></span>`;
    if (h.s === 'closed') return `<span class="hrs closed">${esc(h.season ? T('Closed for the winter season') : T('Closed {when}', { when }))}</span>`;
    return short ? `<span class="hrs unk">${esc(T('Hours not confirmed, call first'))}</span>` : `<span class="hrs unk">${esc(T('Hours not confirmed, call first'))}</span>`;
  }
  function inArea(p) { return state.area === 'saved' ? saved.has(p.key) : p.k === state.area; }
  function passes(p, skip) {
    if (!inArea(p)) return false;
    if (skip !== 'sections' && state.sections.size && !state.sections.has(p.s)) return false;
    if (skip !== 'ages' && state.ages.size && !state.ages.has(p.ag)) return false;
    if (skip !== 'states' && state.states.size && !state.states.has(p.st || 'Other')) return false;
    if (state.max < Infinity) { const m = tm(p); if (m == null || m > state.max) return false; }
    if (state.free && !isFree(p)) return false;
    if (state.chm && !isChm(p)) return false;
    if (state.web && !p.w) return false;
    if (state.indoor && p.io !== 'in') return false;
    if (state.rev && !p.rv.length) return false;
    if (state.snow && !p.snow) return false;
    if (state.iwater && !p.iwater) return false;
    if (WINTER && state.noout && wOutdoor(p)) return false;
    if (WINTER && !state.showclosed && wClosed(p) && state.area !== 'saved') return false;
    if (state.open) { const h = hoursOn(p, dayISO()).s; if (h === 'closed' || (h === 'unknown' && !state.openunk)) return false; }
    if (state.budget !== 'any') {
      const b = Number(state.budget);
      if (b === 0) { if (!(isFree(p) || p.fp === 0)) return false; }
      else if (p.fp == null || p.fp > b) return false;
    }
    for (const w of state.q) if (!p.hay.includes(w)) return false;
    return true;
  }
  function sectionList() {
    const secs = [...new Set(P.filter(inArea).map(p => p.s))];
    const order = [...LOCAL_ORDER, ...TRIP_ORDER];
    return secs.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  const chipsHTML = (values, set, counts) => values.map(v => `<button class="chip" aria-pressed="${set.has(v)}" data-v="${esc(v)}">${esc(v)} <span class="c">${counts[v] || 0}</span></button>`).join('');
  function countBy(field, skip) { const c = {}; P.forEach(p => { if (passes(p, skip)) { const v = field(p); if (v) c[v] = (c[v] || 0) + 1; } }); return c; }

  function renderFilters() {
    ['local', 'trip', 'saved'].forEach(a => $('area-' + a).setAttribute('aria-pressed', state.area === a));
    $('cnt-local').textContent = P.filter(p => p.k === 'local').length;
    $('cnt-trip').textContent = P.filter(p => p.k === 'trip').length;
    $('cnt-saved').textContent = saved.size; $('nav-saved').textContent = saved.size || '';
    $('sec-title').textContent = state.area === 'trip' ? 'Destination' : 'Category';
    $('sections').innerHTML = chipsHTML(sectionList(), state.sections, countBy(p => p.s, 'sections'));
    $('ages').innerHTML = chipsHTML(AGE_TAGS, state.ages, countBy(p => p.ag, 'ages'));
    const stc = countBy(p => p.st || 'Other', 'states');
    const sts = Object.keys(stc).sort((a, b) => stc[b] - stc[a]);
    state.states.forEach(s => { if (!sts.includes(s)) sts.push(s); });
    $('states').innerHTML = chipsHTML(sts, state.states, stc);
    if (!$('origin').options.length) $('origin').innerHTML = ORIG.map(o => `<option value="${esc(o.k)}">${esc(o.n)}</option>`).join('');
    $('origin').value = state.origin;
    $('maxout').textContent = state.max === Infinity ? 'any distance' : fmt(state.max) + ' from ' + (ORIG_NAME[state.origin] || '');
    const n = state.sections.size + state.ages.size + state.states.size + (state.max < Infinity) + state.free + state.chm + state.web + state.indoor + state.rev + (state.budget !== 'any') + state.snow + state.iwater + (WINTER && state.noout) + state.open;
    $('fcount').textContent = n; $('fcount').hidden = !n;
    $('maxmin').value = state.max === Infinity ? 135 : state.max;
    $('free').checked = state.free; $('chm').checked = state.chm; $('hasweb').checked = state.web;
    $('indoor').checked = state.indoor; $('hasrev').checked = state.rev;
    if ($('snow')) { $('snow').checked = state.snow; $('iwater').checked = state.iwater; $('noout').checked = state.noout; $('showclosed').checked = state.showclosed; } $('budget').value = String(state.budget); $('sort').value = state.sort;
    if ($('openday')) {
      $('openday').checked = state.open; $('openunk').checked = state.openunk;
      const opts = dayChoices().map(d => `<option value="${d === TODAY ? '' : d}">${esc(dayName(d))}</option>`).join('');
      if ($('day').dataset.built !== opts) { $('day').innerHTML = opts; $('day').dataset.built = opts; }
      $('day').value = state.day && state.day >= TODAY ? state.day : '';
    }
    const little = state.ages.size === 2 && state.ages.has('Toddler+') && state.ages.has('Entire Family');
    const qs = { rain: state.indoor, little, free: state.free, close: state.max === 30, rev: state.rev, snow: state.snow, open: state.open && !state.day };
    document.querySelectorAll('#quick .chip').forEach(b => b.setAttribute('aria-pressed', !!qs[b.dataset.q]));
    $('copylist').hidden = !(state.area === 'saved' && saved.size);
    savePrefs();
  }

  // photos: index 0 is the booklet photo, then website photos
  const NOPHOTO_ICON = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" opacity=".85"><path d="M6 50 24 26l10 13 8-9 16 20Z"/><circle cx="44" cy="17" r="6"/></svg>');
  function photoList(p) {
    if (p.src === 'new') return [{ kind: 'none', c: secColor(p.s), cap: 'No photo yet' }];
    if (p.src === 'mv') return [p.img ? { kind: 'mv', src: p.img, cap: 'Photo from The Monsey View' } : { kind: 'none', c: secColor(p.s), cap: '' }];
    const list = [{ kind: 'book', idx: p.ph, sheet: Math.floor(p.ph / 56), pos: p.ph % 56, cap: 'Photo from the Navigation guide' }];
    p.gal.forEach((g, k) => list.push({ kind: 'web', gid: (p.gg || [])[k], sheet: g[0], pos: g[1], cap: 'Photo from ' + host(p.w) }));
    return list;
  }
  const HD = !!(window.SITE_CONFIG && window.SITE_CONFIG.hd);
  function bgStyle(ph) {
    if (ph.kind === 'mv') return `background-image:url(${ph.src});background-size:cover;background-position:center`;
    if (ph.kind === 'none') return `background-image:url('data:image/svg+xml,${NOPHOTO_ICON}'),linear-gradient(135deg,${ph.c},${ph.c}a6);background-size:56px 56px,cover;background-position:center;background-repeat:no-repeat`;
    if (HD) {
      const u = ph.kind === 'book' ? `img/book/${ph.idx}.webp` : (ph.gid != null ? `img/gal/${ph.gid}.webp` : null);
      if (u) return `background-image:url(${u});background-size:cover;background-position:center`;
    }
    if (ph.kind === 'book') {
      const x = (ph.pos % 8) * 100 / 7, y = Math.floor(ph.pos / 8) * 100 / 6;
      return `background-image:url(photos/photos-${ph.sheet}.webp);background-size:800% 700%;background-position:${x.toFixed(4)}% ${y.toFixed(4)}%`;
    }
    const x = (ph.pos % G.cols) * 100 / (G.cols - 1), y = Math.floor(ph.pos / G.cols) * 100 / (G.rows - 1);
    return `background-image:url(gallery/g-${ph.sheet}.webp);background-size:${G.cols * 100}% ${G.rows * 100}%;background-position:${x.toFixed(4)}% ${y.toFixed(4)}%`;
  }
  // photos load only when they come near the screen
  const lazyAttr = ph => ph.kind === 'none' ? `style="${bgStyle(ph)}"` : `data-bg="${esc(bgStyle(ph))}"`;
  const lazyShow = el => { el.setAttribute('style', (el.getAttribute('style') ? el.getAttribute('style') + ';' : '') + el.getAttribute('data-bg')); el.removeAttribute('data-bg'); };
  const lazyIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { lazyIO.unobserve(e.target); lazyShow(e.target); } }), { rootMargin: '500px 700px' }) : null;
  const lazyWatch = el => { if (lazyIO) lazyIO.observe(el); else lazyShow(el); };
  new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.hasAttribute('data-bg')) lazyWatch(n); n.querySelectorAll('[data-bg]').forEach(lazyWatch); }); }).observe(document.body, { childList: true, subtree: true });
  const mapsQ = p => encodeURIComponent(p.n + (p.a ? ', ' + p.a : ''));
  const mapsUrl = p => 'https://www.google.com/maps/search/?api=1&query=' + mapsQ(p);
  const dirUrl = p => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent((p.locs && p.locs[0]) || p.a || (p.n + ' ' + p.s));
  const searchUrl = p => {
    const town = (p.a.match(/([A-Za-z .'-]+),?\s+(NY|NJ|CT|PA|MA|RI|DC|MD|DE|CA|AZ|FL|SC|VT)\b/) || [])[0] || (p.k === 'trip' ? p.s : '');
    return 'https://www.google.com/search?q=' + encodeURIComponent(p.n + ' ' + town);
  };
  const navTarget = p => p.ll ? p.ll[0] + ',' + p.ll[1] : ((p.locs && p.locs[0]) || p.a || p.n);
  const wazeUrl = p => p.ll ? `https://waze.com/ul?ll=${p.ll[0]},${p.ll[1]}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(navTarget(p))}&navigate=yes`;
  const appleUrl = p => `https://maps.apple.com/?daddr=${encodeURIComponent(navTarget(p))}`;
  const tel = ph => ph.replace(/[^\d+]/g, '').replace(/^1?(\d{10}).*$/, '$1');
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  function checkLine(p) {
    const c = CHECKS[p.i]; if (!c || !c.checkedAt) return '';
    const d = fmtDate(c.checkedAt);
    if (c.hours === 'different' || c.price === 'different') return `<div class="check diff"><b>Website shows different ${c.hours === 'different' && c.price === 'different' ? 'hours and prices' : c.hours === 'different' ? 'hours' : 'prices'}</b> · checked ${esc(d)}. Open details to compare.</div>`;
    if (c.hours === 'same' || c.price === 'same') return `<div class="check"><b>Matches their website</b> · checked ${esc(d)}</div>`;
    return '';
  }
  const STAR = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  function drives(p) {
    const m = tm(p);
    return m == null ? '' : `<span class="badge drive"><b>${esc(fmt(m))}</b> from ${esc(ORIG_NAME[state.origin] || '')}</span>`;
  }
  const phonesHTML = p => p.p.length ? `<div class="phones">${p.p.map(ph => `<span class="phone"><a href="tel:${esc(tel(ph))}">${esc(ph)}</a><button class="copy" type="button" data-copy="${esc(ph)}" aria-label="Copy ${esc(ph)}">Copy</button></span>`).join('')}</div>` : '';
  const addrHTML = p => p.locs ? `<ul class="locs">${p.locs.map(l => `<li><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.n + ', ' + l)}" target="_blank" rel="noopener">${esc(l)}</a></li>`).join('')}</ul>`
    : p.a ? `<p class="addr"><a href="${mapsUrl(p)}" target="_blank" rel="noopener">${esc(p.a)}</a>${p.mall ? ` <span class="mall">· inside ${esc(p.mall)}</span>` : ''}</p>` : '';

  const priceBadge = p => p.fp == null ? '' : `<span class="badge price">${p.fp === 0 ? 'Free' : 'from $' + (Number.isInteger(p.fp) ? p.fp : p.fp.toFixed(2))}</span>`;
  const revSnip = p => {
    if (!p.rv.length) return '';
    const r = p.rv[0];
    return `<div class="revsnip"><p class="${r.l === 'yi' ? 'yi' : ''}" dir="auto">“${esc(r.t)}”</p><button type="button" data-open="${p.i}" data-rev="1">${p.rv.length === 1 ? 'Read the family review' : `Read ${p.rv.length} family reviews`} ›</button></div>`;
  };
  function secColor(s) { if (SEC_COLOR[s]) return SEC_COLOR[s]; const k = [...new Set(P.filter(p => p.k === 'trip').map(p => p.s))].indexOf(s); return TRIP_COLORS[Math.max(0, k) % TRIP_COLORS.length]; }
  function cardPh(p) { return photoList(p)[p.gal.length ? 1 : 0]; }
  function card(p) {
    const isSaved = saved.has(p.key);
    const n = p.gal.length + 1;
    const m = tm(p);
    const bits = [];
    if (m != null) bits.push(`<b>${esc(fmt(m))}</b> from ${esc(ORIG_NAME[state.origin] || '')}`);
    if (p.fp != null) bits.push(p.fp === 0 ? 'Free' : 'from $' + esc(Number.isInteger(p.fp) ? p.fp : p.fp.toFixed(2)));
    if (p.g) bits.push(esc(p.g));
    const extra = [];
    if (p.rv.length) extra.push(`${p.rv.length} family ${p.rv.length === 1 ? 'review' : 'reviews'}`);
    if (isChm(p)) extra.push('Chol Hamoed hours');
    const c = CHECKS[p.i];
    if (c && (c.hours === 'different' || c.price === 'different')) extra.push('Website shows changes');
    return `<article class="card">
      <div class="ph-wrap">
        <button class="photo" type="button" data-open="${p.i}" aria-label="See photos and details: ${esc(p.n)}" ${lazyAttr(cardPh(p))}>${n > 1 ? `<span class="more">${n} photos</span>` : ''}</button>
        <button class="save" type="button" data-key="${esc(p.key)}" aria-pressed="${isSaved}" aria-label="${isSaved ? 'Remove from My Trips' : 'Save to My Trips'}: ${esc(p.n)}" title="${isSaved ? 'Remove from My Trips' : 'Save to My Trips'}">${STAR}</button>
      </div>
      <button class="card-body" type="button" data-open="${p.i}">
        <span class="ctag" style="--c:${secColor(p.s)}">${esc(T(p.s))}${p.io === 'in' ? ' · ' + esc(T('Indoors')) : ''}${WINTER && p.snow ? ` · <b class="snowtag">❄ ${esc(T('Snow & ice'))}</b>` : ''}</span>
        <span class="ctitle">${esc(p.n)}</span>
        ${bits.length ? `<span class="cmeta">${bits.join(' · ')}</span>` : ''}
        ${extra.length ? `<span class="cextra">${esc(extra.join(' · '))}</span>` : ''}
        ${winterTag(p)}
        ${state.open || p.winterHours ? hoursLine(p, null, true) : ''}
      </button>
    </article>`;
  }

  function winterTag(p) {
    if (p.src === 'new') return '<span class="wtag new">New for winter, not from the guide · verify before visiting</span>';
    if (!WINTER) return '';
    if (wClosed(p)) return '<span class="wtag closed">The guide says closed for the season</span>';
    if (wOutdoor(p)) return '<span class="wtag out">Outdoors · may be closed in winter</span>';
    return '';
  }
  function seasonNotes(where) {
    const s = SEASON, out = [];
    (s.dates || []).filter(d => d.until >= (window.SEASON_TODAY || '')).forEach(d => out.push(`<p>${esc(d.text)}</p>`));
    if (s.holidayNote) out.push(`<p><b>Holiday hours.</b> ${esc(s.holidayNote)}</p>`);
    if (s.hoursNote && (where !== 'home' || !s.holidayNote)) out.push(`<p>${esc(s.hoursNote)}</p>`);
    return out.length ? `<div class="snote snote-${esc(s.id)}">${out.join('')}</div>` : '';
  }
  function renderInfo() {
    const secs = state.area === 'trip' ? [...state.sections] : [];
    const blocks = secs.filter(s => (TRIPS[s] && TRIPS[s].length) || DEST_REV[s]).map(s => `<div class="info">${TRIPS[s] && TRIPS[s].length ? `<h3>Shuls, mikvahs and kosher food · ${esc(s)}</h3><ul>${TRIPS[s].map(r => `<li><span class="t">${esc(r.type)}</span><span><strong>${esc(r.name)}</strong>${r.address ? ' · ' + esc(r.address) : ''}${r.phone ? ' · ' + esc(r.phone) : ''}${r.note ? ' <span class="note">(' + esc(r.note) + ')</span>' : ''}</span></li>`).join('')}</ul>` : ''}
      ${DEST_REV[s] ? `<div class="reviews"><h4>What families said about ${esc(s)}</h4>${DEST_REV[s].map(r => `<p class="rev${r.l === 'yi' ? ' yi' : ''}" dir="auto">${esc(r.t)}</p>`).join('')}</div>` : ''}</div>`);
    if (!SEASON.base) blocks.unshift(seasonNotes('search'));
    if (WINTER && !state.showclosed && state.area !== 'saved') {
      const hid = P.filter(p => inArea(p) && wClosed(p)).length;
      if (hid) blocks.push(`<p class="wnote">${hid} ${hid === 1 ? 'place is' : 'places are'} hidden because the guide says ${hid === 1 ? 'it is' : 'they are'} closed for the season (summer parks, rides and farms). <button class="linkbtn" type="button" data-wshow="1">Show them anyway</button></p>`);
    }
    if (state.open) {
      const unk = P.filter(p => inArea(p) && hoursOn(p, dayISO()).s === 'unknown').length;
      blocks.push(`<p class="wnote">${esc(T('Showing places open {when}, by the hours on their own websites.', { when: dayWord(dayISO()) }))} ${!state.openunk && unk ? `${esc(T('{n} places whose hours we couldn\u2019t confirm are hidden.', { n: unk }))} <button class="linkbtn" type="button" data-openunk="1">${esc(T('Show them too'))}</button>` : ''}</p>`);
    }
    if (state.area === 'trip' && !secs.length) blocks.push('<p class="hint" style="margin:0 0 14px">Pick a destination to see the shuls, mikvahs and kosher food the guide lists there.</p>');
    $('info').innerHTML = blocks.join('');
  }
  function render() {
    renderFilters(); renderInfo();
    const list = P.filter(p => passes(p)), o = state.origin;
    if (state.sort === 'az') list.sort((a, b) => a.n.localeCompare(b.n));
    else if (state.sort === 'reviews') list.sort((a, b) => b.rv.length - a.rv.length || a.i - b.i);
    else if (state.sort === 'near') { const wr = p => WINTER && !(p.snow || p.io === 'in') ? 1 : 0; list.sort((a, b) => wr(a) - wr(b) || (tm(a) == null ? 1e6 : tm(a)) - (tm(b) == null ? 1e6 : tm(b)) || a.i - b.i); }
    else list.sort((a, b) => a.i - b.i);
    const total = P.filter(inArea).length;
    const where = state.area === 'local' ? 'near-home places' : state.area === 'trip' ? 'trip places' : 'saved places';
    $('summary').innerHTML = `Showing <strong>${list.length}</strong> of ${total} ${where}`;
    if (!list.length) {
      $('grid').innerHTML = state.area === 'saved' && !saved.size ? '<div class="empty">Your list is empty. Tap the star on any place to save it here.</div>' : '<div class="empty">No places match these filters. Try a longer drive time or clear a filter.</div>';
      return;
    }
    fillGrid($('grid'), list);
  }
  // long lists are added a few dozen cards at a time as you scroll
  const BATCH = 36;
  const moreIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) moreGrid(e.target.parentElement); }), { rootMargin: '900px 0px' }) : null;
  function fillGrid(el, list) { el._list = list; el._n = 0; el.innerHTML = ''; moreGrid(el); }
  function moreGrid(el) {
    if (!el || !el._list) return;
    const old = el.querySelector('.moregrid'); if (old) { if (moreIO) moreIO.unobserve(old); old.remove(); }
    const next = el._list.slice(el._n, el._n + BATCH); el._n += next.length;
    el.insertAdjacentHTML('beforeend', next.map(card).join(''));
    const left = el._list.length - el._n;
    if (left > 0) { el.insertAdjacentHTML('beforeend', `<button class="btn ghost moregrid" type="button">Show ${left} more ${left === 1 ? 'place' : 'places'}</button>`); if (moreIO) moreIO.observe(el.querySelector('.moregrid')); }
  }

  // ----- overlays -----
  let openSheet = null, lastFocus = null;
  let underSheet = null;
  function show(sheet) {
    if (openSheet && openSheet !== sheet) { underSheet = openSheet; openSheet.dataset.open = 'false'; }
    else if (!openSheet) { lastFocus = document.activeElement; underSheet = null; }
    openSheet = sheet; sheet.dataset.open = 'true'; $('scrim').dataset.open = 'true';
    document.body.style.overflow = 'hidden';
    const f = sheet.querySelector('.x'); if (f) f.focus();
  }
  function hide() {
    if (!openSheet) return;
    openSheet.dataset.open = 'false';
    if (underSheet) { openSheet = underSheet; underSheet = null; openSheet.dataset.open = 'true'; return; }
    $('scrim').dataset.open = 'false'; openSheet = null;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $('scrim').addEventListener('click', hide);
  $('d-close').addEventListener('click', hide);
  $('ask-close').addEventListener('click', hide);
  $('fb-close').addEventListener('click', hide);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hide();
    if (openSheet === $('detail') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !/input|textarea/i.test(document.activeElement.tagName)) step(e.key === 'ArrowRight' ? 1 : -1);
  });

  let cur = null, curPhotos = [], curIdx = 0;
  function showPhoto(i) {
    curIdx = (i + curPhotos.length) % curPhotos.length;
    const ph = curPhotos[curIdx];
    $('g-main').setAttribute('style', bgStyle(ph));
    $('g-cap').textContent = ph.cap + (curPhotos.length > 1 ? ` · ${curIdx + 1} of ${curPhotos.length}` : '');
    document.querySelectorAll('#d-body .thumb').forEach((t, k) => t.setAttribute('aria-current', k === curIdx));
  }
  function step(d) { if (curPhotos.length > 1) showPhoto(curIdx + d); }
  function siteBox(p) {
    const c = CHECKS[p.i];
    if (!p.w || p.src === 'new') return '';
    if (!c || !c.checkedAt) return `<div class="sitebox"><h4>Checked on their website</h4><span class="muted">Not checked yet. Hours and prices above are from the printed guide.</span></div>`;
    const lab = v => v === 'same' ? 'same as the guide' : v === 'different' ? 'different from the guide' : 'the automatic check did not find them. Please look on their website';
    return `<div class="sitebox"><h4>Checked on their website · ${esc(fmtDate(c.checkedAt))}</h4>
      <div><b>Hours:</b> ${esc(lab(c.hours))}${c.siteHours ? ` — <span>${esc(c.siteHours)}</span>` : ''}</div>
      <div><b>Prices:</b> ${esc(lab(c.price))}${c.sitePrice ? ` — <span>${esc(c.sitePrice)}</span>` : ''}</div>
      ${c.note ? `<div class="muted">${esc(c.note)}</div>` : ''}</div>`;
  }
  function etaList(p) {
    if (!p.t) return '';
    const rows = ORIG.filter(o => p.t[o.k] != null).map(o => `<li>${esc(o.n)}: <b>${esc(fmt(p.t[o.k]))}</b></li>`);
    return rows.length ? `<details class="etas"><summary>Drive times from every community</summary><ul>${rows.join('')}</ul></details>` : '';
  }
  function reviewsHTML(p) {
    if (p.rv.some(r => !r)) return `<div class="reviews" id="d-reviews"><h4>Family reviews</h4><p class="src">Loading the family reviews…</p></div>`;
    if (p.src === 'new') return '';
    if (!p.rv.length) return `<div class="reviews" id="d-reviews"><h4>Family reviews</h4><p class="src">${p.src === 'mv' ? 'No family reviews for this place yet.' : 'The guide has no family reviews for this place yet.'} Google's reviews open on Google Maps.</p></div>`;
    return `<div class="reviews" id="d-reviews"><h4>What families said · ${p.rv.length} ${p.rv.length === 1 ? 'review' : 'reviews'}</h4>
      <p class="src">From the reviews pages of the Navigation guide. Google's reviews open on Google Maps.</p>
      ${p.rv.map(r => `<p class="rev${r.l === 'yi' ? ' yi' : ''}" dir="auto">${r.about ? `<span class="about" dir="ltr">About: ${esc(r.about)}</span>` : ''}${esc(r.t)}</p>`).join('')}</div>`;
  }
  function placeSeasonBox(p) {
    const rows = [];
    if (p.src === 'new') rows.push(`<p><b>Added for winter, not from the guide.</b> The name, address and website were checked on the official site on Oct 27, 2026${p.src2 ? ` (<a href="${esc(p.src2)}" target="_blank" rel="noopener">source</a>)` : ''}. Hours and prices aren't listed here, so check their website before visiting.</p>`);
    if (WINTER && wClosed(p)) rows.push('<p><b>The guide says this place was closed for the season</b> at Sukkos time, so it is probably closed in winter too. Check before you go.</p>');
    else if (WINTER && wOutdoor(p)) rows.push('<p><b>Outdoors.</b> It may be closed or have short hours in winter. Check before you go.</p>');
    if (WINTER && p.snow && p.src !== 'new') rows.push('<p><b>Snow &amp; ice.</b> Skating or snow activities, as the guide describes them. Winter hours usually differ from the Sukkos hours above.</p>');
    if (SEASON.holidayNote) rows.push(`<p>${esc(SEASON.holidayNote)}</p>`);
    else if (SEASON.hoursNote && !SEASON.base) rows.push(`<p>${esc(SEASON.hoursNote)}</p>`);
    return rows.length ? `<div class="sbox">${rows.join('')}</div>` : '';
  }
  function hoursBox(p) {
    if (p.src === 'new') return '';
    const wh = p.winterHours;
    const head = `<h4>${esc(T('Winter hours'))}</h4>`;
    if (!wh || wh.status === 'unconfirmed') return `<div class="hbox unk">${head}<p><b>${esc(T('Hours not confirmed, call first.'))}</b> ${esc(T('We couldn\u2019t find winter or holiday hours on their official website.'))}</p></div>`;
    const day = dayISO(), rows = [];
    rows.push(`<p class="hnow">${hoursLine(p, day)}</p>`);
    if (wh.text) rows.push(`<p dir="auto">${esc(wh.text)}</p>`);
    const ds = Object.keys(wh.dates || {}).sort();
    if (ds.length) rows.push(`<ul class="hdates">${ds.map(d => `<li><b>${esc(dayName(d))}:</b> <bdi dir="ltr">${esc(/^closed$/i.test(wh.dates[d]) ? T('Closed') : rangeTxt(wh.dates[d]))}</bdi></li>`).join('')}</ul>`);
    if (wh.week && Object.keys(wh.week).length) rows.push(`<details class="hweek"><summary>${esc(T('Every day of the week'))}</summary><ul>${DOW.filter(d => wh.week[d]).map(d => `<li><span>${esc(T({ sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' }[d]))}</span> <bdi dir="ltr">${esc(/^closed$/i.test(wh.week[d]) ? T('Closed') : /^\d/.test(wh.week[d]) ? rangeTxt(wh.week[d]) : wh.week[d])}</bdi></li>`).join('')}</ul></details>`);
    if (wh.status === 'regular') rows.push(`<p class="muted">${esc(T('Their website doesn\u2019t list special hours for Dec 25 or Jan 1 yet, so call before a holiday.'))}</p>`);
    rows.push(`<p class="hsrc">${esc(T('From their official website'))}${wh.source ? ` · <a href="${esc(wh.source)}" target="_blank" rel="noopener">${esc(host(wh.source).split('/')[0])}</a>` : ''} · ${esc(T('checked {date}', { date: fmtDate(wh.checked + 'T12:00:00') }))}</p>`);
    return `<div class="hbox ${wh.status === 'closed_season' ? 'closed' : ''}">${head}${rows.join('')}</div>`;
  }
  function openPlace(i, toReviews) {
    const p = P[i]; if (!p) return;
    cur = p; curPhotos = photoList(p);
    if (p.src !== 'new' && !detailsLoaded) loadDetails().then(() => { if (cur === p && openSheet === $('detail')) { const keep = curIdx; openPlace(i, toReviews); showPhoto(keep); } });
    $('d-title').textContent = p.n;
    const isSaved = saved.has(p.key);
    $('d-body').innerHTML = `
      <div>
        <div class="gal-main" id="g-main" role="img" aria-label="Photo of ${esc(p.n)}">
          ${curPhotos.length > 1 ? '<button class="gal-nav prev" type="button" aria-label="Previous photo">‹</button><button class="gal-nav next" type="button" aria-label="Next photo">›</button>' : ''}
        </div>
        <p class="gal-cap" id="g-cap"></p>
        ${curPhotos.length > 1 ? `<div class="thumbs">${curPhotos.map((ph, k) => `<button class="thumb" type="button" data-k="${k}" aria-label="Photo ${k + 1}" style="${bgStyle(ph)}"></button>`).join('')}</div>` : ''}
        <p class="hint"><a href="${mapsUrl(p)}" target="_blank" rel="noopener">Google reviews and more photos on Google Maps</a></p>
      </div>
      <div class="dinfo">
        <div class="card-top"><div class="sec${p.k === 'trip' ? ' trip' : ''}">${esc(p.s)}</div>
          <button class="save" type="button" data-key="${esc(p.key)}" aria-pressed="${isSaved}" aria-label="${isSaved ? 'Remove from my list' : 'Save to my list'}">${STAR}</button></div>
        <div class="badges">${p.g ? `<span class="badge age">${esc(p.g)}</span>` : ''}${drives(p)}${isChm(p) ? '<span class="badge ch">Chol Hamoed hours</span>' : ''}</div>
        ${(p.h || p.pr) ? `<dl>${p.h ? `<div><dt>${SEASON.base ? 'Hours' : 'Hours <small>(Sukkos guide)</small>'}</dt><dd dir="auto">${esc(p.h)}</dd></div>` : ''}${p.pr ? `<div><dt>Price</dt><dd dir="auto">${esc(p.pr)}</dd></div>` : ''}</dl>` : ''}
        ${hoursBox(p)}
        ${placeSeasonBox(p)}
        ${etaList(p)}
        <div id="d-daven"></div>
        <div id="d-weather"></div>
        ${siteBox(p)}
        ${addrHTML(p)}
        ${phonesHTML(p)}
        ${p.w ? `<p class="webline"><a href="${esc(p.w)}" target="_blank" rel="noopener">${esc(host(p.w))}</a></p>` : ''}
        ${p.d ? `<p class="desc" dir="rtl" lang="yi">${esc(p.d)}</p>` : ''}
        ${p.de ? `<p class="desc-en">${esc(p.de)}</p>` : ''}
        ${p.src === 'mv' ? `<p class="srcline">From The Monsey View's Excursions trip guide (issue 567, page ${p.pg}).</p>` : ''}
        ${reviewsHTML(p)}
        <div class="actions">
          ${p.w ? `<a class="btn" href="${esc(p.w)}" target="_blank" rel="noopener">Website</a>` : `<span class="noweb">No website found · <a href="${searchUrl(p)}" target="_blank" rel="noopener">search</a></span>`}
          <a class="btn ghost" href="${mapsUrl(p)}" target="_blank" rel="noopener">Google reviews</a>
        </div>
        <div class="navapps"><span>Directions:</span>
          <a class="btn ghost" href="${wazeUrl(p)}" target="_blank" rel="noopener">Waze</a>
          <a class="btn ghost" href="${dirUrl(p)}" target="_blank" rel="noopener">Google Maps</a>
          <a class="btn ghost" href="${appleUrl(p)}" target="_blank" rel="noopener">Apple Maps</a>
        </div>
        ${window.FEEDBACK_ON ? `<p class="fbplace"><button class="linkbtn" type="button" data-feedback="${p.i}">Something wrong with this place? Tell us</button></p>` : ''}
      </div>`;
    showPhoto(0);
    show($('detail'));
    if (toReviews) { const r = $('d-reviews'); if (r) r.scrollIntoView({ block: 'start' }); }
    if (window.onPlaceOpen) window.onPlaceOpen(p);
  }
  $('d-body').addEventListener('click', e => {
    if (e.target.closest('.gal-nav.prev')) return step(-1);
    if (e.target.closest('.gal-nav.next')) return step(1);
    const t = e.target.closest('.thumb'); if (t) return showPhoto(+t.dataset.k);
    handleCommon(e);
  });
  let touchX = null;
  $('d-body').addEventListener('touchstart', e => { if (e.target.closest('#g-main')) touchX = e.touches[0].clientX; }, { passive: true });
  $('d-body').addEventListener('touchend', e => { if (touchX != null) { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); touchX = null; } });

  function handleCommon(e) {
    const s = e.target.closest('.save');
    if (s) {
      const k = s.dataset.key; saved.has(k) ? saved.delete(k) : saved.add(k); persist();
      const on = saved.has(k);
      document.querySelectorAll('.save').forEach(b => { if (b.dataset.key === k) { b.setAttribute('aria-pressed', on); b.title = on ? 'Remove from my list' : 'Save to my list'; } });
      $('cnt-saved').textContent = saved.size; $('nav-saved').textContent = saved.size || '';
      if (state.area === 'saved' && !openSheet) render();
      if (curView === 'trips' && !openSheet) renderTrips();
      return true;
    }
    const c = e.target.closest('.copy');
    if (c) {
      const txt = c.dataset.copy;
      const done = () => { c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy'; }, 1400); };
      const fallback = () => { const r = document.createRange(); r.selectNodeContents(c.previousElementSibling); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); c.textContent = 'Selected'; setTimeout(() => { c.textContent = 'Copy'; }, 1400); };
      try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (err) { fallback(); }
      return true;
    }
    const o = e.target.closest('[data-open]');
    if (o) { openPlace(+o.dataset.open, !!o.dataset.rev); return true; }
    return false;
  }

  // ----- events -----
  document.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => { state.area = b.dataset.area; state.sections.clear(); state.states.clear(); render(); }));
  function chipToggle(id, set) { $(id).addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; const v = b.dataset.v; set.has(v) ? set.delete(v) : set.add(v); render(); }); }
  chipToggle('sections', state.sections); chipToggle('ages', state.ages); chipToggle('states', state.states);
  $('origin').addEventListener('change', e => { state.origin = e.target.value; render(); });
  $('maxmin').addEventListener('input', e => { const v = +e.target.value; state.max = v >= 135 ? Infinity : v; render(); });
  $('free').addEventListener('change', e => { state.free = e.target.checked; render(); });
  $('chm').addEventListener('change', e => { state.chm = e.target.checked; render(); });
  $('hasweb').addEventListener('change', e => { state.web = e.target.checked; render(); });
  $('indoor').addEventListener('change', e => { state.indoor = e.target.checked; render(); });
  $('hasrev').addEventListener('change', e => { state.rev = e.target.checked; render(); });
  if ($('snow')) {
    $('snow').addEventListener('change', e => { state.snow = e.target.checked; render(); });
    $('iwater').addEventListener('change', e => { state.iwater = e.target.checked; render(); });
    $('noout').addEventListener('change', e => { state.noout = e.target.checked; render(); });
    $('showclosed').addEventListener('change', e => { state.showclosed = e.target.checked; render(); });
  }
  $('info').addEventListener('click', e => { if (e.target.closest('[data-wshow]')) { state.showclosed = true; render(); } if (e.target.closest('[data-openunk]')) { state.openunk = true; render(); } });
  if ($('openday')) {
    $('openday').addEventListener('change', e => { state.open = e.target.checked; render(); });
    $('openunk').addEventListener('change', e => { state.openunk = e.target.checked; render(); });
    $('day').addEventListener('change', e => { state.day = e.target.value; if (!state.open) state.open = true; render(); document.dispatchEvent(new CustomEvent('of:day')); });
  }
  $('budget').addEventListener('change', e => { state.budget = e.target.value === 'any' ? 'any' : Number(e.target.value); render(); });
  $('quick').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    const q = b.dataset.q;
    if (q === 'rain') state.indoor = on;
    if (q === 'free') state.free = on;
    if (q === 'rev') state.rev = on;
    if (q === 'snow') state.snow = on;
    if (q === 'open') { state.open = on; state.day = ''; }
    if (q === 'close') state.max = on ? 30 : Infinity;
    if (q === 'little') { state.ages.clear(); if (on) { state.ages.add('Toddler+'); state.ages.add('Entire Family'); } }
    render();
  });
  function copyList(b) {
    const list = P.filter(p => saved.has(p.key));
    const txt = (SEASON.copyTitle || 'My Chol Hamoed list') + '\n\n' + list.map(p => [p.n, (p.locs ? p.locs[0] : p.a), p.p[0], p.w].filter(Boolean).join('\n')).join('\n\n');
    const done = () => { b.textContent = 'Copied. Paste it in a text or email'; setTimeout(() => { b.textContent = 'Copy my list'; }, 2500); };
    const fail = () => { b.textContent = 'Copy didn\'t work here'; setTimeout(() => { b.textContent = 'Copy my list'; }, 2500); };
    try { navigator.clipboard.writeText(txt).then(done, fail); } catch (err) { fail(); }
  }
  $('copylist').addEventListener('click', e => copyList(e.currentTarget));
  $('copylist2').addEventListener('click', e => copyList(e.currentTarget));
  const topnav = document.querySelector('.topnav');
  function navSolid() { topnav.classList.toggle('solid', curView !== 'home' || window.scrollY > 24); }
  window.addEventListener('scroll', () => { $('totop').hidden = window.scrollY < 900; navSolid(); }, { passive: true });
  $('totop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  $('sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
  let t;
  $('q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.q = norm(e.target.value.trim()).split(/\s+/).filter(Boolean); render(); }, 120); });
  $('clear').addEventListener('click', () => {
    state.sections.clear(); state.ages.clear(); state.states.clear(); state.max = Infinity; state.free = state.chm = state.web = state.indoor = state.rev = state.snow = state.iwater = state.noout = state.open = false; state.budget = 'any'; state.q = [];
    $('q').value = ''; render();
  });
  $('ftoggle').addEventListener('click', () => { const open = $('panel').dataset.open !== 'true'; $('panel').dataset.open = open; $('ftoggle').setAttribute('aria-expanded', open); });
  $('grid').addEventListener('click', e => { if (e.target.closest('.moregrid')) return moreGrid($('grid')); handleCommon(e); });

  // ----- views: home, explore, my trips -----
  const VIEWS = ['home', 'search', 'explore', 'trips', 'map', 'daven'];
  let curView = 'home';
  const heroPh = p => photoList(p)[p.gal.length ? 1 : 0];
  const miniMeta = p => [tm(p) != null ? fmt(tm(p)) + ' from ' + (ORIG_NAME[state.origin] || '') : '', p.fp === 0 ? 'Free' : (p.fp != null ? 'from $' + (Number.isInteger(p.fp) ? p.fp : p.fp.toFixed(2)) : ''), p.rv.length ? p.rv.length + (p.rv.length === 1 ? ' review' : ' reviews') : ''].filter(Boolean).join(' · ');
  const mini = p => `<button class="mini" type="button" data-open="${p.i}"><span class="mini-ph" ${lazyAttr(heroPh(p))}></span><span class="mini-b"><span class="sec" style="--c:${secColor(p.s)}">${esc(p.s)}</span><b>${esc(p.n)}</b><span class="mini-m">${esc(miniMeta(p))}</span></span></button>`;
  const uniqName = list => { const seen = new Set(); return list.filter(p => { const k = p.n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const COVER = { 'Parks & Farms': 'West Maple Farm', 'Airports': 'Skydive The Ranch', 'Water Fun': 'Lake Welch', 'Museums': 'Liberty Science Center', 'Outdoor Fun': 'Six Flags', 'Catskills': 'Morningside Park' };
  function coverFor(list) {
    const want = list.length && COVER[list[0].s] ? list.find(p => p.n === COVER[list[0].s]) : null;
    if (want) return bgStyle(heroPh(want));
    const best = list.filter(p => p.gal.length).sort((a, b) => b.rv.length - a.rv.length)[0] || list[0];
    return best ? bgStyle(heroPh(best)) : '';
  }
  function catCover(sec, kind, list) {
    const f = kind === 'local' && FUN.find(x => x[0] === sec);
    return f ? `background-image:url(img/cat/${f[1]}.webp);background-size:cover;background-position:center` : coverFor(list);
  }
  function catCard(sec, kind) {
    const list = P.filter(p => p.s === sec && p.k === kind);
    let sub = `${list.length} ${list.length === 1 ? 'place' : 'places'}`;
    if (kind === 'trip') { const m = median(list.map(p => tm(p)).filter(x => x != null)); if (m) sub += ` · about ${fmt(m)} drive`; }
    return `<button class="cat" type="button" style="--c:${secColor(sec)}" data-sec="${esc(sec)}" data-kind="${kind}"><span class="cat-ph" data-bg="${esc(catCover(sec, kind, list))}"></span><span class="cat-t"><b>${esc(sec)}</b><span>${esc(sub)}</span></span></button>`;
  }
  const originOptions = () => ORIG.map(o => `<option value="${esc(o.k)}">${esc(o.n)}</option>`).join('');
  const FUN = [['Indoor Fun', 'indoor-fun', 'Play, discover, unwind'], ['Outdoor Fun', 'outdoor-fun', 'A little fresh air'], ['Water Fun', 'water-fun', 'Make a splash'],
    ['Zoos & Aquariums', 'zoos-aquariums', 'Meet the wild ones'], ['Museums', 'museums', 'Feed their curiosity'], ['Parks & Farms', 'parks-farms', 'Room to roam']];
  const secCount = sec => P.filter(p => p.s === sec && p.k === 'local').length;
  const funCard = ([sec, slug, tag]) => `<button class="fun" type="button" data-sec="${esc(sec)}" data-kind="local" style="--c:${secColor(sec)}"><img src="img/cat/${slug}.webp" alt="" width="800" height="500" loading="lazy" decoding="async"><span class="fun-n">${secCount(sec)} places</span><span class="fun-t"><b>${esc(sec)}</b><small>${esc(tag)}</small></span><span class="fun-go" aria-hidden="true">→</span></button>`;
  const phUrl = ph => ph.kind === 'mv' ? ph.src : ph.kind === 'book' ? `img/book/${ph.idx}.webp` : (ph.gid != null ? `img/gal/${ph.gid}.webp` : '');
  const vcatList = v => P.filter(p => p.k === 'local' && p[v] && !wClosed(p));
  function seasonFunCard([key, img, title, tag]) {
    const v = key[0] === '@' ? key.slice(1) : null;
    const list = v ? vcatList(v) : P.filter(p => p.s === key && p.k === 'local');
    if (!img) { const best = list.filter(p => p.gal.length).sort((a, b) => b.rv.length - a.rv.length)[0] || list[0]; img = best ? phUrl(heroPh(best)) : ''; }
    return `<button class="fun" type="button" ${v ? `data-vcat="${v}"` : `data-sec="${esc(key)}"`} data-kind="local" style="--c:${v === 'snow' ? '#2b7bd8' : secColor(key)}">${img ? `<img src="${esc(img)}" alt="" width="800" height="500" loading="lazy" decoding="async">` : ''}<span class="fun-n">${list.length} places</span><span class="fun-t"><b>${esc(title)}</b><small>${esc(tag)}</small></span><span class="fun-go" aria-hidden="true">→</span></button>`;
  }
  function funMore() {
    const shown = SEASON.fun ? SEASON.fun.map(f => f[0]) : FUN.map(f => f[0]);
    const secs = LOCAL_ORDER.filter(s => !shown.includes(s) && secCount(s));
    return secs.map(s => `<button class="morepill" type="button" data-sec="${esc(s)}" data-kind="local"><i style="--c:${secColor(s)}"></i>${esc(s)} <span>${secCount(s)}</span></button>`).join('')
      + `<a class="morepill" href="#explore"><i style="--c:#0ea5e9"></i>Trips away <span>${P.filter(p => p.k === 'trip').length}</span></a>`
      + `<a class="morepill" href="#map" data-needs="map" ${window.renderMap ? '' : 'hidden'}><i style="--c:#14b8a6"></i>See them on a map</a>`;
  }
  function renderHome() {
    if (!$('herofrom').options.length) $('herofrom').innerHTML = ORIG.map(o => `<option value="${esc(o.k)}">From ${esc(o.n)}</option>`).join('');
    $('herofrom').value = state.origin;
    $('herolede').textContent = `${P.filter(p => p.src !== 'new').length} ${SEASON.lede || 'places from the Navigation guide, with photos, family reviews, hours, prices and drive times from your community.'}`;
    $('home-notes').innerHTML = SEASON.base ? '' : seasonNotes('home') + eventsHTML();
    $('fun-grid').innerHTML = SEASON.fun ? SEASON.fun.map(seasonFunCard).join('') : FUN.map(funCard).join('');
    $('fun-more').innerHTML = funMore();
    $('home-trips').innerHTML = TRIP_ORDER.slice(0, 8).map(s => catCard(s, 'trip')).join('');
    const near = (a, b) => (tm(a) == null ? 1e6 : tm(a)) - (tm(b) == null ? 1e6 : tm(b));
    if (WINTER) {
      $('rail1-t').textContent = 'Snow & ice'; $('rail1-s').textContent = `Skating rinks, ski slopes and snow tubing, closest to ${ORIG_NAME[state.origin] || 'you'} first.`; $('rail1-a').dataset.go = 'snow';
      $('rail-fav').innerHTML = uniqName(P.filter(p => p.k === 'local' && p.snow).sort(near)).slice(0, 14).map(mini).join('');
      $('rail2-t').textContent = 'Warm indoor favorites'; $('free-sub').textContent = 'Indoor places with the most family reviews in the guide.'; $('rail2-a').dataset.go = 'indoorfav';
      $('rail-free').innerHTML = uniqName(P.filter(p => p.k === 'local' && p.io === 'in' && p.rv.length && !wClosed(p)).sort((a, b) => b.rv.length - a.rv.length || near(a, b))).slice(0, 14).map(mini).join('');
    } else {
      $('rail-fav').innerHTML = uniqName(P.filter(p => p.k === 'local' && p.rv.length).sort((a, b) => b.rv.length - a.rv.length || a.i - b.i)).slice(0, 14).map(mini).join('');
      const free = uniqName(P.filter(p => p.k === 'local' && (p.fp === 0 || isFree(p)) && tm(p) != null && (p.src !== 'mv' || p.img)).sort((a, b) => tm(a) - tm(b))).slice(0, 14);
      $('rail-free').innerHTML = free.map(mini).join('');
      $('free-sub').textContent = `Free places, closest to ${ORIG_NAME[state.origin] || 'you'} first.`;
    }
    $('askpromo').hidden = $('askbtn').hidden;
    $('home-extras').innerHTML = extrasTiles();
  }
  function eventsHTML() {
    const ev = SEASON.events || [];
    if (!ev.length) return '';
    return `<section class="band"><div class="bandhead"><div><h2>Chanukah events</h2></div></div><div class="xgrid">${ev.map(x => `<div class="xcard" style="--c:#2b7bd8"><b>${esc(x.name)}</b>${x.date ? `<span class="xarea">${esc(x.date)}</span>` : ''}${x.place ? `<p>${esc(x.place)}${x.address ? ' · ' + esc(x.address) : ''}</p>` : ''}${x.note ? `<p>${esc(x.note)}</p>` : ''}${x.link ? `<a class="btn ghost" href="${esc(x.link)}" target="_blank" rel="noopener" style="align-self:flex-start">Details</a>` : ''}</div>`).join('')}</div></section>`;
  }
  // stay & services: in winter there is no sukkah or boat season
  const xLabel = g => SEASON.id !== 'sukkos' && g === 'Kosher food with a sukkah' ? 'Kosher food' : g;
  const xShow = g => !(WINTER && g.startsWith('Kosher boat'));
  const XCOLORS = { 'Guest rentals · Monsey': '#0ea5e9', 'Guest rentals · Monroe': '#14b8a6', 'Guest rentals · Catskills': '#0d9488', 'Getting around': '#f97316', 'Kosher food with a sukkah': '#e11d48', 'Kosher boat cruises': '#4f46e5' };
  function extrasHTML() {
    const X = DATA.extras || [];
    const groups = [...new Set(X.map(x => x.g))].filter(xShow);
    return groups.map(g => `<div class="xgroup"><h3>${esc(xLabel(g))}</h3><div class="xgrid">${X.filter(x => x.g === g).map(x => `<div class="xcard" style="--c:${XCOLORS[g] || '#0ea5e9'}">
      <b>${esc(x.n)}</b>${x.area ? `<span class="xarea">${esc(x.area)}</span>` : ''}${x.d ? `<p>${esc(x.d)}</p>` : ''}
      ${x.a ? `<a class="addr" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.n.split(' · ')[0] + ', ' + x.a)}" target="_blank" rel="noopener">${esc(x.a)}</a>` : ''}
      ${x.p && x.p.length ? `<div class="phones">${x.p.map(ph => `<span class="phone"><a href="tel:${esc(tel(ph))}">${esc(ph)}</a><button class="copy" type="button" data-copy="${esc(ph)}" aria-label="Copy ${esc(ph)}">Copy</button></span>`).join('')}</div>` : ''}
      ${x.w ? `<a class="btn ghost" href="${esc(x.w)}" target="_blank" rel="noopener" style="align-self:flex-start">Website</a>` : ''}</div>`).join('')}</div></div>`).join('');
  }
  function extrasTiles() {
    const X = DATA.extras || [];
    const tiles = [['Places to stay', 'Guest rentals in Monsey, Monroe and the Catskills', '#0ea5e9', X.filter(x => x.g.startsWith('Guest')).length], ['Getting around', 'Sprinter vans and rides', '#f97316', X.filter(x => x.g === 'Getting around').length], [xLabel('Kosher food with a sukkah'), 'Pizza Hub locations', '#e11d48', X.filter(x => x.g.startsWith('Kosher food')).length], ['Kosher boat cruises', 'Sukkah on board', '#4f46e5', X.filter(x => x.g.startsWith('Kosher boat')).length]];
    if (WINTER) tiles.pop();
    return tiles.filter(t => t[3]).map(t => `<a class="xtile" href="#explore" data-go="stay" style="--c:${t[2]}"><b>${esc(t[0])}</b><span>${esc(t[1])} · ${t[3]}</span></a>`).join('');
  }
  function renderExplore() {
    $('ex-extras').innerHTML = extrasHTML();
    $('ex-cats').innerHTML = LOCAL_ORDER.map(s => catCard(s, 'local')).join('');
    $('ex-trips').innerHTML = TRIP_ORDER.map(s => catCard(s, 'trip')).join('');
  }
  function renderTrips() {
    const list = P.filter(p => saved.has(p.key)).sort((a, b) => (tm(a) == null ? 1e6 : tm(a)) - (tm(b) == null ? 1e6 : tm(b)));
    $('trips-sum').innerHTML = list.length ? `<strong>${list.length}</strong> saved ${list.length === 1 ? 'place' : 'places'}, closest first` : '';
    $('copylist2').hidden = !list.length;
    $('trips-grid').innerHTML = list.length ? list.map(card).join('') : '<div class="empty">Nothing saved yet. Tap the star on any place to add it to My Trips. <a href="#search">Find places</a></div>';
    if (window.onTripsView) window.onTripsView();
  }
  function showView(v) {
    if (!VIEWS.includes(v) || (v === 'map' && !window.renderMap)) v = 'home';
    curView = v;
    document.body.dataset.view = v;
    VIEWS.forEach(x => { $('view-' + x).hidden = x !== v; });
    document.querySelectorAll('.navlinks a').forEach(a => a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'));
    $('nav-saved').textContent = saved.size || '';
    if (v === 'home') renderHome();
    else if (v === 'explore') renderExplore();
    else if (v === 'trips') renderTrips();
    else if (v === 'map') window.renderMap();
    else if (v === 'daven') { if (window.renderDaven) window.renderDaven(); }
    else render();
    window.scrollTo(0, 0);
    navSolid();
  }
  function go(v) { if (location.hash.slice(1) === v) showView(v); else location.hash = v; }
  window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
  function applyQuick(q) {
    state.indoor = q === 'rain'; state.free = q === 'free'; state.rev = q === 'rev'; state.snow = q === 'snow'; state.iwater = false; state.open = q === 'open'; if (q === 'open') state.day = '';
    state.max = q === 'close' ? 30 : Infinity;
    state.ages.clear(); if (q === 'little') { state.ages.add('Toddler+'); state.ages.add('Entire Family'); }
    state.area = 'local'; state.sections.clear(); state.states.clear();
  }
  function onCat(e) {
    const c = e.target.closest('.cat, .fun, .morepill[data-sec]'); if (!c) return false;
    applyQuick(''); state.q = []; $('q').value = ''; state.area = c.dataset.kind || 'local';
    if (c.dataset.vcat) state[c.dataset.vcat] = true; else state.sections.add(c.dataset.sec);
    go('search'); return true;
  }
  ['view-home', 'view-explore', 'view-trips'].forEach(id => $(id).addEventListener('click', e => { if (!onCat(e)) handleCommon(e); }));
  $('home-extras').addEventListener('click', e => { if (e.target.closest('[data-go="stay"]')) setTimeout(() => { const s = $('stay'); if (s) s.scrollIntoView({ block: 'start' }); }, 80); });
  $('heroquick').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b || !b.dataset.q) return; applyQuick(b.dataset.q); go('search'); });
  $('heroform').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('heroq').value.trim();
    $('q').value = v; state.q = norm(v).split(/\s+/).filter(Boolean);
    state.area = 'local'; state.sections.clear();
    go('search');
  });
  $('herofrom').addEventListener('change', e => { state.origin = e.target.value; savePrefs(); renderHome(); });
  document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', () => {
    if (a.dataset.go === 'reviews') { applyQuick('rev'); state.sort = 'reviews'; }
    if (a.dataset.go === 'free') { applyQuick('free'); state.sort = 'near'; }
    if (a.dataset.go === 'snow') { applyQuick('snow'); state.sort = 'near'; }
    if (a.dataset.go === 'indoorfav') { applyQuick('rain'); state.sort = 'reviews'; }
    if (a.dataset.go === 'stay') setTimeout(() => { const s = $('stay'); if (s) s.scrollIntoView({ block: 'start' }); }, 80);
  }));
  $('askpromo-btn').addEventListener('click', () => $('askbtn').click());
  if (SEASON.quick) {
    const qhtml = (pressed) => SEASON.quick.map(([q, t]) => `<button class="chip" type="button" data-q="${q}"${pressed ? ' aria-pressed="false"' : ''}>${esc(t)}</button>`).join('');
    $('heroquick').innerHTML = qhtml(false); $('quick').innerHTML = qhtml(true);
  }
  if (!SEASON.base) { const chm = $('chm'); if (chm) chm.closest('label').hidden = true; }
  if (WINTER) {
    $('indoor').parentNode.lastChild.textContent = ' Indoors (out of the cold)';
    document.querySelectorAll('[data-winter]').forEach(el => { el.hidden = false; });
    const st = SEASON.id === 'winter' ? 'Guest rentals, vans and rides, and kosher pizza from the guide.' : '';
    document.querySelectorAll('.stay-sub').forEach(el => { el.textContent = st; });
  }
  if (window.renderSeasonSwitch) window.renderSeasonSwitch();
  // what the extra features (features.js: day planner, sharing, rainy day, davening) need from here
  window.OF = { P, DATA, ORIG, ORIG_NAME, SEASON, WINTER, state, saved, tm, fmt, esc, T, YI, host, tel, secColor, hoursOn, hoursLine, dayISO, dayName, dayChoices, TODAY, isoOf, dateOf,
    render, openPlace, go, showView, savePrefs, persist, mini, card, handleCommon, onCat, applyQuick, rangeTxt, get curView() { return curView; } };
  document.dispatchEvent(new CustomEvent('of:ready'));
  showView(location.hash.slice(1) || 'home');
  (window.requestIdleCallback || (f => setTimeout(f, 1200)))(() => loadDetails());

  // ----- website checks (saved daily into data/checks.json by the GitHub checker) -----
  const CFG = window.SITE_CONFIG || {};
  const sbHeaders = () => { const h = {}; if (CFG.supabaseAnonKey) { h.apikey = CFG.supabaseAnonKey; if (/^eyJ/.test(CFG.supabaseAnonKey)) h.Authorization = 'Bearer ' + CFG.supabaseAnonKey; } return h; };
  (async () => {
    if (location.protocol === 'file:') return;
    try {
      const r = await fetch('data/checks.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const next = await r.json();
      if (!next || typeof next !== 'object' || !Object.keys(next).length) return;
      CHECKS = next; render();
      if (cur && openSheet === $('detail')) { const keep = curIdx; openPlace(cur.i); showPhoto(keep); }
    } catch (e) {}
  })();

  // ----- winter hours (data/hours.json: read from each place's own website, loads after the first screen) -----
  (async () => {
    try {
      const j = await getJSON('data/hours.json');
      Object.entries(j.hours || {}).forEach(([k, v]) => { const p = P[+k]; if (p && p.src !== 'new') p.winterHours = v; });
      window.HOURS_READY = true;
      if (curView === 'search') render(); else if (curView === 'trips') renderTrips();
      if (cur && openSheet === $('detail')) { const keep = curIdx; openPlace(cur.i); showPhoto(keep); }
    } catch (e) {}
  })();

  // ----- Ask AI (Google Gemini through a small Supabase function) -----
  const AI_URL = CFG.aiUrl || null;
  let busy = null;
  const turns = [];
  if (AI_URL) { $('askbtn').hidden = false; $('askpromo').hidden = false; }
  $('askbtn').addEventListener('click', () => { show($('askpanel')); setTimeout(() => $('askinput').focus(), 30); });
  $('examples').addEventListener('click', e => { const b = e.target.closest('.example'); if (b) { $('askinput').value = b.textContent; send(); } });
  $('askinput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('askinput').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; });
  $('askform').addEventListener('submit', e => { e.preventDefault(); if (busy) { busy.abort(); return; } send(); });
  function mdLite(text) {
    const lines = esc(text).split('\n');
    let html = '', inList = false;
    for (const raw of lines) {
      const l = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[\[(\d+)\]\]/g, (m, id) => P[+id] ? `<button class="placechip" type="button" data-open="${+id}">${esc(P[+id].n)} ›</button>` : '');
      if (/^\s*[-*•]\s+/.test(raw)) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + l.replace(/^\s*[-*•]\s+/, '') + '</li>'; continue; }
      if (inList) { html += '</ul>'; inList = false; }
      if (/^\s*#{1,6}\s+/.test(raw)) { html += '<p><b>' + l.replace(/^\s*#{1,6}\s+/, '') + '</b></p>'; continue; }
      if (l.trim()) html += '<p>' + l + '</p>';
    }
    if (inList) html += '</ul>';
    return html;
  }
  const ERR = {
    rate_limited: 'The free AI is busy right now (too many questions this minute or today). Wait a minute and try again.',
    not_configured: 'The AI helper is not set up yet. The search and filters still work.',
    forbidden: 'The AI helper only answers on the official website address.',
  };
  async function send() {
    const q = $('askinput').value.trim();
    if (!q || busy || !AI_URL) return;
    $('examples').hidden = true;
    $('askinput').value = ''; $('askinput').style.height = 'auto';
    const log = $('asklog');
    log.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(q)}</div>`);
    const bubble = document.createElement('div'); bubble.className = 'msg bot'; bubble.innerHTML = '<p class="status">Thinking…</p>';
    log.appendChild(bubble); log.scrollTop = log.scrollHeight;
    turns.push({ role: 'user', content: q });
    while (turns.length > 12) turns.shift();
    if (turns[0].role !== 'user') turns.shift();
    busy = new AbortController();
    $('asksend').textContent = 'Stop';
    try {
      const r = await fetch(AI_URL, {
        method: 'POST', signal: busy.signal,
        headers: Object.assign({ 'Content-Type': 'application/json' }, sbHeaders()),
        body: JSON.stringify({ messages: turns, origin: ORIG_NAME[state.origin] || '', today: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) })
      });
      let j = {};
      try { j = await r.json(); } catch (e) {}
      if (!r.ok || !j.text) throw { code: j.error || (r.status === 404 ? 'not_configured' : 'upstream_error') };
      bubble.innerHTML = mdLite(j.text);
      turns.push({ role: 'assistant', content: j.text });
    } catch (e) {
      if (e && e.name === 'AbortError') bubble.innerHTML = '<p class="status">Stopped.</p>';
      else { bubble.className = 'msg bot err'; bubble.innerHTML = `<p>${esc(ERR[e && e.code] || 'Something went wrong while asking. Try again in a moment.')}</p>`; }
      turns.pop();
    } finally {
      busy = null; $('asksend').textContent = 'Send'; log.scrollTop = log.scrollHeight;
    }
  }
  $('asklog').addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o) openPlace(+o.dataset.open); });

  // ----- feedback & help: saved privately in Supabase (table "feedback", bucket "feedback").
  // Visitors can only add messages; the site owner reads them in the dashboard. Never sent to the AI helper. -----
  const SB = (CFG.supabaseUrl || '').replace(/\/$/, '');
  window.FEEDBACK_ON = !!(SB && CFG.supabaseAnonKey && CFG.feedback);   // set feedback: true in config.js once the inbox exists
  let fbAbout = null, fbShot = null, fbShotJob = null, fbOwn = null, fbLast = 0, fbSeq = 0;
  if (window.FEEDBACK_ON) { $('fbbtn').hidden = false; $('fbline').hidden = false; }
  const fbStatus = t => { $('fbstatus').textContent = t || ''; };
  // html2canvas can't read color-mix(); give the copy it draws plain colors instead
  function plainColors(doc) {
    const fix = s => s.replace(/color-mix\(in srgb,\s*(var\([^)]*\)|#[0-9a-f]+|[a-z]+)\s*\d*%?,\s*[^)]*\)/gi, '$1');
    const walk = rules => { for (const r of rules) { if (r.cssRules) walk(r.cssRules); if (r.style && r.style.cssText.indexOf('color-mix') >= 0) r.style.cssText = fix(r.style.cssText); } };
    for (const s of doc.styleSheets) { try { walk(s.cssRules); } catch (e) {} }
    // ::before/::after are copied as inline styles with colors like color(srgb r g b / a); turn those into rgba()
    const toRgba = s => s.replace(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/g,
      (m, r, g, b, a) => `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a == null ? 1 : a})`);
    doc.querySelectorAll('[style*="color("]').forEach(el => el.setAttribute('style', toRgba(el.getAttribute('style'))));
  }
  function capturePage(underId) {
    return (async () => {
      if (location.protocol === 'file:') return null;
      if (!window.html2canvas) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      const w = window.innerWidth, h = window.innerHeight;
      const far = el => { const r = el.getBoundingClientRect(); return r.bottom < -300 || r.top > h + 300; };
      const canvas = await window.html2canvas(document.body, {
        x: window.scrollX, y: window.scrollY, width: w, height: h, windowWidth: w, windowHeight: h,
        scale: Math.min(window.devicePixelRatio || 1, 1.5), useCORS: true, logging: false,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        ignoreElements: el => el.id === 'fbpanel' || el.id === 'totop' || (el.classList && (el.classList.contains('card') || el.classList.contains('mini')) && far(el)),
        onclone: doc => {
          plainColors(doc);
          doc.body.style.overflow = '';
          doc.getElementById('scrim').dataset.open = underId ? 'true' : 'false';
          if (underId) doc.getElementById(underId).dataset.open = 'true';
        }
      });
      return await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.72));
    })().catch(() => null);
  }
  // a picture someone attaches: shrink it and re-save as JPEG (this also drops any location data in the photo)
  function shrinkImage(file) {
    return new Promise(res => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(res, 'image/jpeg', 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  }
  function showPreview() {
    const box = $('fbprev');
    const blob = fbOwn || ($('fbshoton').checked ? fbShot : null);
    if (fbOwn) box.innerHTML = `<img alt="Your screenshot" src="${URL.createObjectURL(fbOwn)}"><span>Your screenshot will be sent. <button class="linkbtn" type="button" id="fbownx">Remove</button></span>`;
    else if (!$('fbshoton').checked) box.innerHTML = '';
    else if (blob) box.innerHTML = `<img alt="Picture of the page" src="${URL.createObjectURL(blob)}"><span>This picture of the page will be sent with your message.</span>`;
    else if (fbShotJob) box.innerHTML = '<span>Taking a picture of the page…</span>';
    else box.innerHTML = '<span>A picture of the page could not be taken here. You can attach a screenshot instead.</span>';
  }
  function openFeedback(place) {
    const under = openSheet && openSheet !== $('fbpanel') ? openSheet.id : null;
    fbAbout = place || null;
    $('fbabout').hidden = !fbAbout;
    $('fbabout').textContent = fbAbout ? 'About: ' + fbAbout.n : '';
    if (fbAbout) $('fbk-problem').checked = true;
    $('fbform').hidden = false; $('fbdone').hidden = true; fbStatus('');
    fbShot = null; fbOwn = null; $('fbfile').value = '';
    const seq = ++fbSeq;
    fbShotJob = capturePage(under).then(b => { if (seq === fbSeq) { fbShot = b; fbShotJob = null; showPreview(); } return b; });
    showPreview();
    show($('fbpanel'));
    setTimeout(() => $('fbmsg').focus(), 40);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-feedback]');
    if (!b || !window.FEEDBACK_ON) return;
    e.preventDefault();
    const v = b.dataset.feedback;
    openFeedback(v !== '' && P[+v] ? P[+v] : null);
  });
  $('fbshoton').addEventListener('change', showPreview);
  $('fbfile').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    fbOwn = await shrinkImage(f);
    if (!fbOwn) fbStatus('That file could not be opened as a picture. Try a PNG or JPG screenshot.');
    showPreview();
  });
  $('fbprev').addEventListener('click', e => { if (e.target.id === 'fbownx') { fbOwn = null; $('fbfile').value = ''; showPreview(); } });
  $('fbagain').addEventListener('click', () => { $('fbmsg').value = ''; openFeedback(fbAbout); });
  $('fbform').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('fbmsg').value.trim();
    if (msg.length < 3) { fbStatus('Please write a few words first.'); $('fbmsg').focus(); return; }
    if (Date.now() - fbLast < 15000) { fbStatus('Thanks! Please wait a few seconds before sending another message.'); return; }
    $('fbsend').disabled = true; fbStatus(''); $('fbsend').textContent = 'Sending…';
    try {
      let shot = fbOwn;
      if (!shot && $('fbshoton').checked) shot = fbShot || (fbShotJob ? await fbShotJob : null);
      let shotPath = null;
      if (shot) {
        const path = new Date().toISOString().slice(0, 10) + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.jpg';
        try {
          const up = await fetch(`${SB}/storage/v1/object/feedback/${path}`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'image/jpeg' }, sbHeaders()), body: shot });
          if (up.ok) shotPath = path;
        } catch (err) {}
      }
      const kind = (document.querySelector('input[name="fbkind"]:checked') || {}).value || 'problem';
      const contact = $('fbcontact').value.trim().slice(0, 200);
      const row = {
        kind, message: msg.slice(0, 4000), contact: contact || null,
        place_id: fbAbout ? fbAbout.i : null, place_name: fbAbout ? fbAbout.n.slice(0, 200) : null,
        view: curView, page_url: location.href.slice(0, 500),
        screen: `${window.innerWidth}x${window.innerHeight} @${Math.round((window.devicePixelRatio || 1) * 100) / 100}x`,
        agent: navigator.userAgent.slice(0, 400), shot_path: shotPath
      };
      const r = await fetch(`${SB}/rest/v1/feedback`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, sbHeaders()), body: JSON.stringify(row) });
      if (!r.ok) throw new Error('feedback ' + r.status);
      fbLast = Date.now();
      $('fbdonetext').textContent = contact ? "We got your message and we'll get back to you." : 'We got your message.';
      $('fbform').hidden = true; $('fbdone').hidden = false; $('fbmsg').value = ''; $('fbcontact').value = '';
    } catch (err) {
      fbStatus("Your message didn't send. Check your internet connection and try again.");
    } finally {
      $('fbsend').disabled = false; $('fbsend').textContent = 'Send';
    }
  });

  // ----- live weather for each place (Open-Meteo, free) -----
  const WX = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="4.5" fill="#fcd34d"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
    part: '<svg viewBox="0 0 24 24"><circle cx="8.5" cy="8.5" r="4" fill="#fcd34d" stroke="#f59e0b" stroke-width="1.5"/><path d="M7 19h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.5A3.3 3.3 0 0 0 7 19z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M6.5 19h11a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.6A3.8 3.8 0 0 0 6.5 19z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/></svg>',
    fog: '<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"><path d="M4 9h16M3 13h18M5 17h14"/></svg>',
    rain: '<svg viewBox="0 0 24 24"><path d="M6.5 15h11a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.6A3.8 3.8 0 0 0 6.5 15z" fill="#cbd5e1" stroke="#64748b" stroke-width="1.5"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round"/></svg>',
    snow: '<svg viewBox="0 0 24 24"><path d="M6.5 15h11a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.6A3.8 3.8 0 0 0 6.5 15z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/><g fill="#38bdf8"><circle cx="8" cy="19" r="1.3"/><circle cx="12" cy="20.5" r="1.3"/><circle cx="16" cy="19" r="1.3"/></g></svg>',
    storm: '<svg viewBox="0 0 24 24"><path d="M6.5 14h11a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.6A3.8 3.8 0 0 0 6.5 14z" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/><path d="M12 14l-2.5 4h3L11 22" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></svg>',
  };
  const wxKind = c => c === 0 ? 'sun' : c <= 2 ? 'part' : c === 3 ? 'cloud' : c <= 48 ? 'fog' : c <= 67 ? 'rain' : c <= 77 ? 'snow' : c <= 82 ? 'rain' : c <= 86 ? 'snow' : 'storm';
  const WXNAME = { sun: 'Sunny', part: 'Partly cloudy', cloud: 'Cloudy', fog: 'Fog', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorms' };
  const wxCache = {};
  async function loadWeather(p) {
    const box = $('d-weather');
    if (!box || !p.ll) return;
    box.innerHTML = '<div class="wx"><p class="hint" style="margin:0">Loading this week\'s weather…</p></div>';
    try {
      const key = p.ll.join(',');
      if (!wxCache[key]) {
        const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.ll[0]}&longitude=${p.ll[1]}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`;
        const r = await fetch(u);
        if (!r.ok) throw new Error('weather');
        wxCache[key] = (await r.json()).daily;
      }
      if (cur !== p || !$('d-weather')) return;
      const d = wxCache[key];
      const day = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
      $('d-weather').innerHTML = `<div class="wx"><h4>Weather this week</h4><div class="wxrow">${d.time.map((t, k) => {
        const kd = wxKind(d.weather_code[k]);
        return `<div class="wxd" title="${WXNAME[kd]}"><span>${k === 0 ? 'Today' : day(t)}</span>${WX[kd]}<b>${Math.round(d.temperature_2m_max[k])}°</b><small>${Math.round(d.temperature_2m_min[k])}° · ${d.precipitation_probability_max[k] == null ? 0 : d.precipitation_probability_max[k]}% rain</small></div>`;
      }).join('')}</div><p class="hint" style="margin:6px 0 0">Highs and lows in °F, with the chance of rain. Live forecast from Open-Meteo.</p></div>`;
    } catch (e) { if ($('d-weather')) $('d-weather').innerHTML = ''; }
  }
  const featuresOpen = window.onPlaceOpen;
  window.onPlaceOpen = p => { loadWeather(p); if (featuresOpen) featuresOpen(p); };

  // ----- map (Leaflet + OpenStreetMap, free) -----
  let mapObj = null, mapLayer = null;
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const loadCss = href => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); };
  window.renderMap = async function () {
    try {
      if (!window.L) {
        loadCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
        loadCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css');
        loadCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js');
      }
      if (!mapObj) {
        mapObj = L.map('map', { scrollWheelZoom: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(mapObj);
      }
      if (mapLayer) mapLayer.remove();
      mapLayer = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
      const list = P.filter(p => passes(p) && p.ll);
      list.forEach(p => {
        const m = L.circleMarker(p.ll, { radius: 8, color: '#ffffff', weight: 2, fillColor: secColor(p.s), fillOpacity: 1 });
        const t = tm(p);
        m.bindPopup(`<b>${esc(p.n)}</b><br><span style="color:${secColor(p.s)};font-weight:700">${esc(p.s)}</span>${t != null ? ' · ' + esc(fmt(t)) + ' from ' + esc(ORIG_NAME[state.origin] || '') : ''}<br><button class="btn" type="button" data-open="${p.i}" style="margin-top:6px;padding:5px 12px">See details</button>`);
        mapLayer.addLayer(m);
      });
      mapObj.addLayer(mapLayer);
      if (window.mapExtras) window.mapExtras(mapObj);
      const filtered = state.sections.size || state.ages.size || state.states.size || state.q.length || state.free || state.indoor || state.rev || state.snow || state.iwater || state.max < Infinity || state.budget !== 'any';
      $('map-sum').textContent = `${list.length} ${state.area === 'trip' ? 'trip' : state.area === 'saved' ? 'saved' : 'near-home'} places${filtered ? ' matching your search' : ''}. Tap a dot to see the place. Use Search to change what's shown.`;
      setTimeout(() => { mapObj.invalidateSize(); if (list.length) mapObj.fitBounds(L.latLngBounds(list.map(p => p.ll)), { padding: [30, 30], maxZoom: 13 }); }, 60);
    } catch (e) { $('map-sum').textContent = 'The map could not load. Check your internet connection and try again.'; }
  };
  $('map').addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o) openPlace(+o.dataset.open); });
  $('nav-map').hidden = false;
  document.querySelectorAll('[data-needs="map"]').forEach(el => { el.hidden = false; });
  $('showmap').hidden = false;
  $('showmap').addEventListener('click', () => go('map'));
  if (location.hash === '#map') showView('map');
})();
