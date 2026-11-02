/* Plan my trip: a small list of places kept on this device (localStorage "of-trip"), a floating "My trip (N)" pill,
   and the "+ Add to my trip" buttons on place cards. trip.html opens SmartRoute with the list in the best order.
   Each stop is "Name · street address @lat,lon" so SmartRoute uses the exact spot and still shows the name. */
(function () {
  var KEY = 'of-trip', MAX = 10;
  var T = window.T || function (s, v) { return v ? String(s).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
  function list() { try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(function (x) { return x && x.k && x.stop; }) : []; } catch (e) { return []; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} paint(); }
  function has(k) { return list().some(function (x) { return x.k === k; }); }
  function find(k) { var P = (window.OF && window.OF.P) || []; for (var i = 0; i < P.length; i++) if (P[i].key === k) return P[i]; return null; }
  function toggle(k) {
    var v = list(), i = -1;
    for (var j = 0; j < v.length; j++) if (v[j].k === k) i = j;
    if (i >= 0) { v.splice(i, 1); save(v); return false; }
    var p = find(k), stop = p && window.OF && window.OF.tripStop ? window.OF.tripStop(p) : '';
    if (!p || !stop) return false;
    if (v.length >= MAX) { flash(T('Up to {n} places in one trip.', { n: MAX })); return false; }
    v.push({ k: k, n: p.n, a: (p.locs && p.locs[0]) || p.a || '', s: p.s || '', stop: stop });
    save(v); return true;
  }
  function remove(k) { save(list().filter(function (x) { return x.k !== k; })); }
  function clear() { save([]); }

  var pill = null, toast = null, toastT = 0;
  function bottomGap() {
    var nav = document.querySelector('.navlinks');
    if (nav && getComputedStyle(nav).position === 'fixed' && nav.offsetHeight) return nav.offsetHeight + 12;
    return 16;
  }
  function place(el) { var b = 'calc(' + bottomGap() + 'px + env(safe-area-inset-bottom, 0px))'; if (el.style.bottom !== b) el.style.bottom = b; }
  function paint() {
    var v = list(), n = v.length;
    document.querySelectorAll('[data-trip]').forEach(function (b) {
      var on = v.some(function (x) { return x.k === b.dataset.trip; });
      var txt = T(on ? '✓ In my trip' : '+ Add to my trip');
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', on);
      if (b.textContent !== txt) b.textContent = txt;
    });
    document.querySelectorAll('[data-tripcount]').forEach(function (c) { var s = n ? String(n) : ''; if (c.textContent !== s) c.textContent = s; });
    if (document.body && document.body.hasAttribute('data-nopill')) return;
    if (!pill && document.body) {
      pill = document.createElement('a'); pill.className = 'trippill'; pill.href = 'trip.html';
      document.body.appendChild(pill);
    }
    if (pill) {
      var label = '🚗 ' + T('My trip ({n})', { n: n });
      if (pill.hidden !== !n) pill.hidden = !n;
      if (pill.textContent !== label) pill.textContent = label;
      place(pill);
    }
  }
  function flash(msg) {
    if (!document.body) return;
    if (!toast) { toast = document.createElement('div'); toast.className = 'triptoast'; toast.setAttribute('role', 'status'); document.body.appendChild(toast); }
    toast.textContent = msg; toast.hidden = false; place(toast); toast.style.bottom = 'calc(' + (bottomGap() + 58) + 'px + env(safe-area-inset-bottom, 0px))';
    clearTimeout(toastT); toastT = setTimeout(function () { toast.hidden = true; }, 2200);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-trip]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var on = toggle(b.dataset.trip);
    if (on) flash(T('Added to my trip ({n})', { n: list().length }));
  }, true);
  window.addEventListener('storage', function (e) { if (e.key === KEY) paint(); });
  window.addEventListener('resize', function () { if (pill) place(pill); });
  // cards are drawn later by app.js; keep their buttons in step with the list
  if ('MutationObserver' in window) {
    var queued = false;
    new MutationObserver(function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; paint(); }); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  window.OFTrip = { list: list, has: has, toggle: toggle, remove: remove, clear: clear, MAX: MAX, paint: paint };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint); else paint();
})();
