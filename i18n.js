/* Language: English or Yiddish (יידיש). The choice is kept on this device (localStorage "of-lang").
   Yiddish switches the page to right-to-left. Words live in yi.js as English → Yiddish pairs, plus a few patterns
   for text with numbers in it. Place names, addresses and place descriptions stay as they are. */
(function () {
  var KEY = 'of-lang', lang = 'en';
  try { lang = localStorage.getItem(KEY) === 'yi' ? 'yi' : 'en'; } catch (e) {}
  try { var q = new URLSearchParams(location.search).get('lang'); if (q === 'yi' || q === 'en') lang = q; } catch (e) {}
  var root = document.documentElement;
  window.LANG = lang;
  if (lang === 'yi') { root.setAttribute('lang', 'yi'); root.setAttribute('dir', 'rtl'); root.classList.add('lang-yi'); }
  var dict = null, rules = [];
  // T('text') → the Yiddish words when Yiddish is on and a translation exists, otherwise the English.
  // T('Showing {n} places', { n: 5 }) fills in the {names}.
  function fill(s, v) { return v ? String(s).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; }
  function look(s) {
    if (!dict || s == null) return null;
    var k = String(s);
    if (Object.prototype.hasOwnProperty.call(dict, k)) return dict[k];
    for (var i = 0; i < rules.length; i++) { var m = k.match(rules[i][0]); if (!m) continue; var r = typeof rules[i][1] === 'function' ? rules[i][1](m, look) : k.replace(rules[i][0], rules[i][1]); if (r != null) return r; }
    return null;
  }
  window.T = function (s, v) { if (lang !== 'yi') return fill(s, v); var y = look(s); return fill(y == null ? s : y, v); };
  window.setLang = function (l) {
    try { localStorage.setItem(KEY, l); } catch (e) {}
    try { var u = new URL(location.href); if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch (e) {}
    location.reload();
  };
  // Translate text already on the page, and anything the app adds later, by exact match.
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  function trText(node) {
    var raw = node.nodeValue; if (!raw || !/[A-Za-z]/.test(raw)) return;
    var t = raw.trim(); if (!t) return;
    var y = look(t); if (y == null || y === t) return;
    var a = raw.indexOf(t); node.nodeValue = raw.slice(0, a) + y + raw.slice(a + t.length);
  }
  function trEl(el) {
    if (el.closest && el.closest('[data-noi18n],script,style,textarea')) return;
    for (var i = 0; i < ATTRS.length; i++) { var v = el.getAttribute(ATTRS[i]); if (v && /[A-Za-z]/.test(v)) { var y = look(v.trim()); if (y != null) el.setAttribute(ATTRS[i], y); } }
  }
  function walk(n) {
    if (n.nodeType === 3) { var p = n.parentNode; if (p && p.closest && p.closest('[data-noi18n],script,style,textarea')) return; trText(n); return; }
    if (n.nodeType !== 1) return;
    trEl(n);
    var w = document.createTreeWalker(n, 5, null), x;   // elements + text
    while ((x = w.nextNode())) { if (x.nodeType === 3) { var pp = x.parentNode; if (pp && pp.closest && pp.closest('[data-noi18n],script,style,textarea')) continue; trText(x); } else trEl(x); }
  }
  window.translateTree = function (n) { if (lang === 'yi' && dict) walk(n || document.body); };
  function start() {
    walk(document.body);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'characterData') { trText(m.target); continue; }
        if (m.type === 'attributes') { trEl(m.target); continue; }
        for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function langButtons() {
    var b = document.getElementById('langbtn');
    if (b) { var to = lang === 'yi' ? 'en' : 'yi'; b.setAttribute('data-setlang', to); b.textContent = to === 'yi' ? 'יידיש' : 'English'; b.setAttribute('lang', to); b.setAttribute('dir', to === 'yi' ? 'rtl' : 'ltr'); }
    document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('[data-setlang]'); if (t && t.getAttribute('data-setlang')) { e.preventDefault(); window.setLang(t.getAttribute('data-setlang')); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', langButtons); else langButtons();
  window.I18N_READY = new Promise(function (res) {
    if (lang !== 'yi') return res();
    var s = document.createElement('script'); s.src = 'yi.js?v=1';
    s.onload = function () { dict = window.YI_WORDS || {}; rules = window.YI_RULES || []; if (document.body) start(); else document.addEventListener('DOMContentLoaded', start); res(); };
    s.onerror = function () { res(); };
    document.head.appendChild(s);
  });
})();
