/* Extra features: day planner, share my trip (picture + printable page), rainy-day check (Open-Meteo forecast),
   Davening & Mikvah (shuls with minyan times, mikvaos, zmanim worked out in the browser) and its map layer.
   Uses window.OF from app.js. Nothing here tracks anyone; the only outside calls are the Open-Meteo forecast and
   the map tiles the site already uses. */
(function () {
  function boot() {
    const OF = window.OF; if (!OF) return;
    const { P, ORIG, ORIG_NAME, state, saved, tm, fmt, esc, T, YI, host, tel, secColor, hoursOn, dayISO, dayName, dayChoices, TODAY, isoOf, dateOf } = OF;
    const $ = id => document.getElementById(id);
    const LS = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
    // where each community is, for the forecast, zmanim and drive estimates
    const ORLL = { monsey: [41.1112, -74.0685], monroe: [41.3403, -74.1679], newsquare: [41.1396, -74.0310], williamsburg: [40.7081, -73.9571], boropark: [40.6340, -73.9933], flatbush: [40.6200, -73.9600], crownheights: [40.6681, -73.9422], queens: [40.7230, -73.8231], fivetowns: [40.6280, -73.7350], lakewood: [40.0960, -74.2177], passaic: [40.8568, -74.1285] };
    const ORIGIN_AREA = { monsey: 'Monsey', monroe: 'Monroe / Kiryas Joel', newsquare: 'New Square', williamsburg: 'Williamsburg', boropark: 'Boro Park', flatbush: 'Flatbush', crownheights: 'Crown Heights', queens: 'Queens (Kew Gardens Hills)', fivetowns: 'Five Towns', lakewood: 'Lakewood', passaic: 'Passaic' };
    const rad = d => d * Math.PI / 180;
    function km(a, b) { const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); }
    const miles = k => k * 0.621371;
    // a rough drive time from the straight-line distance (roads are about 1.3× longer; slower in town)
    function estDrive(a, b) { const r = km(a, b) * 1.3; const v = r < 8 ? 28 : r < 30 ? 45 : r < 80 ? 65 : 85; return Math.max(5, Math.round((r / v * 60 + 4) / 5) * 5); }
    const clock = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + ':' + ('0' + mm).slice(-2) + ' ' + (h < 12 ? 'AM' : 'PM'); };
    const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
    function rawHours(p, iso) {
      const wh = p.winterHours; if (!wh || wh.status === 'unconfirmed') return null;
      if (wh.status === 'closed_season') return 'closed';
      let v = wh.dates && wh.dates[iso]; if (v == null && wh.week) v = wh.week[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dateOf(iso).getDay()]];
      if (v == null) return null; if (/^closed$/i.test(v)) return 'closed';
      const rs = v.split(',').map(r => r.split('-').map(toMin)).filter(r => r.length === 2 && !isNaN(r[0]) && !isNaN(r[1]));
      if (!rs.length) return null;
      let o = rs[0][0], c = rs[rs.length - 1][1]; if (c <= o) c += 1440; return [o, c];
    }
    const dayOpts = sel => dayChoices().map(d => `<option value="${d}"${d === sel ? ' selected' : ''}>${esc(dayName(d))}</option>`).join('');
    const originOpts = sel => ORIG.map(o => `<option value="${esc(o.k)}"${o.k === sel ? ' selected' : ''}>${esc(T(o.n))}</option>`).join('');

    // ----- weather (Open-Meteo, free, no key). Any failure: say nothing. -----
    const wxCache = {};
    async function forecast(ll, iso) {
      const k = ll.join(',') + iso;
      if (k in wxCache) return wxCache[k];
      wxCache[k] = null;
      try {
        const u = `https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&daily=weather_code,precipitation_probability_max,precipitation_sum,snowfall_sum,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America%2FNew_York&start_date=${iso}&end_date=${iso}`;
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(u, { signal: ctl.signal }); clearTimeout(to);
        if (!r.ok) return null;
        const d = (await r.json()).daily; if (!d || !d.time || !d.time.length || d.weather_code[0] == null) return null;
        const code = d.weather_code[0], prob = d.precipitation_probability_max[0], snowCm = d.snowfall_sum ? d.snowfall_sum[0] : 0;
        const snow = (code >= 71 && code <= 77) || code === 85 || code === 86 || snowCm > 0.5;
        const wet = (code >= 51 && (prob == null || prob >= 40)) || (prob != null && prob >= 60);
        return (wxCache[k] = { code, prob, wet, kind: snow ? 'snow' : 'rain', hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]) });
      } catch (e) { return null; }
    }
    const wxWord = w => w.kind === 'snow' ? T('Snow') : T('Rain');
    const indoorFor = (origin, iso, n) => P.filter(p => p.k === 'local' && p.io === 'in' && tm(p, origin) != null && hoursOn(p, iso).s !== 'closed' && !(p.closedSeason))
      .sort((a, b) => tm(a, origin) - tm(b, origin)).filter((p, i, a) => a.findIndex(x => x.n === p.n) === i).slice(0, n);

    // ----- rainy-day button on the home page -----
    async function rainCheck(manual) {
      const box = $('rainbox'), btn = $('rainbtn'); if (!box) return;
      const origin = state.origin, iso = dayISO(), ll = ORLL[origin];
      if (!ll) { box.innerHTML = ''; return; }
      if (manual) box.innerHTML = `<div class="rain dry"><p>${esc(T('Checking the forecast…'))}</p></div>`;
      const w = await forecast(ll, iso);
      if (state.origin !== origin) return;
      if (!w) { box.innerHTML = ''; if (manual && btn) btn.hidden = true; return; }   // forecast failed: hide quietly
      const when = iso === TODAY ? T('today') : dayName(iso), where = T(ORIG_NAME[origin] || '');
      if (w.wet) {
        const list = indoorFor(origin, iso, 10);
        box.innerHTML = `<section class="rain wet"><div class="rain-h"><span class="rain-i" aria-hidden="true">${w.kind === 'snow' ? '❄' : '☔'}</span><div><h2>${esc(T('{wx} is forecast {when} in {where}', { wx: wxWord(w), when, where }))}</h2><p>${esc(T('{p}% chance · high {hi}°, low {lo}°. Here are indoor places close by.', { p: w.prob == null ? '—' : w.prob, hi: w.hi, lo: w.lo }))}</p></div></div>
          <div class="rail">${list.map(OF.mini).join('')}</div>
          <p class="rain-f"><button class="btn ghost" type="button" data-rainall="1">${esc(T('See all indoor places'))}</button> <span class="hint">${esc(T('Live forecast from Open-Meteo.'))}</span></p></section>`;
      } else if (manual) {
        box.innerHTML = `<div class="rain dry"><p><b>${esc(T('No rain or snow is forecast {when} in {where}.', { when, where }))}</b> ${esc(T('High {hi}°, low {lo}°. Every place is fair game!', { hi: w.hi, lo: w.lo }))}</p><p class="hint">${esc(T('Live forecast from Open-Meteo.'))}</p></div>`;
      } else box.innerHTML = '';
      if (manual) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function setupRain() {
      const hq = $('heroquick');
      if (hq && !$('rainbtn')) hq.insertAdjacentHTML('beforeend', `<button class="chip rainchip" type="button" id="rainbtn">☔ ${esc(T('Rainy day?'))}</button>`);
      const box = $('rainbox');
      if (box && !box.dataset.wired) {
        box.dataset.wired = '1';
        box.addEventListener('click', e => {
          if (e.target.closest('[data-rainall]')) { OF.applyQuick('rain'); OF.go('search'); return; }
          OF.handleCommon(e);
        });
      }
    }
    document.addEventListener('click', e => { if (e.target.closest('#rainbtn')) rainCheck(true); });
    const herofrom = $('herofrom'); if (herofrom) herofrom.addEventListener('change', () => setTimeout(() => rainCheck(false), 50));

    // ----- day planner (My Trips) -----
    const PL = 'of-plan-v1';
    const plan = Object.assign({ picks: [], start: '10:00', stay: {}, day: '', from: '' }, LS.get(PL, {}));
    const savePlan = () => LS.set(PL, plan);
    const STAY = { 'Zoos & Aquariums': 180, 'Museums': 150, 'Outdoor Fun': 150, 'Water Fun': 180, 'Parks & Farms': 120, 'Malls': 120, 'Indoor Fun': 120 };
    const stayOf = p => plan.stay[p.key] || (p.snow ? 180 : STAY[p.s] || 120);
    const placeLL = p => p.ll || null;
    function legHome(p, origin) {   // home <-> place: the guide's drive time when there is one
      const g = tm(p, origin); if (g != null) return { m: g, est: false };
      if (p.ll && ORLL[origin]) return { m: estDrive(ORLL[origin], p.ll), est: true };
      return { m: null, est: true };
    }
    function legBetween(a, b) { if (a.ll && b.ll) return { m: estDrive(a.ll, b.ll), est: true }; return { m: null, est: true }; }
    function simulate(order, origin, iso, start) {
      let t = toMin(start), drive = 0, bad = 0; const steps = [];
      steps.push({ type: 'leave', t });
      order.forEach((p, i) => {
        const leg = i === 0 ? legHome(p, origin) : legBetween(order[i - 1], p);
        steps.push({ type: 'drive', m: leg.m, est: leg.est });
        if (leg.m != null) { t += leg.m; drive += leg.m; } else bad += 1;
        const h = rawHours(p, iso); let arrive = t, note = null, warn = false;
        if (h === 'closed') { note = T('Closed that day'); warn = true; bad += 3; }
        else if (h) {
          if (t < h[0]) { note = T('Opens at {t}', { t: clock(h[0]) }); t = h[0]; }
          if (t + stayOf(p) > h[1]) { note = T('Closes at {t}', { t: clock(h[1]) }); warn = true; bad += 1; }
        }
        const s = stayOf(p);
        steps.push({ type: 'stop', p, arrive, from: t, to: t + s, note, warn, known: !!h });
        t += s;
      });
      const back = legHome(order[order.length - 1], origin);
      steps.push({ type: 'drive', m: back.m, est: back.est });
      if (back.m != null) { t += back.m; drive += back.m; }
      steps.push({ type: 'home', t });
      return { steps, drive, cost: drive + bad * 90, end: t };
    }
    function perms(a) { if (a.length <= 1) return [a]; const out = []; a.forEach((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).forEach(r => out.push([x].concat(r)))); return out; }
    function bestPlan() {
      const picks = plan.picks.map(k => P.find(p => p.key === k)).filter(Boolean);
      if (picks.length < 2) return null;
      const origin = plan.from || state.origin, iso = plan.day && plan.day >= TODAY ? plan.day : dayISO();
      let best = null;
      perms(picks).forEach(o => { const r = simulate(o, origin, iso, plan.start || '10:00'); if (!best || r.cost < best.cost) best = Object.assign(r, { order: o }); });
      return Object.assign(best, { origin, iso });
    }
    function driveTxt(s) { if (s.m == null) return T('Drive time unknown'); return s.est ? T('about {t} drive (estimate from distance)', { t: fmt(s.m) }) : T('{t} drive (guide drive time)', { t: fmt(s.m) }); }
    function routeUrl(r) {
      const o = (ORIG_NAME[r.origin] || '').replace(/\s*\(.*\)/, '');
      const at = p => p.ll ? p.ll.join(',') : ((p.locs && p.locs[0]) || p.a || p.n);
      return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(o) + '&destination=' + encodeURIComponent(o) + '&waypoints=' + encodeURIComponent(r.order.map(at).join('|'));
    }
    function planHTML(r) {
      const rows = r.steps.map(s => {
        if (s.type === 'leave') return `<li class="tl-home"><b dir="ltr">${clock(s.t)}</b> ${esc(T('Leave {where}', { where: T(ORIG_NAME[r.origin] || '') }))}</li>`;
        if (s.type === 'home') return `<li class="tl-home"><b dir="ltr">${clock(s.t)}</b> ${esc(T('Back home in {where}', { where: T(ORIG_NAME[r.origin] || '') }))}</li>`;
        if (s.type === 'drive') return `<li class="tl-drive"><span aria-hidden="true">🚗</span> ${esc(driveTxt(s))}</li>`;
        const p = s.p, stays = [60, 90, 120, 150, 180, 240, 300];
        return `<li class="tl-stop${s.warn ? ' warn' : ''}"><div class="tl-time"><b dir="ltr">${clock(s.from)} – ${clock(s.to)}</b></div>
          <div class="tl-body"><button class="tl-name" type="button" data-open="${p.i}">${esc(p.n)}</button><span class="tl-sec" style="--c:${secColor(p.s)}">${esc(T(p.s))}</span>
          ${s.note ? `<span class="tl-note">${esc(s.note)}</span>` : ''}${!s.known ? `<span class="tl-note unk">${esc(T('Hours not confirmed, call first'))}</span>` : ''}
          <label class="tl-stay">${esc(T('Stay'))} <select data-stay="${OF.esc(p.key)}">${stays.map(m => `<option value="${m}"${m === stayOf(p) ? ' selected' : ''}>${esc(fmt(m))}</option>`).join('')}</select></label></div></li>`;
      }).join('');
      return `<ol class="timeline">${rows}</ol>
        <p class="pl-sum">${esc(T('Total driving: about {t}.', { t: fmt(r.drive) }))} ${esc(T('Drive times between stops are estimates from the distance; check Waze or Google Maps on the day.'))}</p>
        <div id="pl-rain"></div>
        <div class="pl-actions"><button class="btn" type="button" data-share="plan">${esc(T('Share this plan'))}</button><button class="btn ghost" type="button" data-print="plan">${esc(T('Printable page (PDF)'))}</button><a class="btn ghost" href="${esc(routeUrl(r))}" target="_blank" rel="noopener">${esc(T('Route in Google Maps'))}</a></div>`;
    }
    let lastPlan = null;
    function renderPlanner() {
      const box = $('planner'); if (!box) return;
      const list = P.filter(p => saved.has(p.key));
      plan.picks = plan.picks.filter(k => saved.has(k));
      if (!plan.picks.length && list.length >= 2) { plan.picks = list.slice().sort((a, b) => (tm(a) ?? 1e6) - (tm(b) ?? 1e6)).slice(0, Math.min(3, list.length)).map(p => p.key); }
      if (list.length < 2) {
        box.innerHTML = `<section class="planner"><h2>${esc(T('Plan my day'))}</h2><p class="hint">${esc(T('Save at least 2 places with the star, then come back here to put them in order with drive times.'))}</p></section>`;
        lastPlan = null; return;
      }
      const iso = plan.day && plan.day >= TODAY ? plan.day : dayISO();
      const full = plan.picks.length >= 3;
      box.innerHTML = `<section class="planner"><div class="pl-head"><h2>${esc(T('Plan my day'))}</h2><p class="hint">${esc(T('Pick 2 or 3 saved places. They go in the order with the least driving, with drive times between stops.'))}</p></div>
        <div class="pl-picks" role="group" aria-label="${esc(T('Places for the day'))}">${list.map(p => { const on = plan.picks.includes(p.key); return `<label class="pl-pick${on ? ' on' : ''}"><input type="checkbox" data-pick="${esc(p.key)}"${on ? ' checked' : ''}${!on && full ? ' disabled' : ''}> <span>${esc(p.n)}</span></label>`; }).join('')}</div>
        <div class="pl-row"><label>${esc(T('Coming from'))} <select id="pl-from">${originOpts(plan.from || state.origin)}</select></label>
          <label>${esc(T('Day'))} <select id="pl-day">${dayOpts(iso)}</select></label>
          <label>${esc(T('Leave at'))} <input type="time" id="pl-start" value="${esc(plan.start || '10:00')}" step="900"></label></div>
        <div id="pl-out"></div></section>`;
      const r = bestPlan(); lastPlan = r;
      $('pl-out').innerHTML = r ? planHTML(r) : `<p class="hint">${esc(T('Pick at least 2 places.'))}</p>`;
      if (r && ORLL[r.origin]) forecast(ORLL[r.origin], r.iso).then(w => { const b = $('pl-rain'); if (b && w && w.wet && lastPlan === r) b.innerHTML = `<p class="pl-wx">${w.kind === 'snow' ? '❄' : '☔'} ${esc(T('{wx} is forecast that day ({p}% chance). Indoor places may be a better plan.', { wx: wxWord(w), p: w.prob == null ? '—' : w.prob }))} <button class="linkbtn" type="button" data-rainall="1">${esc(T('See indoor places'))}</button></p>`; });
    }
    function wirePlanner() {
      const box = $('planner'); if (!box || box.dataset.wired) return; box.dataset.wired = '1';
      box.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.pick) { const k = t.dataset.pick; if (t.checked) { if (plan.picks.length < 3) plan.picks.push(k); } else plan.picks = plan.picks.filter(x => x !== k); }
        else if (t.id === 'pl-from') plan.from = t.value;
        else if (t.id === 'pl-day') plan.day = t.value;
        else if (t.id === 'pl-start') plan.start = t.value || '10:00';
        else if (t.dataset.stay) plan.stay[t.dataset.stay] = +t.value;
        savePlan(); renderPlanner();
      });
      box.addEventListener('click', e => {
        if (e.target.closest('[data-rainall]')) { OF.applyQuick('rain'); OF.go('search'); return; }
        const o = e.target.closest('[data-open]'); if (o) { OF.openPlace(+o.dataset.open); }
      });
    }
    // ----- share my trip: a picture (canvas → PNG) and a printable page -----
    function shareData(kind) {
      const title = kind === 'plan' ? T('Our day plan') : T(OF.SEASON.copyTitle || 'My Chol Hamoed list');
      if (kind === 'plan' && lastPlan) {
        const r = lastPlan;
        const sub = dayName(r.iso) + ' · ' + T('from {where}', { where: T(ORIG_NAME[r.origin] || '') });
        const items = r.steps.map(s => {
          if (s.type === 'leave') return { kind: 'line', text: clock(s.t) + '  ' + T('Leave {where}', { where: T(ORIG_NAME[r.origin] || '') }) };
          if (s.type === 'home') return { kind: 'line', text: clock(s.t) + '  ' + T('Back home in {where}', { where: T(ORIG_NAME[r.origin] || '') }) };
          if (s.type === 'drive') return { kind: 'drive', text: driveTxt(s) };
          const p = s.p; return { kind: 'stop', time: clock(s.from) + ' – ' + clock(s.to), name: p.n, lines: [(p.locs ? p.locs[0] : p.a), p.p[0], s.note, s.known ? '' : T('Hours not confirmed, call first')].filter(Boolean) };
        });
        return { title, sub, items, foot: T('Drive times are estimates. Call each place before you go.') };
      }
      const iso = dayISO();
      const list = P.filter(p => saved.has(p.key)).sort((a, b) => (tm(a) ?? 1e6) - (tm(b) ?? 1e6));
      const items = list.map(p => { const h = hoursOn(p, iso); const m = tm(p);
        return { kind: 'stop', name: p.n, lines: [T(p.s) + (m != null ? ' · ' + T('{t} from {where}', { t: fmt(m), where: T(ORIG_NAME[state.origin] || '') }) : ''), (p.locs ? p.locs[0] : p.a), p.p[0], h.s === 'open' ? T('Open {when}', { when: iso === TODAY ? T('today') : dayName(iso) }) + ' · ' + h.text : h.s === 'closed' ? T('Closed that day') : T('Hours not confirmed, call first')].filter(Boolean) }; });
      return { title, sub: list.length + ' ' + T('places'), items, foot: T('Call each place before you go.') };
    }
    function wrap(ctx, text, maxW) { const words = String(text).split(/\s+/); const lines = []; let cur = ''; words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines; }
    async function drawPNG(d) {
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
      const W = 1080, PAD = 64, rtl = YI, F = YI ? 'Heebo, Arial, sans-serif' : '"Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
      const c = document.createElement('canvas'), ctx = c.getContext('2d');
      const x0 = rtl ? W - PAD : PAD, tw = W - PAD * 2;
      const ops = []; let y = 0;
      const text = (s, font, color, gap) => { ctx.font = font; wrap(ctx, s, tw - 40).forEach(l => { y += gap; ops.push({ s: l, font, color, y, ind: 40 }); }); };
      y = 150;
      ctx.font = `700 54px ${F}`; const tl = wrap(ctx, d.title, tw); const titleOps = tl.map((l, i) => ({ s: l, y: 110 + i * 64 }));
      y = 110 + (tl.length - 1) * 64 + 56;
      const subY = y; y += 40;
      d.items.forEach((it, i) => {
        if (it.kind === 'drive') { text('🚗  ' + it.text, `500 30px ${F}`, '#66716a', 46); return; }
        if (it.kind === 'line') { y += 20; text(it.text, `700 32px ${F}`, '#0f7a55', 44); return; }
        y += 34;
        if (it.time) text(it.time, `700 30px ${F}`, '#0f7a55', 40);
        text(it.name, `700 38px ${F}`, '#101814', 48);
        it.lines.forEach(l => text(l, `400 28px ${F}`, '#3b4540', 38));
      });
      y += 70; const footY = y; y += 60;
      c.width = W; c.height = Math.max(y, 700);
      const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#0ea5e9'); g.addColorStop(1, '#10b981');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, c.height); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 18);
      ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#101814'; ctx.font = `700 54px ${F}`; titleOps.forEach(o => ctx.fillText(o.s, x0, o.y));
      ctx.fillStyle = '#66716a'; ctx.font = `500 30px ${F}`; ctx.fillText(d.sub, x0, subY);
      ops.forEach(o => { ctx.fillStyle = o.color; ctx.font = o.font; ctx.fillText(o.s, rtl ? x0 - o.ind + 40 : x0 + o.ind - 40, o.y); });
      ctx.fillStyle = '#e5e9e7'; ctx.fillRect(PAD, footY - 40, W - PAD * 2, 2);
      ctx.fillStyle = '#66716a'; ctx.font = `400 26px ${F}`; ctx.fillText(d.foot, x0, footY);
      ctx.fillText(T('Outing Finder') + ' · ' + location.host + location.pathname.replace(/index\.html$/, ''), x0, footY + 40);
      return new Promise(res => c.toBlob(res, 'image/png'));
    }
    async function shareTrip(kind, btn) {
      const d = shareData(kind); if (!d.items.length) return;
      const old = btn ? btn.textContent : '';
      if (btn) btn.textContent = T('Making the picture…');
      try {
        const blob = await drawPNG(d);
        const name = (kind === 'plan' ? 'day-plan' : 'my-trip') + '.png';
        const file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: d.title }); } catch (e) { /* closed the share sheet */ }
        } else {
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
          if (btn) { btn.textContent = T('Saved the picture'); setTimeout(() => { btn.textContent = old; }, 2200); return; }
        }
      } catch (e) { if (btn) { btn.textContent = T('Couldn\u2019t make the picture here'); setTimeout(() => { btn.textContent = old; }, 2500); return; } }
      if (btn) btn.textContent = old;
    }
    function printTrip(kind) {
      const d = shareData(kind); if (!d.items.length) return;
      const pv = $('printview'); if (!pv) return;
      pv.innerHTML = `<h1>${esc(d.title)}</h1><p class="pv-sub">${esc(d.sub)}</p>` + d.items.map(it => it.kind === 'drive' ? `<p class="pv-drive">🚗 ${esc(it.text)}</p>` : it.kind === 'line' ? `<p class="pv-line">${esc(it.text)}</p>`
        : `<div class="pv-stop">${it.time ? `<p class="pv-time">${esc(it.time)}</p>` : ''}<h2>${esc(it.name)}</h2>${it.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`).join('') + `<p class="pv-foot">${esc(d.foot)}<br>${esc(location.host + location.pathname.replace(/index\.html$/, ''))}</p>`;
      document.body.classList.add('printing');
      const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60);
    }
    document.addEventListener('click', e => {
      const s = e.target.closest('[data-share]'); if (s) { shareTrip(s.dataset.share, s); return; }
      const pr = e.target.closest('[data-print]'); if (pr) printTrip(pr.dataset.print);
    });
    window.onTripsView = function () {
      wirePlanner(); renderPlanner();
      const has = saved.size > 0; const sb = $('sharebar'); if (sb) sb.hidden = !has;
    };

    // ----- Davening & Mikvah -----
    let DV = null, dvLoading = null;
    function loadDaven() {
      if (!dvLoading) dvLoading = fetch('data/daven.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(j => { DV = j; DV.items.forEach((x, i) => { x.i = i; }); return DV; }).catch(() => { dvLoading = null; return null; });
      return dvLoading;
    }
    const dv = { area: '', day: '', tab: 'shul', q: '' };
    const KIND = { shul: 'Shuls', mikvah_men: 'Men\u2019s mikvaos', mikvah_women: 'Women\u2019s mikvaos' };
    // zmanim: sunrise/sunset and sun-angle times (NOAA-style), worked out right here in the browser
    function sunAt(iso, lat, lng, angle) {   // angle: degrees below the horizon (0.833 = sunrise/sunset)
      const date = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5 + 2440587.5;
      const n = Math.ceil(date - 2451545.0 + 0.0008);
      const Js = n - lng / 360;
      const M = (357.5291 + 0.98560028 * Js) % 360, Mr = rad(M);
      const C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
      const lam = rad((M + C + 180 + 102.9372) % 360);
      const Jt = 2451545.0 + Js + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lam);
      const dec = Math.asin(Math.sin(lam) * Math.sin(rad(23.4397)));
      const cosw = (Math.sin(rad(-angle)) - Math.sin(rad(lat)) * Math.sin(dec)) / (Math.cos(rad(lat)) * Math.cos(dec));
      const toMs = J => (J - 2440587.5) * 864e5;
      if (cosw < -1 || cosw > 1) return { noon: toMs(Jt) };
      const w = Math.acos(cosw) * 180 / Math.PI;
      return { rise: toMs(Jt - w / 360), set: toMs(Jt + w / 360), noon: toMs(Jt) };
    }
    function zmanim(iso, ll, tz) {
      const s = sunAt(iso, ll[0], ll[1], 0.833), a = sunAt(iso, ll[0], ll[1], 16.1), my = sunAt(iso, ll[0], ll[1], 11.5), tz8 = sunAt(iso, ll[0], ll[1], 8.5);
      if (!s.rise) return null;
      const sh = (s.set - s.rise) / 12, mga0 = s.rise - 72 * 6e4, mgaH = (s.set + 72 * 6e4 - mga0) / 12;
      return [
        ['Alos Hashachar', 'עלות השחר', a.rise, '16.1°'], ['Misheyakir', 'משיכיר', my.rise, '11.5°'], ['Sunrise (Netz)', 'הנץ החמה', s.rise, ''],
        ['Latest Shema (Magen Avraham)', 'סוף זמן ק״ש מג״א', mga0 + 3 * mgaH, ''], ['Latest Shema (Gra)', 'סוף זמן ק״ש גר״א', s.rise + 3 * sh, ''],
        ['Latest Shacharis (Gra)', 'סוף זמן תפילה גר״א', s.rise + 4 * sh, ''], ['Chatzos', 'חצות', s.rise + 6 * sh, ''],
        ['Mincha Gedola', 'מנחה גדולה', s.rise + 6.5 * sh, ''], ['Mincha Ketana', 'מנחה קטנה', s.rise + 9.5 * sh, ''], ['Plag Hamincha', 'פלג המנחה', s.rise + 10.75 * sh, ''],
        ['Sunset (Shkiah)', 'שקיעה', s.set, ''], ['Nightfall (Tzeis)', 'צאת הכוכבים', tz8.set, '8.5°'], ['Rabbeinu Tam', 'צאת ר״ת', s.set + 72 * 6e4, '72 min']
      ].map(([en, he, ms, note]) => ({ en, he, ms, note, t: ms ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || 'America/New_York' }).format(new Date(ms)) : '—' }));
    }
    function areaInfo(name) { return (DV.areas || []).find(a => a.n === name); }
    function zmanimHTML(area, iso) {
      const a = areaInfo(area); if (!a || !a.ll) return '';
      const z = zmanim(iso, a.ll, a.tz); if (!z) return '';
      return `<section class="zm"><div class="zm-h"><h2>${esc(T('Zmanim'))} · ${esc(T(area))}</h2><p>${esc(dayName(iso))}</p></div>
        <ul class="zm-list">${z.map(x => `<li><span class="zm-n">${YI ? esc(x.he) : `${esc(x.en)} <span class="zm-he" lang="he" dir="rtl">${esc(x.he)}</span>`}${x.note ? ` <small>${esc(x.note)}</small>` : ''}</span><b>${esc(x.t)}</b></li>`).join('')}</ul>
        <p class="hint">${esc(T('Worked out in your browser from the sun’s position for the middle of {area}. They can be off by a minute or two; follow your own shul’s luach.', { area: T(area) }))}</p></section>`;
    }
    const fmtChecked = s => { try { return new Date(s + 'T12:00:00').toLocaleDateString(YI ? 'en-US' : undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return s; } };
    const srcLine = x => `<p class="dv-src">${esc(T('Source'))}: <a href="${esc(x.src)}" target="_blank" rel="noopener">${esc(x.srcn || host(x.src).split('/')[0])}</a> · ${esc(T('last checked {date}', { date: fmtChecked(x.chk) }))}</p>`;
    const mapLink = x => x.a ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.n + ', ' + x.a + ', ' + (x.city || '') + ' ' + (x.st || ''))}" target="_blank" rel="noopener">${esc(x.a)}${x.city ? ', ' + esc(x.city) : ''}</a>` : esc([x.city, x.st].filter(Boolean).join(', '));
    const phoneLink = ph => ph ? `<a class="dv-ph" href="tel:${esc(tel(ph))}">${esc(ph)}</a>` : '';
    const TEF = [['s', 'Shacharis'], ['m', 'Mincha'], ['a', 'Maariv']];
    const timesHTML = a => a.length <= 6 ? a.map(esc).join(' · ') : `${a.slice(0, 5).map(esc).join(' · ')} <details class="dv-more"><summary>+${a.length - 5}</summary>${a.slice(5).map(esc).join(' · ')}</details>`;
    function itemHTML(x) {
      if (x.kind === 'mikvah_women') return `<article class="dv-card w"><h3>${esc(x.n)}</h3><p class="dv-where">${esc([x.addressPublic && x.a ? x.a : '', x.city, x.st].filter(Boolean).join(', '))}</p>${x.ph ? `<p>${phoneLink(x.ph)}</p>` : ''}${x.note ? `<p class="dv-note2" dir="auto">${esc(x.note)}</p>` : ''}${srcLine(x)}</article>`;
      const mins = x.kind === 'shul' && x.m ? TEF.filter(([k]) => x.m[k] && x.m[k].length).map(([k, n]) => `<div class="dv-t"><span>${esc(T(n))}</span><b dir="ltr">${timesHTML(x.m[k])}</b></div>`).join('') : '';
      return `<article class="dv-card${x.kind === 'mikvah_men' ? ' m' : ''}"><h3>${esc(x.n)}</h3>${x.nus ? `<span class="dv-nus">${esc(T('Nusach'))} ${esc(x.nus)}</span>` : ''}
        <p class="dv-where">${mapLink(x)}</p>${x.ph ? `<p>${phoneLink(x.ph)}</p>` : ''}
        ${mins ? `<div class="dv-times">${mins}</div>${x.tn ? `<p class="dv-tn" dir="auto">${esc(x.tn)}</p>` : ''}` : (x.kind === 'shul' ? `<p class="dv-tn">${esc(T('No minyan times listed. Call the shul.'))}</p>` : '')}
        ${x.note ? `<p class="dv-note2" dir="auto">${esc(x.note)}</p>` : ''}${srcLine(x)}</article>`;
    }
    function renderDavenList() {
      if (!DV) return;
      const q = dv.q.toLowerCase().trim();
      const inArea = DV.items.filter(x => (!dv.area || x.area === dv.area));
      const counts = { shul: 0, mikvah_men: 0, mikvah_women: 0 }; inArea.forEach(x => { counts[x.kind] = (counts[x.kind] || 0) + 1; });
      $('dv-tabs').innerHTML = Object.keys(KIND).map(k => `<button type="button" data-dvtab="${k}" aria-pressed="${dv.tab === k}">${esc(T(KIND[k]))} <span class="count">${counts[k]}</span></button>`).join('');
      const list = inArea.filter(x => x.kind === dv.tab && (!q || (x.n + ' ' + (x.a || '') + ' ' + (x.city || '')).toLowerCase().includes(q))).sort((a, b) => a.n.localeCompare(b.n));
      const note = dv.tab === 'shul' ? `<p class="dv-warn"><b>${esc(T('Times change — confirm with the shul.'))}</b> ${esc(T('Weekday times as the directory lists them; Shabbos, Sunday and Yom Tov times are different.'))}</p>`
        : dv.tab === 'mikvah_women' ? `<p class="dv-warn">${esc(T('Listed discreetly: name, town and how to reach them. Call for hours and appointments.'))}</p>`
        : `<p class="dv-warn">${esc(T('Hours change — call before you go.'))}</p>`;
      $('dv-list').innerHTML = note + (list.length ? `<div class="dv-grid">${list.map(itemHTML).join('')}</div>` : `<div class="empty">${esc(T('Nothing listed here yet for this area.'))}</div>`);
    }
    window.renderDaven = async function () {
      const v = $('view-daven'); if (!v) return;
      if (!DV) { $('dv-list').innerHTML = `<p class="hint">${esc(T('Loading…'))}</p>`; await loadDaven(); }
      if (!DV) { $('dv-list').innerHTML = `<div class="empty">${esc(T('This list could not load. Check your internet connection and try again.'))}</div>`; return; }
      if (!dv.area) dv.area = ORIGIN_AREA[state.origin] || DV.areas[0].n;
      if (!dv.day || dv.day < TODAY) dv.day = dayISO();
      const groups = [...new Set(DV.areas.map(a => a.g))];
      $('dv-area').innerHTML = groups.map(g => `<optgroup label="${esc(T(g))}">${DV.areas.filter(a => a.g === g).map(a => `<option value="${esc(a.n)}"${a.n === dv.area ? ' selected' : ''}>${esc(T(a.n))}</option>`).join('')}</optgroup>`).join('');
      $('dv-day').innerHTML = dayOpts(dv.day);
      $('dv-zmanim').innerHTML = zmanimHTML(dv.area, dv.day);
      renderDavenList();
    };
    const dvView = $('view-daven');
    if (dvView) {
      dvView.addEventListener('change', e => {
        if (e.target.id === 'dv-area') { dv.area = e.target.value; window.renderDaven(); }
        if (e.target.id === 'dv-day') { dv.day = e.target.value; $('dv-zmanim').innerHTML = zmanimHTML(dv.area, dv.day); }
      });
      dvView.addEventListener('input', e => { if (e.target.id === 'dv-q') { dv.q = e.target.value; renderDavenList(); } });
      dvView.addEventListener('click', e => {
        const t = e.target.closest('[data-dvtab]'); if (t) { dv.tab = t.dataset.dvtab; renderDavenList(); return; }
        if (e.target.closest('#dv-map')) { mapDaven = true; LS.set('of-map-daven', true); OF.go('map'); }
      });
    }
    // davening near a place, in its details
    const prevOpen = window.onPlaceOpen;
    window.onPlaceOpen = p => {
      if (prevOpen) prevOpen(p);
      if (!p.ll) return;
      loadDaven().then(d => {
        const box = $('d-daven'); if (!d || !box || OF.curView === undefined) return;
        const near = d.items.filter(x => x.kind !== 'mikvah_women' && x.ll).map(x => ({ x, k: km(p.ll, x.ll) })).filter(o => o.k < 25).sort((a, b) => a.k - b.k);
        const sh = near.filter(o => o.x.kind === 'shul').slice(0, 3), mk = near.filter(o => o.x.kind === 'mikvah_men').slice(0, 1);
        if (!sh.length && !mk.length) return;
        const row = o => `<li><b>${esc(o.x.n)}</b> · ${esc(T('{d} mi', { d: miles(o.k).toFixed(1) }))}${o.x.kind === 'mikvah_men' ? ' · ' + esc(T('Men\u2019s mikvah')) : ''}${o.x.m && o.x.m.m && o.x.m.m.length ? ' · ' + esc(T('Mincha')) + ' ' + esc(o.x.m.m.slice(0, 3).join(', ')) : ''}</li>`;
        box.innerHTML = `<div class="dvnear"><h4>${esc(T('Davening nearby'))}</h4><ul>${sh.concat(mk).map(row).join('')}</ul><p class="hint"><button class="linkbtn" type="button" data-dvarea="${esc(sh.concat(mk)[0].x.area)}">${esc(T('All shuls, mikvaos and zmanim there'))} ›</button> ${esc(T('Times change — confirm with the shul.'))}</p></div>`;
      });
    };
    document.addEventListener('click', e => { const a = e.target.closest('[data-dvarea]'); if (a) { dv.area = a.dataset.dvarea; const x = document.querySelector('#detail .x'); if (x) x.click(); OF.go('daven'); } });
    // map layer: shuls and men's mikvaos (women's mikvaos are never put on the map)
    let mapDaven = LS.get('of-map-daven', false), dvLayer = null;
    window.mapExtras = async function (map) {
      const box = $('map-daven'); if (box) { box.hidden = false; $('map-daven-on').checked = mapDaven; }
      if (dvLayer) { dvLayer.remove(); dvLayer = null; }
      if (!mapDaven || !window.L) return;
      const d = await loadDaven(); if (!d) return;
      dvLayer = L.layerGroup();
      d.items.filter(x => x.kind !== 'mikvah_women' && x.ll).forEach(x => {
        const shul = x.kind === 'shul';
        const icon = L.divIcon({ className: 'dvpin ' + (shul ? 'shul' : 'mik'), html: shul ? '✡' : '≈', iconSize: [22, 22] });
        const mins = shul && x.m ? TEF.filter(([k]) => x.m[k] && x.m[k].length).map(([k, n]) => `${esc(T(n))}: ${x.m[k].slice(0, 4).map(esc).join(', ')}`).join('<br>') : '';
        L.marker(x.ll, { icon, title: x.n }).bindPopup(`<b>${esc(x.n)}</b><br><span style="color:${shul ? '#1d4ed8' : '#0f766e'};font-weight:700">${esc(T(shul ? 'Shul' : 'Men\u2019s mikvah'))}</span>${x.a ? '<br>' + esc(x.a) : ''}${mins ? '<br>' + mins : ''}<br><small>${esc(T('Times change — confirm with the shul.'))}</small>`).addTo(dvLayer);
      });
      dvLayer.addTo(map);
    };
    const mdo = $('map-daven-on');
    if (mdo) mdo.addEventListener('change', e => { mapDaven = e.target.checked; LS.set('of-map-daven', mapDaven); if (window.renderMap) window.renderMap(); });


    setupRain();
    if (OF.curView === 'home') rainCheck(false);
    window.addEventListener('hashchange', () => { if (location.hash === '#home' || location.hash === '') { setupRain(); rainCheck(false); } });
    if (OF.curView === 'trips') window.onTripsView();
    if (OF.curView === 'daven') window.renderDaven();
    if (OF.curView === 'map' && window.mapExtras && mapDaven) window.renderMap();
  }
  if (window.OF) boot(); else document.addEventListener('of:ready', boot, { once: true });
})();
