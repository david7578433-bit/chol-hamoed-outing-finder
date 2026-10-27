/* Seasons: which outing season the site is dressed for.
   Pick one with ?season=winter | sukkos | pesach in the address. Without it, the site shows the first
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
      lede: 'places from the Navigation guide, sorted for winter: snow and indoor places first, with drive times from your community.',
      heroImg: { day: 'img/winter/day-2400.webp', dayPhone: 'img/winter/day-1280.webp', dusk: 'img/winter/dusk-2400.webp' },
      dates: [
        { k: 'break', text: 'Winter break: Thursday, Dec 24, 2026 – Friday, Jan 1, 2027 (the NYC public school winter recess; yeshiva and school breaks vary).', until: '2027-01-02' },
        { k: 'chanukah', text: 'Chanukah: first candle Friday, Dec 4 (before Shabbos), through Saturday, Dec 12, 2026.', until: '2026-12-12' }
      ],
      holidayNote: 'Dec 25 and Jan 1: many places close or keep short holiday hours. The guide doesn\u2019t list holiday hours, so call or check the website before you go.',
      hoursNote: 'Hours and prices come from the Sukkos guide. Winter and holiday hours can be different, so check before you go.',
      // Chanukah events, when someone sends them in: { name, date, place, address, link, note }
      events: [],
      // Places the guide describes as skating, skiing, snow tubing or snow play (by place number).
      snowIds: [122, 143, 134, 370, 152, 338, 349, 351, 593, 474, 475, 491, 511],
      // Trip destinations shown first in winter: warm-weather trips, then snow country.
      tripFirst: ['North Miami', 'West Palm Beach', 'Tampa', 'Palm Springs', 'Tucson', 'Grand Canyon & Arizona', 'Poconos', 'Hunter Mountain'],
      // Places added for winter. Not from the guide: checked on each official website on Oct 27, 2026.
      addPlaces: [
        { n: 'Sport-O-Rama Ice Rink', s: 'Indoor Fun', k: 'local', io: 'in', st: 'NY', a: '20 College Road, Monsey, NY 10952', p: ['845.356.3919'],
          w: 'https://www.sportorama.com/', de: 'Indoor ice rink in Monsey with public skating sessions. Their public skating page lists a Friday girls-only session; check it for the current schedule.',
          ll: [41.11231, -74.0874], tFrom: 575, src2: 'https://www.sportorama.com/public-skating', snow: true },
        { n: 'Wollman Rink', s: 'Outdoor Fun', k: 'local', io: 'out', st: 'NY', a: '830 5th Ave, New York, NY 10065', p: ['833.615.3500'],
          w: 'https://wollmanrinknyc.com/', de: 'Outdoor ice skating rink in Central Park, open in the winter season. The rink\u2019s site says it is near the southeast corner of the park; the closest entrance is at 59th Street and 6th Avenue.',
          ll: [40.76772, -73.97447], tFrom: 183, src2: 'https://wollmanrinknyc.com/plan/', snow: true },
        { n: 'LeFrak Center at Lakeside (Prospect Park)', s: 'Outdoor Fun', k: 'local', io: 'out', st: 'NY', a: 'Prospect Park, near the Lincoln Road and Parkside/Ocean Avenue entrances, Brooklyn, NY', p: [],
          w: 'https://www.prospectpark.org/visit-the-park/places-to-go/lefrak-center-lakeside/', de: 'Ice skating in Prospect Park in the winter, on connected covered and open rinks (Prospect Park Alliance).',
          ll: [40.65702, -73.9642], tFrom: 162, src2: 'https://www.prospectpark.org/visit-the-park/things-to-do/skating/', snow: true },
        { n: 'Thunder Ridge Ski Area', s: 'Outdoor Fun', k: 'local', io: 'out', st: 'NY', a: '137 Birch Hill Rd, Patterson, NY 12563', p: ['845.878.4100'],
          w: 'https://thunderridgeski.com/', de: 'Ski and snowboard area in Patterson, NY with 22 trails, 3 chairlifts, 4 magic carpets and lessons, according to its website.',
          ll: [41.51256, -73.57717], tFrom: null, src2: 'https://thunderridgeski.com/', snow: true }
      ],
      fun: [
        ['@snow', 'img/cat/snow-ice.webp', 'Snow & Ice', 'Skate, ski and slide'],
        ['Indoor Fun', 'img/cat/indoor-fun.webp', 'Indoor Fun', 'Warm, busy and fun'],
        ['@iwater', 'img/cat/indoor-water.webp', 'Indoor water parks', 'Swim when it\u2019s freezing'],
        ['Museums', 'img/cat/museums.webp', 'Museums', 'Feed their curiosity'],
        ['Zoos & Aquariums', 'img/cat/zoos-aquariums.webp', 'Zoos & Aquariums', 'Meet the wild ones'],
        ['Malls', '', 'Malls', 'Rides and play under one roof']
      ],
      quick: [['snow', '\u2744 Snow & ice'], ['rain', 'Indoors'], ['little', 'Good for little kids'], ['free', 'Free'], ['close', 'Within 30 min']],
      copyTitle: 'My winter vacation list'
    },
    {
      id: 'pesach', until: '2027-04-30',
      label: 'Chol Hamoed Pesach', short: 'Pesach', yi: 'חול המועד פסח', icon: '\u273F',
      title: 'Chol Hamoed Pesach Outing Finder', brandYi: 'חול המועד',
      eyebrow: 'Chol Hamoed Pesach · Apr 25\u201327, 2027', eyebrowYi: 'חול המועד פסח תשפ״ז',
      h1: 'A day to <em>remember.</em>', sub: 'Find your Chol Hamoed Pesach outing.',
      lede: 'places from the Navigation guide, with photos, family reviews, hours, prices and drive times from your community.',
      dates: [{ k: 'pesach', text: 'Chol Hamoed Pesach 5787: Shabbos Chol Hamoed is Apr 24; outing days are Sunday, Apr 25 \u2013 Tuesday, Apr 27, 2027 (outside Eretz Yisroel).', until: '2027-04-27' }],
      hoursNote: 'Listings, hours and prices come from the Sukkos guide. Pesach hours can be different, so check before you go.',
      copyTitle: 'My Chol Hamoed Pesach list'
    },
    {
      id: 'sukkos', until: '9999-12-31',
      label: 'Chol Hamoed Sukkos', short: 'Sukkos', yi: 'חול המועד סוכות', icon: '\u2618',
      title: 'Chol Hamoed Outing Finder', brandYi: 'חול המועד',
      eyebrow: 'Your Chol Hamoed starts here', eyebrowYi: 'חול המועד סוכות תשפ״ז',
      h1: 'A day to <em>remember.</em>', sub: 'Find your next family adventure.',
      lede: 'places from the Navigation guide, with photos, family reviews, hours, prices and drive times from your community.',
      copyTitle: 'My Chol Hamoed list', base: true
    }
  ];
  var byId = {}; SEASONS.forEach(function (s) { byId[s.id] = s; });
  var today = new Date(); var iso = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
  var asked = null;
  try { asked = new URLSearchParams(location.search).get('season'); } catch (e) {}
  if (asked) asked = asked.toLowerCase().replace(/^(sukkot|succos|sukkos)$/, 'sukkos').replace(/^(passover|pesah)$/, 'pesach');
  var dflt = SEASONS.filter(function (s) { return s.until >= iso; })[0] || byId.sukkos;
  var cur = (asked && byId[asked]) || dflt;
  cur.isDefault = cur === dflt;
  window.SEASONS = SEASONS; window.SEASON = cur; window.SEASON_DEFAULT = dflt.id; window.SEASON_TODAY = iso;
  document.documentElement.setAttribute('data-season', cur.id);
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
    if (s.id === 'winter' && $('heroq')) $('heroq').placeholder = 'Search outings: ice skating, bowling, museum\u2026';
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
