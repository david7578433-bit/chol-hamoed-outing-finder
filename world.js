/* World Jewish Trip Planner — all in the browser, no tracking.
   Data: data/world-cities.json (shuls from GoDaven, women's mikvaos from mikvah.org, the rest from the sources named on each item).
   Zmanim: sunrise/sunset ("Almanac" algorithm, the one KosherJava's SunTimesCalculator uses), GRA hours. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let DATA = null, CITY = {}, EXTRA = {listings: [], sponsors: []};

/* ---------- dates & time zones ---------- */
const D = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
const dow = s => D(s).getUTCDay();
const diffDays = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const fmtDate = (s, o = {weekday: 'short', month: 'short', day: 'numeric'}) => D(s).toLocaleDateString('en-US', {timeZone: 'UTC', ...o});
const dtfCache = {};
const dtf = (tz, o) => { const k = tz + JSON.stringify(o); return dtfCache[k] || (dtfCache[k] = new Intl.DateTimeFormat('en-US', {timeZone: tz, ...o})); };
const localDate = (ms, tz) => { const p = dtf(tz, {year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(ms)); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };
const fmtTime = (ms, tz) => ms == null || isNaN(ms) ? '—' : dtf(tz, {hour: 'numeric', minute: '2-digit'}).format(new Date(ms));
function tzOffset(ms, tz) {
  const p = dtf(tz, {hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).formatToParts(new Date(ms));
  const g = t => +p.find(x => x.type === t).value;
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - ms;
}
function zonedToUtc(dateStr, hh, mm, tz) {
  const wall = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10), hh, mm);
  let t = wall;
  for (let i = 0; i < 3; i++) t = wall - tzOffset(t, tz);
  return t;
}
function todayIn(tz) { try { return localDate(Date.now(), tz || Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return iso(new Date()); } }

/* ---------- zmanim ---------- */
const RAD = Math.PI / 180;
function sunUT(dateStr, lat, lng, zenith, rising) {
  const y = +dateStr.slice(0, 4), N = diffDays(`${y}-01-01`, dateStr) + 1;
  const lngHour = lng / 15, t = N + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * RAD) + 0.020 * Math.sin(2 * M * RAD) + 282.634; L = (L % 360 + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * RAD)) / RAD; RA = (RA % 360 + 360) % 360;
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(L * RAD), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * RAD) - sinDec * Math.sin(lat * RAD)) / (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rising ? 360 - Math.acos(cosH) / RAD : Math.acos(cosH) / RAD) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  return ((T - lngHour) % 24 + 24) % 24;
}
function sunEvent(dateStr, lat, lng, zenith, rising) {
  const ut = sunUT(dateStr, lat, lng, zenith, rising); if (ut == null) return null;
  const base = D(dateStr).getTime(), noon = base + 12 * 36e5 - lng / 15 * 36e5, target = noon + (rising ? -6 : 6) * 36e5;
  let best = null;
  for (const k of [-1, 0, 1]) { const t = base + ut * 36e5 + k * 864e5; if (best == null || Math.abs(t - target) < Math.abs(best - target)) best = t; }
  return best;
}
const zCache = {};
function zmanim(city, dateStr) {
  const k = city.id + dateStr; if (zCache[k]) return zCache[k];
  const {lat, lng} = city;
  const rise = sunEvent(dateStr, lat, lng, 90.833, true), set = sunEvent(dateStr, lat, lng, 90.833, false);
  if (rise == null || set == null) return (zCache[k] = null);
  const sz = (set - rise) / 12;
  return (zCache[k] = {
    alos: sunEvent(dateStr, lat, lng, 106.1, true), rise, shema: rise + 3 * sz, tefila: rise + 4 * sz, chatzos: rise + 6 * sz,
    minchaG: rise + 6.5 * sz, plag: set - 1.25 * sz, set, tzeis: sunEvent(dateStr, lat, lng, 98.5, false),
    candle: set - (city.candleMin || 18) * 6e4
  });
}

/* ---------- Hebrew calendar (the browser's own Hebrew calendar) ---------- */
const hebFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', {timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'});
const hCache = {};
function heb(dateStr) {
  if (hCache[dateStr]) return hCache[dateStr];
  const p = hebFmt.formatToParts(new Date(D(dateStr).getTime() + 12 * 36e5));
  const g = t => (p.find(x => x.type === t) || {}).value;
  return (hCache[dateStr] = {d: +g('day'), m: g('month'), y: g('year') || g('relatedYear'), text: `${g('day')} ${g('month')}`});
}
function yomTov(dateStr, israel) {
  const {d, m} = heb(dateStr);
  const T = {
    Tishri: {1: 'Rosh Hashana', 2: 'Rosh Hashana', 10: 'Yom Kippur', 15: 'Sukkos', 16: israel ? null : 'Sukkos', 22: israel ? 'Shemini Atzeres / Simchas Torah' : 'Shemini Atzeres', 23: israel ? null : 'Simchas Torah'},
    Nisan: {15: 'Pesach', 16: israel ? null : 'Pesach', 21: 'Pesach (7th day)', 22: israel ? null : 'Pesach (last day)'},
    Sivan: {6: 'Shavuos', 7: israel ? null : 'Shavuos'}
  };
  return (T[m] && T[m][d]) || null;
}
function dayNote(dateStr) {
  const {d, m} = heb(dateStr), w = dow(dateStr), notes = [];
  if ((m === 'Kislev' && d >= 25) || (m === 'Tevet' && d <= 2) || (m === 'Tevet' && d === 3 && heb(addDays(dateStr, -1)).d === 2 && heb(addDays(dateStr, -8)).m === 'Kislev' && heb(addDays(dateStr, -8)).d === 25)) notes.push('Chanukah');
  if (m === 'Tevet' && d === 10) notes.push('Fast of 10 Teves (Asara B\u2019Teves)');
  if (((m === 'Tamuz' && d === 17) && w !== 6) || (m === 'Tamuz' && d === 18 && w === 0)) notes.push('Fast of 17 Tammuz');
  if (((m === 'Av' && d === 9) && w !== 6) || (m === 'Av' && d === 10 && w === 0)) notes.push('Tisha B\u2019Av');
  if (((m === 'Tishri' && d === 3) && w !== 6) || (m === 'Tishri' && d === 4 && w === 0)) notes.push('Fast of Gedalyah');
  if ((m === 'Adar' || m === 'Adar II') && d === 14) notes.push('Purim');
  if ((m === 'Adar' || m === 'Adar II') && ((d === 13 && w !== 6) || (d === 11 && w === 4))) notes.push('Fast of Esther');
  if (d === 30 || (d === 1 && m !== 'Tishri')) notes.push('Rosh Chodesh');
  if (m === 'Nisan' && d >= 17 && d <= 20) notes.push('Chol Hamoed Pesach');
  if (m === 'Tishri' && d >= 17 && d <= 21) notes.push('Chol Hamoed Sukkos');
  return notes;
}
const isIsrael = c => c.country === 'Israel';
const restricted = (dateStr, c) => dow(dateStr) === 6 || !!yomTov(dateStr, isIsrael(c));
const restrictedName = (dateStr, c) => yomTov(dateStr, isIsrael(c)) || (dow(dateStr) === 6 ? 'Shabbos' : null);
function windowOf(dateStr, c) { // Shabbos / Yom Tov window at a place: candle lighting the eve before → tzeis
  const eve = zmanim(c, addDays(dateStr, -1)), z = zmanim(c, dateStr);
  if (!eve || !z) return null;
  return [eve.candle, (z.tzeis ?? z.set + 50 * 6e4)];
}

/* ---------- geography & legs ---------- */
function km(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const DEP_HOUR = 10; // assumed departure time (local) for planning only
function makeLeg(from, to) {
  const dist = km(from, to);
  const sameArea = dist < 60, ground = dist < 350;
  let hours, mode, stops = '';
  if (sameArea) { mode = 'local'; hours = Math.max(0.5, dist / 40); }
  else if (ground) { mode = 'ground'; hours = dist / 70 + 0.3; }
  else { mode = 'air'; hours = dist / 830 + 0.6; if (dist > 11000) { hours += 2.5; stops = '1 stop likely'; } else if (dist > 7500) stops = 'nonstop or 1 stop'; else stops = 'often nonstop'; }
  return {from, to, dist, hours, mode, stops, fa: (from.airports || [])[0], ta: (to.airports || [])[0]};
}
function timing(leg, depDate) {
  const depMs = zonedToUtc(depDate, DEP_HOUR, 0, leg.from.tz), arrMs = depMs + leg.hours * 36e5;
  return {depDate, depMs, arrMs, arrDate: localDate(arrMs, leg.to.tz)};
}
function conflict(leg, t) {
  if (restricted(t.depDate, leg.from)) return `${restrictedName(t.depDate, leg.from)} in ${leg.from.short}`;
  for (const [c, pad] of [[leg.from, 0], [leg.to, 3]]) {
    for (let d = addDays(t.depDate, -1); d <= addDays(t.arrDate, 2); d = addDays(d, 1)) {
      if (!restricted(d, c)) continue;
      const w = windowOf(d, c); if (!w) continue;
      if (t.depMs < w[1] && t.arrMs + pad * 36e5 > w[0]) return pad ? `you\u2019d land less than 3 hours before ${restrictedName(d, c)} in ${c.short}` : `you\u2019d still be traveling when ${restrictedName(d, c)} starts in ${c.short}`;
    }
  }
  return null;
}

/* ---------- planner ---------- */
function plan(inp) {
  const home = CITY[inp.home], stops = inp.stops.map(s => ({c: CITY[s.id], nights: s.nights})).filter(s => s.c);
  if (!home || !stops.length) return {error: 'Pick a home city and at least one stop.'};
  const days = Math.max(2, Math.min(60, inp.days | 0)), start = inp.start, end = addDays(start, days - 1);
  const route = [home, ...stops.map(s => s.c), home];
  const legs = route.slice(0, -1).map((c, i) => makeLeg(c, route[i + 1]));
  const notes = [];
  // first leg: earliest allowed day
  let t0 = null;
  for (let k = 0; k < 8 && !t0; k++) { const t = timing(legs[0], addDays(start, k)); const why = conflict(legs[0], t); if (!why) t0 = t; else if (k === 0) notes.push(`Can\u2019t leave on ${fmtDate(start)} (${why}), so the plan leaves the next possible day.`); }
  // last leg: latest allowed day that still gets home by the last day
  const L = legs[legs.length - 1];
  let tL = null;
  for (let k = 0; k < 10 && !tL; k++) { const d = addDays(end, -k); if (d < t0.arrDate) break; const t = timing(L, d); if (t.arrDate <= end && !conflict(L, t)) tL = t; }
  if (!tL || tL.depDate < t0.arrDate) return {error: `${days} days is too short for this route with Shabbos rules. Add days or remove a stop.`};
  const times = [t0];
  let cur = t0.arrDate;
  for (let i = 1; i < legs.length - 1; i++) {
    const remStops = legs.length - 1 - i + 1, remDays = diffDays(cur, tL.depDate);
    const want = stops[i - 1].nights > 0 ? +stops[i - 1].nights : Math.max(1, Math.round(remDays / remStops));
    let got = null;
    for (const off of [0, 1, -1, 2, -2, 3, -3]) {
      const d = addDays(cur, Math.max(1, want + off));
      if (d >= tL.depDate) continue;
      const t = timing(legs[i], d);
      if (t.arrDate > tL.depDate) continue;
      if (!conflict(legs[i], t)) { got = t; break; }
    }
    if (!got) return {error: 'Not enough days to fit every stop around Shabbos. Add days or remove a stop.'};
    times.push(got); cur = got.arrDate;
  }
  times.push(tL);
  legs.forEach((l, i) => { l.t = times[i]; l.why = null; });
  // the "one more Shabbos" hint
  if (tL.arrDate < end) {
    const spare = diffDays(tL.arrDate, end);
    let n = `You\u2019re back home ${spare} day${spare > 1 ? 's' : ''} before day ${days}, so nobody is flying into Shabbos or Yom Tov.`;
    const wd = dow(end);
    if ((wd === 5 || wd === 6) && !route.some(c => yomTov(end, isIsrael(c)) || yomTov(addDays(end, -1), isIsrael(c)))) n += ` Make it ${days + (7 - wd)} days to spend that Shabbos in ${route[route.length - 2].short} and fly home Sunday.`;
    notes.push(n);
  }
  // build days
  const out = [];
  const push = (date, city, kind, extra = {}) => out.push({date, city, kind, ...extra});
  for (let d = start; d < t0.depDate; d = addDays(d, 1)) push(d, home, 'home');
  legs.forEach((leg, i) => {
    const t = leg.t;
    const prev = out[out.length - 1];
    if (prev && prev.date === t.depDate && prev.kind === 'arrive') { prev.kind = 'travel'; prev.legOut = leg; }
    else push(t.depDate, leg.from, i === 0 ? 'leave' : 'travel', {legOut: leg});
    // whole days in the air
    for (let d = addDays(t.depDate, 1); d < t.arrDate; d = addDays(d, 1)) push(d, null, 'air', {legIn: leg});
    if (t.arrDate !== t.depDate) push(t.arrDate, leg.to, i === legs.length - 1 ? 'return' : 'arrive', {legIn: leg});
    else out[out.length - 1].legIn = leg, out[out.length - 1].sameDay = true;
    const next = legs[i + 1];
    if (next) for (let d = addDays(t.arrDate, 1); d < next.t.depDate; d = addDays(d, 1)) push(d, leg.to, 'stay');
  });
  for (let d = addDays(tL.arrDate, 1); d <= end; d = addDays(d, 1)) push(d, home, 'home');
  // nights per stop
  const nights = stops.map((s, i) => ({c: s.c, n: diffDays(legs[i].t.arrDate, legs[i + 1].t.depDate)}));
  return {home, stops, legs, days: out, start, end, notes, nights, inp};
}

/* ---------- helpers for content ---------- */
const src = (it) => it && it.source ? `<span class="src">Source: <a href="${esc(it.source)}" target="_blank" rel="noopener">${esc(it.sourceName || host(it.source))}</a>${it.checked ? ' · checked ' + esc(it.checked) : ''}</span>` : '';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'link'; } };
const tel = p => p ? `<a href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}">${esc(p)}</a>` : '';
function minyanLine(s) {
  const m = s.minyanim || {}, parts = [];
  if (m.shacharis) parts.push(`Shacharis ${m.shacharis.slice(0, 4).join(', ')}`);
  if (m.mincha) parts.push(`Mincha ${m.mincha.slice(0, 3).join(', ')}`);
  if (m.maariv) parts.push(`Maariv ${m.maariv.slice(0, 3).join(', ')}`);
  return parts.length ? parts.join(' · ') : 'Times not listed — call the shul';
}
function shulItem(s) {
  return `<li><b>${esc(s.name)}</b>${s.nusach ? ` <span class="src">(${esc(s.nusach)})</span>` : ''}<br>${esc(minyanLine(s))}<br><span class="src">${esc(s.address || '')}${s.phone ? ' · ' : ''}</span>${tel(s.phone)}<br>${src(s)}${s.updated ? `<span class="src"> · listing updated ${esc(s.updated)}</span>` : ''}</li>`;
}
function pick(list, i) { return list && list.length ? list[i % list.length] : null; }
const ridesFor = c => ((DATA.rideApps || {})[c.country] || []);
function taxiHtml(c) {
  const apps = ridesFor(c).map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a>`).join(' · ');
  const jcs = (c.carService || []).map(s => `${esc(s.name)} ${tel(s.phone)}`).join(' · ');
  const maps = `<a href="https://www.google.com/maps/search/taxi/@${c.lat},${c.lng},13z" target="_blank" rel="noopener">Taxis near ${esc(c.short)}</a>`;
  return [jcs && `Jewish car service: ${jcs}`, apps && `Ride apps: ${apps}`, maps].filter(Boolean).join('<br>');
}
function flightLinks(leg, adults, kids) {
  const t = leg.t;
  if (leg.mode !== 'air') {
    const u = `https://www.google.com/maps/dir/?api=1&origin=${leg.from.lat},${leg.from.lng}&destination=${leg.to.lat},${leg.to.lng}&travelmode=${leg.mode === 'local' ? 'driving' : 'transit'}`;
    return `<a class="btn small" href="${u}" target="_blank" rel="noopener">Directions (car / train)</a>`;
  }
  const q = encodeURIComponent(`Flights from ${leg.fa} to ${leg.ta} on ${t.depDate} one way ${adults} adults${kids ? ` ${kids} children` : ''}`);
  const g = `https://www.google.com/travel/flights?q=${q}`;
  const kids11 = kids ? '/children' + '-11'.repeat(kids) : '';
  const k = `https://www.kayak.com/flights/${leg.fa}-${leg.ta}/${t.depDate}/${adults}adults${kids11}?sort=bestflight_a`;
  return `<a class="btn small printurl" href="${g}" target="_blank" rel="noopener">See live prices &amp; book</a> <a class="btn small ghost" href="${k}" target="_blank" rel="noopener">Compare on Kayak</a>`;
}
function airportBlock(code) {
  const a = (DATA.airports || {})[code]; if (!a) return '';
  const m = (a.minyanim || []).slice(0, 2).map(s => `${esc(s.name)} — ${esc(minyanLine(s))} ${src(s)}`).join('<br>');
  return `<p><b>${esc(code)}</b> ${esc(a.name || '')}: ${m || 'no airport minyan listed on GoDaven — daven at a quiet gate or before you leave'}</p>`;
}
function zmanimGrid(c, date, highlight) {
  const z = zmanim(c, date), tz = c.tz;
  if (!z) return '<p>Zmanim not available for this place and date.</p>';
  const row = (k, v, hl) => `<div${hl ? ' class="hl"' : ''}><span>${k}</span><span>${fmtTime(v, tz)}</span></div>`;
  let h = row('Alos (16.1\u00b0)', z.alos) + row('Netz (sunrise)', z.rise) + row('Sof zman Shema (GRA)', z.shema) + row('Chatzos', z.chatzos) + row('Mincha gedola', z.minchaG) + row('Plag hamincha', z.plag) + row('Shkiah (sunset)', z.set) + row('Tzeis (8.5\u00b0)', z.tzeis);
  if (highlight === 'candle') h = row(`Candle lighting (${c.candleMin || 18} min)`, z.candle, true) + h;
  if (highlight === 'havdalah') h = row('Shabbos ends (tzeis 8.5\u00b0)', z.tzeis, true) + h;
  return `<div class="zm">${h}</div>`;
}
const sponsorFor = c => (EXTRA.sponsors || []).filter(s => s.city_id === c.id || s.city_id === 'all');
function sponsorHtml(c) {
  return sponsorFor(c).slice(0, 1).map(s => `<div class="sponsor"><b>Sponsored</b>${esc(s.name)} — ${esc(s.text)} ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener sponsored">More</a>` : ''}</div>`).join('');
}
function listingsFor(c, type) { return (EXTRA.listings || []).filter(l => l.city_id === c.id && (!type || l.type === type)); }

/* ---------- day cards ---------- */
function dayCard(day, idx, P) {
  const c = day.city, date = day.date, w = dow(date);
  const flags = [], blocks = [];
  const hd = heb(date), hn = dayNote(date);
  let cls = 'day', title = '', kindTag = '';
  const ad = P.inp.adults, ch = P.inp.children;
  if (day.kind === 'air') {
    cls += ' travel';
    title = `In the air: ${esc(day.legIn.from.short)} \u2192 ${esc(day.legIn.to.short)}`;
    flags.push('<span class="tag bad">No minyan possible</span>', '<span class="tag bad">No mikvah possible</span>');
    blocks.push(`<div class="blk full"><h4>Davening</h4><p>A full day in the air${day.legIn.dist > 11000 ? ' (and you cross the International Date Line)' : ''}. Daven on the plane or at the connecting airport. Ask your Rav ahead of time about davening times and the date line.</p></div>`);
    return `<article class="${cls}"><header><span class="dn">Day ${idx + 1}</span><h3>${fmtDate(date)}</h3><span class="heb">${esc(hd.text)}${hn.length ? ' · ' + esc(hn.join(' · ')) : ''}</span><span class="flags">${flags.join('')}</span></header><div class="body">${blocks.join('')}</div></article>`;
  }
  const rname = restrictedName(date, c);
  const isRest = !!rname;
  const tomorrowRest = restrictedName(addDays(date, 1), c);
  const z = zmanim(c, date);
  if (day.kind === 'home') title = `Home \u2014 ${esc(c.short)}`;
  else if (day.kind === 'stay') title = esc(c.short);
  else if (day.kind === 'leave') title = `Leave home: ${esc(day.legOut.from.short)} \u2192 ${esc(day.legOut.to.short)}`;
  else if (day.kind === 'travel') title = `${esc((day.legIn || day.legOut).from.short)} \u2192 ${esc(day.legOut ? day.legOut.to.short : day.legIn.to.short)}`;
  else if (day.kind === 'arrive') title = `Arrive in ${esc(c.short)}`;
  else if (day.kind === 'return') title = `Home again \u2014 ${esc(c.short)}`;
  if (isRest) { cls += ' shabbos'; kindTag = `<span class="tag gold">${esc(rname)} \u2014 no travel</span>`; }
  if (['leave', 'travel', 'arrive', 'return'].includes(day.kind)) cls += ' travel';
  // travel block
  const legs = [];
  if (day.legOut && day.kind !== 'arrive' && day.kind !== 'return') legs.push(['out', day.legOut]);
  if (day.legIn && (day.kind === 'arrive' || day.kind === 'return' || day.sameDay)) legs.push(['in', day.legIn]);
  const seen = new Set();
  for (const [, leg] of legs) {
    if (seen.has(leg)) continue; seen.add(leg);
    const t = leg.t, arrLocal = `${fmtDate(t.arrDate)} ~${fmtTime(t.arrMs, leg.to.tz)}`;
    const air = leg.mode === 'air';
    blocks.push(`<div class="blk full"><h4>${air ? 'Flight' : 'Getting there'}</h4><p><b>${esc(leg.from.short)}${air ? ` (${esc(leg.fa)})` : ''} \u2192 ${esc(leg.to.short)}${air ? ` (${esc(leg.ta)})` : ''}</b> · ${fmtDate(t.depDate)}${air ? ` · about ${Math.round(leg.hours)} h${leg.stops ? ', ' + esc(leg.stops) : ''}` : ` · about ${Math.max(1, Math.round(leg.hours * 2) / 2)} h`}</p>
      <p class="src">Planned around a ~${DEP_HOUR} AM departure, landing about ${esc(arrLocal)} local (estimate). Flight prices and times from the airline.</p>
      <div class="btnrow" style="margin-top:6px">${flightLinks(leg, ad, ch)}</div>
      ${air ? `<div style="margin-top:8px">${airportBlock(leg.fa)}${airportBlock(leg.ta)}</div>` : ''}
      <p style="margin-top:6px"><b>Taxi:</b> ${taxiHtml(leg === day.legOut && day.kind !== 'arrive' ? leg.from : leg.to)}</p></div>`);
    if (air && leg.hours > 8) { flags.push('<span class="tag warn">Long flight</span>'); }
  }
  // davening
  const shuls = (c.shuls || []).filter(s => s.minyanim && Object.keys(s.minyanim).length);
  const longOut = day.legOut && day.legOut.mode === 'air' && day.legOut.hours > 8 && day.kind !== 'arrive' && day.kind !== 'return';
  const lateIn = (day.kind === 'arrive' || day.kind === 'return') && day.legIn && z && day.legIn.t.arrMs > z.tzeis;
  if (isRest) {
    const s = shuls[0] || (c.shuls || [])[0];
    blocks.push(`<div class="blk"><h4>${esc(rname)} davening</h4>${s ? `<p><b>${esc(s.name)}</b> — check the shul\u2019s ${esc(rname)} times. ${src(s)}</p>` : '<p>No shul found in our data — contact the Chabad House below.</p>'}<p class="src">Book a hotel within walking distance of the shul.</p></div>`);
  } else if (shuls.length) {
    const list = shuls.slice(0, 2).map(shulItem).join('');
    blocks.push(`<div class="blk"><h4>Minyan${longOut ? ' (before the flight)' : lateIn ? ' (tomorrow morning — you land late)' : ''}</h4><ul>${list}</ul><p class="src">Times change — confirm with the shul.</p></div>`);
    if (longOut) flags.push('<span class="tag warn">Minyan only before the flight</span>');
  } else {
    flags.push('<span class="tag bad">No minyan found</span>');
    blocks.push(`<div class="blk"><h4>Minyan</h4><p>No shul with weekday minyan times found near ${esc(c.short)} on GoDaven. ${c.chabad && c.chabad.length ? 'Call the Chabad House to ask about a minyan.' : 'A daily minyan may not be available.'}</p></div>`);
  }
  // mikvah
  const mm = c.mikvahMen || [], mw = c.mikvahWomen || [];
  let mk = '';
  if (mm.length) mk += mm.slice(0, 2).map(m => `<p><b>Men:</b> ${esc(m.name)}${m.note ? ' — ' + esc(m.note) : ''} ${tel(m.phone)}<br>${src(m)}</p>`).join('');
  else mk += '<p><b>Men:</b> not found in our sources — ask the local shul or Chabad.</p>';
  if (mw.length) mk += `<details><summary>Women\u2019s mikvah (${mw.length})</summary>${mw.slice(0, 3).map(m => `<p>${esc(m.name)} · ${esc(m.city || '')} ${tel(m.phone)} · by appointment<br>${src(m)}</p>`).join('')}</details>`;
  else mk += '<p><b>Women:</b> not found in our sources.</p>';
  if (longOut) { flags.push('<span class="tag warn">Mikvah before leaving only</span>'); }
  if (!mm.length && !isRest) flags.push('<span class="tag warn">No men\u2019s mikvah found</span>');
  blocks.push(`<div class="blk"><h4>Mikvah</h4>${mk}</div>`);
  // food & places
  if (day.kind !== 'home' || idx === 0) {
    const food = pick(c.kosher, idx), sight = pick(c.sights, idx);
    const L = listingsFor(c, 'restaurant')[0];
    blocks.push(`<div class="blk"><h4>Kosher food</h4>${food ? `<p><b>${esc(food.name)}</b>${food.type ? ` (${esc(food.type)})` : ''}${food.area ? ' · ' + esc(food.area) : ''}${food.supervision ? ' · ' + esc(food.supervision) : ''} ${tel(food.phone)}<br>${src(food)}</p>` : '<p>Not found in our sources — ask the Chabad House.</p>'}${L ? `<p>${esc(L.name)} <span class="tag ok">Verified listing</span></p>` : ''}${isRest || tomorrowRest ? '<p class="src">Order Shabbos meals ahead (Chabad or a caterer).</p>' : ''}</div>`);
    if (!isRest && sight) blocks.push(`<div class="blk"><h4>Place to go</h4><p><b>${esc(sight.name)}</b>${sight.note ? ' — ' + esc(sight.note) : ''}<br>${sight.url ? `<a href="${esc(sight.url)}" target="_blank" rel="noopener">Website</a> · ` : ''}${src(sight)}</p></div>`);
    const ch = (c.chabad || [])[0];
    if (ch && day.kind !== 'home') blocks.push(`<div class="blk"><h4>Chabad / community</h4><p><b>${esc(ch.name)}</b> ${tel(ch.phone)}${ch.url ? ` · <a href="${esc(ch.url)}" target="_blank" rel="noopener">site</a>` : ''}<br>${src(ch)}</p></div>`);
    if (!legs.length && day.kind === 'stay') blocks.push(`<div class="blk"><h4>Taxi</h4><p>${taxiHtml(c)}</p></div>`);
  }
  // zmanim
  const hl = tomorrowRest && !isRest ? 'candle' : isRest && !tomorrowRest ? 'havdalah' : (isRest && tomorrowRest ? 'candle' : null);
  if (tomorrowRest && !isRest) kindTag += `<span class="tag gold">Candle lighting ${fmtTime(z && z.candle, c.tz)}</span>`;
  blocks.push(`<div class="blk full"><h4>Zmanim \u2014 ${esc(c.short)} (${esc(c.tz.split('/').pop().replace(/_/g, ' '))} time)</h4>${zmanimGrid(c, date, hl)}</div>`);
  const sp = sponsorHtml(c); if (sp && day.kind !== 'home') blocks.push(`<div class="full">${sp}</div>`);
  return `<article class="${cls}"><header><span class="dn">Day ${idx + 1}</span><h3>${fmtDate(date)} \u00b7 ${title}</h3><span class="heb">${esc(hd.text)}${hn.length ? ' · ' + esc(hn.join(' · ')) : ''}</span><span class="flags">${kindTag}${flags.join('')}</span></header><div class="body">${blocks.join('')}</div></article>`;
}

/* ---------- costs ---------- */
const COSTS = () => DATA.costs || {};
function cityCost(c) {
  const k = (COSTS().cityMap || {})[c.id];
  const sourced = k && (COSTS().cities || {})[k];
  const reg = (COSTS().regionDefaults || {})[c.region] || {hotel: [120, 250], meal: 25, taxiKm: 2, taxiFlag: 4, airport: [40, 80]};
  const out = {sourced: !!sourced, key: k, notes: []};
  if (sourced && sourced.hotelNightUSD && sourced.hotelNightUSD.low) { out.hotel = [sourced.hotelNightUSD.low, sourced.hotelNightUSD.high || sourced.hotelNightUSD.low]; out.hotelSrc = sourced.hotelNightUSD; }
  else out.hotel = reg.hotel;
  if (sourced && sourced.mealUSD && sourced.mealUSD.value) { out.meal = sourced.mealUSD.value; out.mealSrc = sourced.mealUSD; } else out.meal = reg.meal;
  if (sourced && sourced.taxi && sourced.taxi.airportToCityUSD && sourced.taxi.airportToCityUSD.low) { out.airport = [sourced.taxi.airportToCityUSD.low, sourced.taxi.airportToCityUSD.high || sourced.taxi.airportToCityUSD.low]; out.taxiSrc = sourced.taxi; }
  else out.airport = reg.airport;
  if (sourced && sourced.taxi && sourced.taxi.perKmUSD) { out.ride = (sourced.taxi.flagFallUSD || 0) + sourced.taxi.perKmUSD * 6; }
  else out.ride = reg.taxiFlag + reg.taxiKm * 6;
  return out;
}
function legFare(leg) {
  const f = (COSTS().fares || []).find(x => x.leg === `${leg.fa}-${leg.ta}`);
  if (f && (f.cheapestUSD || f.typicalUSD)) return {lo: f.cheapestUSD || f.typicalUSD, hi: Math.max(f.typicalUSD || 0, f.cheapestUSD || 0), src: f};
  const d = leg.dist, bands = COSTS().fareBands || [[1000, 80, 250], [3000, 150, 400], [6000, 300, 800], [10000, 500, 1300], [99999, 900, 2200]];
  const b = bands.find(x => d <= x[0]) || bands[bands.length - 1];
  return {lo: b[1], hi: b[2], src: null};
}
const money = n => Math.round(n).toLocaleString('en-US');
const range = (a, b) => a === b ? `$${money(a)}` : `$${money(a)}\u2013${money(b)}`;
function costTable(P) {
  const ad = P.inp.adults, ch = P.inp.children, ppl = ad + ch, rooms = Math.max(1, Math.ceil(ppl / 4)), cars = Math.max(1, Math.ceil(ppl / 4));
  const rows = []; let lo = 0, hi = 0;
  const add = (label, a, b, note) => { rows.push(`<tr><td>${label}${note ? `<br><small>${note}</small>` : ''}</td><td class="n">${range(a, b)}</td></tr>`); lo += a; hi += b; };
  P.legs.forEach(leg => {
    if (leg.mode !== 'air') { add(`${esc(leg.from.short)} \u2192 ${esc(leg.to.short)} (car / train)`, 20 * cars, 80 * cars, 'rough estimate'); return; }
    const f = legFare(leg);
    add(`Flight ${esc(leg.fa)} \u2192 ${esc(leg.ta)} \u00d7 ${ppl}`, f.lo * ppl, f.hi * ppl, f.src ? `seen in a public search on ${esc(f.src.checked)} for ${esc(f.src.date)}, per person economy${f.src.airlines ? ' · ' + esc(f.src.airlines) : ''} — not a quote` : 'rough guide by distance — not from a search; check live prices');
    const a = cityCost(leg.from), b = cityCost(leg.to);
    add(`Taxis to/from the airport (${cars} car${cars > 1 ? 's' : ''})`, (a.airport[0] + b.airport[0]) * cars, (a.airport[1] + b.airport[1]) * cars, a.taxiSrc || b.taxiSrc ? 'based on published taxi fares' : 'rough estimate');
  });
  P.nights.forEach(({c, n}) => {
    if (n <= 0) return;
    const k = cityCost(c);
    add(`Hotel in ${esc(c.short)}: ${n} night${n > 1 ? 's' : ''} \u00d7 ${rooms} room${rooms > 1 ? 's' : ''}`, k.hotel[0] * n * rooms, k.hotel[1] * n * rooms, k.hotelSrc ? `${esc(k.hotelSrc.basis || 'published average')} (<a href="${esc(k.hotelSrc.source)}" target="_blank" rel="noopener">source</a>, ${esc(k.hotelSrc.checked || '')})` : 'rough regional estimate — not sourced');
    const food = k.meal * 2 * (ad + ch * 0.6) * (n + 1);
    add(`Kosher food in ${esc(c.short)}: ${n + 1} days`, food * 0.8, food * 1.3, k.mealSrc ? `2 restaurant meals a day; ${esc(k.mealSrc.basis || '')} (<a href="${esc(k.mealSrc.source)}" target="_blank" rel="noopener">source</a>)` : '2 restaurant meals a day — rough regional estimate');
    const ride = k.ride * 2 * n * cars;
    add(`Local taxis in ${esc(c.short)}`, ride * 0.7, ride * 1.4, k.taxiSrc ? 'two ~6 km rides a day at the official tariff' : 'two short rides a day — rough estimate');
  });
  return `<table class="costtable"><thead><tr><th>Item (estimate)</th><th class="n">Range, USD</th></tr></thead><tbody>${rows.join('')}</tbody>
   <tfoot><tr><td>Whole family (${ad} adult${ad > 1 ? 's' : ''}${ch ? `, ${ch} child${ch > 1 ? 'ren' : ''}` : ''})</td><td class="n">${range(lo, hi)}</td></tr><tr><td>Per person</td><td class="n">${range(lo / ppl, hi / ppl)}</td></tr></tfoot></table>
   <p class="src">Estimates only, never a quote. Flight prices and times from the airline; hotel rates change daily. Children are counted at full airfare and 60% of adult food.</p>`;
}

/* ---------- render ---------- */
function render(P) {
  const box = $('#result');
  if (P.error) { box.innerHTML = `<div class="card"><p class="notice warn">${esc(P.error)}</p></div>`; return; }
  const route = [P.home, ...P.stops.map(s => s.c), P.home].map(c => esc(c.short)).join(' \u2192 ');
  const flights = P.legs.filter(l => l.mode === 'air').length;
  const airDays = P.days.filter(d => d.kind === 'air').length;
  const noMin = P.days.filter(d => d.kind !== 'air' && d.city && !(d.city.shuls || []).some(s => s.minyanim && Object.keys(s.minyanim).length)).length;
  const legsHtml = P.legs.map(l => `<div class="leg"><div class="h"><span>${esc(l.from.short)} \u2192 ${esc(l.to.short)}</span><span>${fmtDate(l.t.depDate)}</span></div>
    <div class="sub">${l.mode === 'air' ? `${esc(l.fa)} \u2192 ${esc(l.ta)} · about ${Math.round(l.hours)} h${l.stops ? ' · ' + esc(l.stops) : ''} · lands ${fmtDate(l.t.arrDate)} (estimate)` : 'By car or train'}</div>
    <div class="btnrow">${flightLinks(l, P.inp.adults, P.inp.children)}</div></div>`).join('');
  box.innerHTML = `
  <section class="card summary">
    <p class="route">${route}</p>
    <p class="dates">${fmtDate(P.start, {weekday: 'short', month: 'long', day: 'numeric', year: 'numeric'})} \u2013 ${fmtDate(P.end, {weekday: 'short', month: 'long', day: 'numeric', year: 'numeric'})}</p>
    <div class="stats">
      <div class="stat"><b>${P.days.length}</b><span>days in the plan</span></div>
      <div class="stat"><b>${flights}</b><span>flight${flights === 1 ? '' : 's'}</span></div>
      <div class="stat"><b>${airDays}</b><span>full day${airDays === 1 ? '' : 's'} in the air</span></div>
      <div class="stat"><b>${P.days.filter(d => d.city && restricted(d.date, d.city)).length}</b><span>Shabbos / Yom Tov</span></div>
    </div>
    ${P.notes.map(n => `<p class="notice info">${esc(n)}</p>`).join('')}
    ${airDays ? `<p class="notice warn">${airDays} day${airDays > 1 ? 's are' : ' is'} spent entirely in the air: no minyan or mikvah is possible then. Flying east over the Pacific you lose a calendar day; ask your Rav about davening and the date line.</p>` : ''}
    ${noMin ? `<p class="notice warn">${noMin} day${noMin > 1 ? 's are' : ' is'} in a place where we found no weekday minyan times.</p>` : ''}
    <div class="btnrow noprint" style="margin-top:8px"><button class="btn" id="printbtn" type="button">Print / save as PDF</button><button class="btn ghost" id="sharebtn" type="button">Share plan link</button></div>
  </section>
  <section class="card sec"><h2>Flights &amp; travel</h2><div class="legs">${legsHtml}</div><p class="src" style="margin-top:8px">Live prices open on Google Flights or Kayak with the airports and date filled in; you book with the airline. We never invent flight numbers or prices.</p></section>
  <section class="card sec"><h2>Estimated cost</h2>${costTable(P)}</section>
  <section class="sec"><h2 style="margin:8px 0">Day by day</h2><div class="days">${P.days.map((d, i) => dayCard(d, i, P)).join('')}</div></section>`;
  $('#printbtn').onclick = () => window.print();
  $('#sharebtn').onclick = async () => {
    const url = location.href;
    try { if (navigator.share) { await navigator.share({title: 'Trip plan', url}); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); $('#sharebtn').textContent = 'Link copied'; } catch { prompt('Copy this link:', url); }
  };
}

/* ---------- form ---------- */
function cityOptions(sel) {
  const groups = {};
  DATA.cities.forEach(c => (groups[c.region] = groups[c.region] || []).push(c));
  return Object.entries(groups).map(([r, cs]) => `<optgroup label="${esc(r)}">${cs.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}${c.country !== 'USA' && c.country !== c.name ? ', ' + esc(c.country) : ''}</option>`).join('')}</optgroup>`).join('');
}
function stopRow(id, nights) {
  const div = document.createElement('div'); div.className = 'stop';
  div.innerHTML = `<select aria-label="Stop city">${cityOptions(id)}</select><input type="number" min="0" max="30" inputmode="numeric" placeholder="auto" value="${nights || ''}" aria-label="Nights (blank = auto)"><button type="button" class="iconbtn" aria-label="Remove stop">\u00d7</button>`;
  div.querySelector('button').onclick = () => { if ($('#stops').children.length > 1) div.remove(); };
  return div;
}
const SAMPLE = {home: 'brooklyn-boro-park', stops: [{id: 'melbourne'}, {id: 'sydney'}], days: 14, start: '2026-12-20', adults: 2, children: 3};
function readForm() {
  return {home: $('#home').value, stops: [...$('#stops').children].map(r => ({id: r.querySelector('select').value, nights: +r.querySelector('input').value || 0})),
    days: +$('#days').value || 14, start: $('#start').value || SAMPLE.start, adults: Math.max(1, +$('#adults').value || 1), children: Math.max(0, +$('#children').value || 0)};
}
function fillForm(s) {
  $('#home').innerHTML = cityOptions(s.home);
  $('#stops').innerHTML = ''; s.stops.forEach(x => $('#stops').appendChild(stopRow(x.id, x.nights)));
  $('#days').value = s.days; $('#start').value = s.start; $('#adults').value = s.adults; $('#children').value = s.children;
}
function toQuery(s) { return `?home=${s.home}&stops=${s.stops.map(x => x.id + (x.nights ? '.' + x.nights : '')).join(',')}&days=${s.days}&start=${s.start}&ad=${s.adults}&ch=${s.children}`; }
function fromQuery() {
  const q = new URLSearchParams(location.search); if (!q.get('home')) return null;
  const s = {home: q.get('home'), stops: (q.get('stops') || '').split(',').filter(Boolean).map(x => { const [id, n] = x.split('.'); return {id, nights: +n || 0}; }),
    days: +q.get('days') || 14, start: /^\d{4}-\d\d-\d\d$/.test(q.get('start') || '') ? q.get('start') : SAMPLE.start, adults: +q.get('ad') || 2, children: +q.get('ch') || 0};
  if (!CITY[s.home] || !s.stops.every(x => CITY[x.id])) return null;
  return s;
}
function build(push = true) {
  const s = readForm();
  if (push) history.replaceState(null, '', toQuery(s) + location.hash);
  render(plan(s));
  $('#sampletag').hidden = !(s.home === SAMPLE.home && s.start === SAMPLE.start && s.days === SAMPLE.days && s.stops.map(x => x.id).join() === 'melbourne,sydney');
}

/* ---------- directory ---------- */
function cityDetails(c) {
  const shuls = (c.shuls || []).map(shulItem).join('');
  const mm = (c.mikvahMen || []).map(m => `<li><b>${esc(m.name)}</b>${m.address ? ' · ' + esc(m.address) : ''} ${tel(m.phone)}${m.note ? '<br>' + esc(m.note) : ''}<br>${src(m)}</li>`).join('');
  const mw = (c.mikvahWomen || []).map(m => `<li>${esc(m.name)} · ${esc(m.city || '')} ${tel(m.phone)} · by appointment<br>${src(m)}</li>`).join('');
  const food = (c.kosher || []).map(f => `<li><b>${esc(f.name)}</b>${f.type ? ` (${esc(f.type)})` : ''}${f.area ? ' · ' + esc(f.area) : ''}${f.supervision ? ' · ' + esc(f.supervision) : ''} ${tel(f.phone)}<br>${src(f)}</li>`).join('');
  const chabad = (c.chabad || []).map(f => `<li><b>${esc(f.name)}</b> ${tel(f.phone)}${f.url ? ` · <a href="${esc(f.url)}" target="_blank" rel="noopener">site</a>` : ''}<br>${src(f)}</li>`).join('');
  const sights = (c.sights || []).map(f => `<li><b>${esc(f.name)}</b>${f.note ? ' — ' + esc(f.note) : ''}<br>${src(f)}</li>`).join('');
  const lst = listingsFor(c).map(l => `<li><b>${esc(l.name)}</b> (${esc(l.type)}) ${tel(l.phone)} <span class="tag ok">Verified ${esc(l.verified_at || '')}</span></li>`).join('');
  const nf = '<p class="src">Not found in our sources.</p>';
  return `<details class="city" data-q="${esc((c.name + ' ' + c.country + ' ' + (c.alias || '')).toLowerCase())}"><summary>${esc(c.name)} <span class="cn">${esc(c.country)}</span>${c.flags.minyan ? '' : '<span class="tag bad">No minyan times found</span>'}${c.flags.mikvahMen ? '' : '<span class="tag warn">No men\u2019s mikvah found</span>'}${c.flags.mikvahWomen ? '' : '<span class="tag warn">No women\u2019s mikvah found</span>'}</summary>
  <div class="in">${sponsorHtml(c)}
    <div class="blk"><h4>Airports</h4><p>${(c.airports || []).map(esc).join(', ') || 'none nearby in our list'}</p></div>
    <div class="blk"><h4>Shuls &amp; minyanim</h4>${shuls ? `<ul>${shuls}</ul><p class="src">Times change — confirm with the shul.</p>` : nf}</div>
    <div class="blk"><h4>Men\u2019s mikvah</h4>${mm ? `<ul>${mm}</ul>` : nf}</div>
    <div class="blk"><h4>Women\u2019s mikvah</h4>${mw ? `<ul>${mw}</ul>` : nf}</div>
    <div class="blk"><h4>Kosher food</h4>${food ? `<ul>${food}</ul>` : nf}</div>
    <div class="blk"><h4>Chabad / community</h4>${chabad ? `<ul>${chabad}</ul>` : nf}</div>
    ${sights ? `<div class="blk"><h4>Places to go</h4><ul>${sights}</ul></div>` : ''}
    ${lst ? `<div class="blk"><h4>Listed by the business</h4><ul>${lst}</ul></div>` : ''}
    <div class="blk"><h4>Taxi</h4><p>${taxiHtml(c)}</p></div>
    ${c.notes ? `<p class="src">${esc(c.notes)}</p>` : ''}
    <div class="btnrow"><button class="btn small" type="button" data-plan="${c.id}">Plan a trip here</button></div>
  </div></details>`;
}
function renderDirectory() {
  const q = ($('#dirq').value || '').trim().toLowerCase(), f = $('#dirf').value;
  const groups = {};
  DATA.cities.filter(c => (!q || (c.name + ' ' + c.country + ' ' + (c.alias || '')).toLowerCase().includes(q)) && (f === 'all' || (f === 'gaps' && (!c.flags.minyan || !c.flags.mikvahMen)) || (f === 'full' && c.flags.minyan && c.flags.mikvahMen)))
    .forEach(c => (groups[c.region] = groups[c.region] || []).push(c));
  $('#dirlist').innerHTML = Object.entries(groups).map(([r, cs]) => `<h3 style="margin:16px 0 8px">${esc(r)} <span class="src">(${cs.length})</span></h3><div class="citygrid">${cs.map(cityDetails).join('')}</div>`).join('') || '<p>No city matches.</p>';
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const r = await fetch('data/world-cities.json', {cache: 'no-cache'});
    DATA = await r.json();
  } catch (e) { $('#result').innerHTML = '<p class="notice warn">Couldn\u2019t load the city data. Please refresh.</p>'; return; }
  DATA.cities.forEach(c => { CITY[c.id] = c; c.short = c.short || c.name.replace(/\s*\(.*\)$/, ''); });
  $('#citycount').textContent = DATA.cities.length;
  try { if (window.WorldListings) EXTRA = await window.WorldListings.load(); } catch { EXTRA = {listings: [], sponsors: []}; }
  fillForm(fromQuery() || SAMPLE);
  $('#addstop').onclick = () => $('#stops').appendChild(stopRow('london-stamford-hill'));
  $('#planform').onsubmit = e => { e.preventDefault(); build(); $('#result').scrollIntoView({behavior: 'smooth'}); };
  $('#today').onclick = () => { $('#start').value = todayIn(); build(); };
  $('#sample').onclick = () => { fillForm(SAMPLE); build(); };
  build(!!location.search);
  $('#dirq').oninput = renderDirectory; $('#dirf').onchange = renderDirectory;
  $('#dirlist').onclick = e => {
    const b = e.target.closest('[data-plan]'); if (!b) return;
    const s = readForm(); s.stops = [{id: b.dataset.plan}]; fillForm(s); showTab('plan'); build(); window.scrollTo({top: 0, behavior: 'smooth'});
  };
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  if (location.hash === '#cities') showTab('cities');
}
function showTab(t) {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === t)));
  $('#planner').hidden = t !== 'plan'; $('#directory').hidden = t !== 'cities';
  if (t === 'cities' && !$('#dirlist').innerHTML) renderDirectory();
  history.replaceState(null, '', location.search + (t === 'cities' ? '#cities' : ''));
}
window.WorldPlanner = {plan, zmanim, heb, yomTov, timing, conflict, makeLeg, get CITY() { return CITY; }};
document.addEventListener('DOMContentLoaded', boot);
})();
