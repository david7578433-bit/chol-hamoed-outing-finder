/* trip.html: the picked places, start and round trip, then SmartRoute with the stops in the best order (embedded). */
(function () {
  var SR = 'https://david7578433-bit.github.io/smartroute/';
  var T = window.T || function (s, v) { return v ? String(s).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var Trip = window.OFTrip;
  function render() {
    var v = Trip.list();
    $('t-list').innerHTML = v.map(function (x, i) {
      return '<li><span class="num">' + (i + 1) + '</span><div><div class="nm" dir="auto" data-noi18n>' + esc(x.n) + '</div><div class="ad" dir="ltr" data-noi18n>' + esc(x.a) + '</div></div>' +
        '<button class="x" type="button" data-rm="' + esc(x.k) + '" aria-label="' + esc(T('Remove')) + ': ' + esc(x.n) + '">' + esc(T('Remove')) + '</button></li>';
    }).join('');
    $('t-empty').hidden = v.length > 0;
    $('t-more').hidden = v.length === 0;
    $('t-plan').hidden = v.length === 0;
    $('t-count').textContent = v.length ? '(' + v.length + ')' : '';
  }
  $('t-list').addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b) { Trip.remove(b.dataset.rm); render(); } });
  $('t-clear').addEventListener('click', function () { if (confirm(T('Clear all places from my trip?'))) { Trip.clear(); render(); } });
  window.addEventListener('storage', render);
  document.querySelectorAll('input[name="start"]').forEach(function (r) {
    r.addEventListener('change', function () { var a = val('start') === 'addr'; $('t-addr').hidden = !a; if (a) $('t-addr').focus(); });
  });
  function val(n) { var r = document.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : ''; }
  function status(msg, err) { var s = $('t-status'); s.textContent = msg || ''; s.classList.toggle('err', !!err); }
  function where() {
    return new Promise(function (res, rej) {
      if (!navigator.geolocation) return rej(new Error('no-geo'));
      navigator.geolocation.getCurrentPosition(function (p) { res([p.coords.latitude, p.coords.longitude]); }, rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 });
    });
  }
  function url(start, embed) {
    var stops = Trip.list().map(function (x) { return x.stop; });
    var q = 'stops=' + stops.map(encodeURIComponent).join('|') + '&end=' + (val('end') === 'open' ? 'open' : 'round');
    if (start) q += '&start=' + encodeURIComponent(start);
    return SR + '?' + q + (embed ? '&embed=1' : '');
  }
  function openSR(start) {
    $('sr-frame').src = url(start, true);
    $('sr-full').href = url(start, false);
    $('sr').hidden = false; document.body.classList.add('sr-open');
    if (location.hash !== '#route') history.pushState({ sr: 1 }, '', '#route');
    if (window.goatcounter && window.goatcounter.count) try { window.goatcounter.count({ path: 'trip-plan', title: 'Plan best route', event: true }); } catch (e) {}
  }
  function closeSR() { $('sr').hidden = true; document.body.classList.remove('sr-open'); $('sr-frame').src = 'about:blank'; }
  $('sr-back').addEventListener('click', function () { if (location.hash === '#route') history.back(); else closeSR(); });
  window.addEventListener('popstate', function () { if (location.hash !== '#route') closeSR(); });
  $('t-go').addEventListener('click', async function () {
    var n = Trip.list().length;
    if (!n) { status(T('Add at least one place first.'), true); return; }
    if (val('start') === 'addr') {
      var a = $('t-addr').value.trim().replace(/[|@]/g, ' ');
      if (!a) { status(T('Type the start address.'), true); $('t-addr').focus(); return; }
      status(''); openSR(a); return;
    }
    $('t-go').disabled = true; status(T('Finding your location…'));
    try {
      var p = await where();
      status(''); openSR('My location @' + p[0].toFixed(5) + ',' + p[1].toFixed(5));
    } catch (e) {
      status(T('Location is off. Type a start address instead.'), true);
      var r = document.querySelector('input[name="start"][value="addr"]'); r.checked = true; $('t-addr').hidden = false; $('t-addr').focus();
    } finally { $('t-go').disabled = false; }
  });
  if (location.hash === '#route') history.replaceState(null, '', location.pathname + location.search);
  render();
})();
