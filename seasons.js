/* Seasons: which outing season the site is dressed for.
   Pick one with ?season=chanukah | winter | sukkos | pesach in the address. Without it, the site shows the first
   season below whose "until" date has not passed yet (so winter now, Pesach after the winter break,
   then Sukkos). Update the dates each year. Colors live in index.html under html[data-season="..."]. */
(function () {
  var SEASONS = [
    {
      id: 'winter', until: '2027-01-03',
      label: 'Winter break', short: 'Winter', yi: 'ווינטער וואקאציע', icon: '❄',
      title: 'Outing Finder · Winter vacation', brandYi: 'ווינטער',
      eyebrow: 'Winter vacation · Dec 24 – Jan 1', eyebrowYi: 'ווינטער וואקאציע',
      h1: 'Winter vacation <em>outings.</em>', sub: 'Ice skating, snow days and warm indoor fun for the whole family.',
      lede: 'family outing places, sorted for winter: snow and indoor places first, with drive times from your community.',
      heroImg: { day: 'img/winter/day-2400.webp', dayPhone: 'img/winter/day-1280.webp', dusk: 'img/winter/dusk-2400.webp' },
      dates: [
        { k: 'break', text: 'Winter break: Thursday, Dec 24, 2026 – Friday, Jan 1, 2027 (the NYC public school winter recess; yeshiva and school breaks vary).', until: '2027-01-02' },
        { k: 'chanukah', text: 'Chanukah: first candle Friday, Dec 4 (before Shabbos), through Saturday, Dec 12, 2026.', until: '2026-12-12' }
      ],
      holidayNote: 'Dec 25 and Jan 1: many places close or keep short holiday hours, so call or check the website before you go.',
      hoursNote: 'Winter hours are from each place\u2019s own website where we could confirm them; call before you go.',
      // Chanukah events, when someone sends them in: { name, date, place, address, link, note }
      events: [],
      // Places with skating, skiing, snow tubing or snow play (by place number in data/core.json).
      snowIds: [118, 139, 130, 366, 148, 334, 345, 347, 588, 469, 470, 486, 506],
      // Trip destinations shown first in winter: warm-weather trips, then snow country.
      tripFirst: ['North Miami', 'West Palm Beach', 'Tampa', 'Palm Springs', 'Tucson', 'Grand Canyon & Arizona', 'Poconos', 'Hunter Mountain'],
      addPlaces: [],
      fun: [
        ['@snow', 'img/cat/snow-ice.webp', 'Snow & Ice', 'Skate, ski and slide'],
        ['Indoor Fun', 'img/cat/indoor-fun.webp', 'Indoor Fun', 'Warm, busy and fun'],
        ['@iwater', 'img/cat/indoor-water.webp', 'Indoor water parks', 'Swim when it\u2019s freezing'],
        ['Museums', 'img/cat/museums.webp', 'Museums', 'Feed their curiosity'],
        ['Zoos & Aquariums', 'img/cat/zoos-aquariums.webp', 'Zoos & Aquariums', 'Meet the wild ones'],
        ['Malls', '', 'Malls', 'Rides and play under one roof']
      ],
      quick: [['open', 'Open today'], ['snow', '\u2744 Snow & ice'], ['rain', 'Indoors'], ['free', 'Free'], ['close', 'Within 30 min']],
      copyTitle: 'My winter vacation list'
    },
    {
      id: 'pesach', until: '2027-04-30',
      label: 'Chol Hamoed Pesach', short: 'Pesach', yi: 'חול המועד פסח', icon: '\u273F',
      title: 'Chol Hamoed Pesach Outing Finder', brandYi: 'חול המועד',
      eyebrow: 'Chol Hamoed Pesach · Apr 25\u201327, 2027', eyebrowYi: 'חול המועד פסח תשפ״ז',
      h1: 'A day to <em>remember.</em>', sub: 'Find your Chol Hamoed Pesach outing.',
      lede: 'family outing places, with hours, phone numbers and drive times from your community.',
      dates: [{ k: 'pesach', text: 'Chol Hamoed Pesach 5787: Shabbos Chol Hamoed is Apr 24; outing days are Sunday, Apr 25 \u2013 Tuesday, Apr 27, 2027 (outside Eretz Yisroel).', until: '2027-04-27' }],
      hoursNote: 'Regular hours are from each place\u2019s Google business listing. Pesach hours can be different, so check before you go.',
      copyTitle: 'My Chol Hamoed Pesach list'
    },
    {
      id: 'sukkos', until: '9999-12-31',
      label: 'Chol Hamoed Sukkos', short: 'Sukkos', yi: 'חול המועד סוכות', icon: '\u2618',
      title: 'Chol Hamoed Outing Finder', brandYi: 'חול המועד',
      eyebrow: 'Your Chol Hamoed starts here', eyebrowYi: 'חול המועד סוכות תשפ״ז',
      h1: 'A day to <em>remember.</em>', sub: 'Find your next family adventure.',
      lede: 'family outing places, with hours, phone numbers and drive times from your community.',
      copyTitle: 'My Chol Hamoed list', base: true
    }
  ];
  // Chanukah (until the last day of Chanukah 2026): the winter setup (indoor places first, winter hours from each
  // place's own website, outdoor places hidden at first), dressed for Chanukah. Shown by default until Dec 12.
  SEASONS.unshift(Object.assign({}, SEASONS[0], {
    id: 'chanukah', look: 'winter', until: '2026-12-12', noOutdoor: true,
    label: 'Chanukah', short: 'Chanukah', yi: '\u05D7\u05E0\u05D5\u05DB\u05D4', icon: '\uD83D\uDD4E',
    title: 'Chanukah Outings for Families \u00B7 Outing Finder', brandYi: '\u05D7\u05E0\u05D5\u05DB\u05D4',
    eyebrow: 'Chanukah \u00B7 Dec 4 \u2013 12, 2026', eyebrowYi: '\u05D7\u05E0\u05D5\u05DB\u05D4 \u05EA\u05E9\u05E4\u05F4\u05D6',
    h1: 'Chanukah <em>outings.</em>', sub: 'Warm indoor fun and places open in December, for the days the kids are off.',
    lede: 'places, sorted for Chanukah: indoor places first, December hours where we could confirm them, and drive times from your community.',
    dates: [{ k: 'chanukah', text: 'Chanukah: first candle Friday, Dec 4 (before Shabbos), through Saturday, Dec 12, 2026.', until: '2026-12-12' }],
    holidayNote: '', copyTitle: 'My Chanukah outings list'
  }));
  var byId = {}; SEASONS.forEach(function (s) { byId[s.id] = s; });
  var today = new Date(); var iso = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
  var asked = null;
  try { asked = new URLSearchParams(location.search).get('season'); } catch (e) {}
  if (asked) asked = asked.toLowerCase().replace(/^(sukkot|succos|sukkos)$/, 'sukkos').replace(/^(passover|pesah)$/, 'pesach').replace(/^(hanukkah|hanukah|chanuka|chanukkah)$/, 'chanukah');
  var dflt = SEASONS.filter(function (s) { return s.until >= iso; })[0] || byId.sukkos;
  var cur = (asked && byId[asked]) || dflt;
  cur.isDefault = cur === dflt;
  window.SEASONS = SEASONS; window.SEASON = cur; window.SEASON_DEFAULT = dflt.id; window.SEASON_TODAY = iso;
  document.documentElement.setAttribute('data-season', cur.look || cur.id);
  if (cur.heroImg) {
    var phone = window.matchMedia && matchMedia('(max-width: 700px) and (max-resolution: 1.4dppx)').matches;
    var l = document.createElement('link'); l.rel = 'preload'; l.as = 'image';
    l.href = phone && cur.heroImg.dayPhone ? cur.heroImg.dayPhone : cur.heroImg.day; document.head.appendChild(l);
  }
  // link to a season, keeping the page you are on
  window.seasonHref = function (id) { return (id === dflt.id ? location.pathname : location.pathname + '?season=' + id) + location.hash; };
  // Dress the static page for the season. Runs right after the hero is parsed, before the data loads.
  window.applySeason = function () {
    var s = cur, $ = function (id) { return document.getElementById(id); };
    document.title = s.title;
    var b = document.querySelector('.brand .yi'); if (b) b.textContent = s.brandYi;
    if (s.base) { renderSwitch(); return; }
    var eb = document.querySelector('.coast-eyebrow');
    if (eb) eb.innerHTML = '<span>' + s.eyebrow + '</span><span class="yi" lang="yi" dir="rtl">' + s.eyebrowYi + '</span>';
    if ($('hero-title')) $('hero-title').innerHTML = s.h1;
    var sub = document.querySelector('.coast-sub'); if (sub) sub.textContent = s.sub;
    if ((s.look || s.id) === 'winter' && $('heroq')) $('heroq').placeholder = 'Search outings: ice skating, bowling, museum\u2026';
    renderSwitch();
  };
  function renderSwitch() {
    document.querySelectorAll('.seasonswitch').forEach(function (box) {
      box.innerHTML = '<span class="ss-l">Season</span>' + SEASONS.map(function (s) {
        return '<a href="' + window.seasonHref(s.id) + '" data-season-link="' + s.id + '"' + (s === cur ? ' aria-current="true"' : '') + '><span aria-hidden="true">' + s.icon + '</span> <span class="ss-long">' + s.label + '</span><span class="ss-short">' + s.short + '</span></a>';
      }).join('');
    });
  }
  window.renderSeasonSwitch = renderSwitch;
  document.addEventListener('DOMContentLoaded', renderSwitch);
  // keep the season links pointing at the current view when the hash changes
  window.addEventListener('hashchange', function () {
    document.querySelectorAll('[data-season-link]').forEach(function (a) { a.href = window.seasonHref(a.getAttribute('data-season-link')); });
  });
})();
