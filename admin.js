(function () {
  'use strict';
  var C = window.WORLD_CONFIG || {};
  var URL_ = String(C.supabaseUrl || '').replace(/\/+$/, '');
  var KEY = String(C.supabaseAnonKey || '');
  var ADMIN = String(C.adminEmail || '').trim().toLowerCase();
  var SKEY = 'of_admin_session';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var TYPE = { hotel: 'Hotel', shul: 'Shul', restaurant: 'Kosher food', mikvah_men: 'Mikvah (men)', mikvah_women: 'Mikvah (women)', chabad: 'Chabad house', car_service: 'Car service', sponsor: 'Sponsored request' };
  var cityName = {};
  var session = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function msg(t, kind) { var m = $('#msg'); m.textContent = t || ''; m.className = 'note ' + (kind || 'warn'); m.hidden = !t; }
  function safeLink(u) { return /^https?:\/\//i.test(u || '') ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>' : esc(u); }
  function fmtDate(s) { try { return new Date(s).toLocaleString(); } catch (e) { return s; } }

  if (!URL_ || !KEY || !ADMIN) {
    msg('Coming soon: the admin area is not set up yet (see backend/README.md).');
    return;
  }

  /* ---------- auth (Supabase Auth REST, no external script) ---------- */
  function authHeaders(tok) {
    var h = { apikey: KEY, 'Content-Type': 'application/json' };
    h.Authorization = 'Bearer ' + (tok || (/^sb_/.test(KEY) ? '' : KEY));
    if (h.Authorization === 'Bearer ') delete h.Authorization;
    return h;
  }
  function save(s) { session = s; if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); }
  function fromAuthResponse(j) {
    return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + Number(j.expires_in || 3600) };
  }
  async function refresh() {
    if (!session || !session.refresh_token) throw new Error('no session');
    var r = await fetch(URL_ + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ refresh_token: session.refresh_token }) });
    if (!r.ok) { save(null); throw new Error('session expired'); }
    save(fromAuthResponse(await r.json()));
  }
  async function token() {
    if (!session) throw new Error('signed out');
    if (session.expires_at - 60 < Date.now() / 1000) await refresh();
    return session.access_token;
  }
  async function api(path, opts) {
    opts = opts || {};
    var h = authHeaders(await token());
    if (opts.prefer) h.Prefer = opts.prefer;
    var r = await fetch(URL_ + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    var txt = await r.text();
    var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
    if (!r.ok) throw new Error((j && (j.message || j.error || j.msg)) || ('HTTP ' + r.status));
    return j;
  }
  var rest = function (p, o) { return api('/rest/v1/' + p, o); };

  async function whoAmI() {
    var r = await fetch(URL_ + '/auth/v1/user', { headers: authHeaders(await token()) });
    if (!r.ok) return null;
    return (await r.json()).email || null;
  }

  // magic-link return: tokens arrive in the URL hash
  (function readHash() {
    if (!location.hash || location.hash.indexOf('access_token=') < 0) {
      if (location.hash.indexOf('error') >= 0) msg('Sign-in link failed or expired. Try again.', 'bad');
      return;
    }
    var p = new URLSearchParams(location.hash.slice(1));
    save(fromAuthResponse({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') }));
    history.replaceState(null, '', location.pathname + location.search);
  })();
  if (!session) { try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { session = null; } }

  $('#f-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target, email = f.email.value.trim().toLowerCase(), pw = f.password.value, st = $('#login-st');
    if (email !== ADMIN) { st.textContent = 'This email is not the admin.'; return; }
    st.textContent = 'One moment…';
    try {
      if (pw) {
        var r = await fetch(URL_ + '/auth/v1/token?grant_type=password', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: email, password: pw }) });
        if (!r.ok) throw new Error('Wrong email or password.');
        save(fromAuthResponse(await r.json()));
        st.textContent = '';
        start();
      } else {
        var back = location.origin + location.pathname;
        var r2 = await fetch(URL_ + '/auth/v1/otp?redirect_to=' + encodeURIComponent(back), { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: email, create_user: false }) });
        if (!r2.ok) throw new Error('Could not send the link.');
        st.textContent = 'Check your email for the sign-in link.';
      }
    } catch (err) { st.textContent = err.message; }
  });
  $('#logout').addEventListener('click', async function () {
    try { await fetch(URL_ + '/auth/v1/logout', { method: 'POST', headers: authHeaders(session && session.access_token) }); } catch (e) { /* ignore */ }
    save(null); location.reload();
  });

  /* ---------- tabs ---------- */
  $$('[role=tab]').forEach(function (t) {
    t.addEventListener('click', function () {
      $$('[role=tab]').forEach(function (x) {
        var on = x === t; x.setAttribute('aria-selected', on ? 'true' : 'false');
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
    });
  });

  /* ---------- cities ---------- */
  var citiesReady = fetch('data/world-city-list.json').then(function (r) { return r.json(); }).then(function (list) {
    list.forEach(function (c) { cityName[c.id] = c.name; });
    $$('select[data-cities]').forEach(function (sel) {
      sel.innerHTML = '<option value="all">All cities</option>' + list.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    });
  }).catch(function () {});
  function city(id) { return id === 'all' ? 'All cities' : (cityName[id] || id || ''); }

  /* ---------- pending ---------- */
  var FIELDS = ['name', 'city_id', 'address', 'phone', 'website', 'contact_email', 'description', 'minyan_times', 'kashrus'];
  var pending = [];
  function details(r) {
    var rows = [['City', city(r.city_id)], ['Address', r.address], ['Phone', r.phone], ['Website', r.website], ['Email', r.contact_email],
      ['Minyan', r.minyan_times], ['Kashrus', r.kashrus], ['About', r.description]];
    return '<dl class="kv">' + rows.filter(function (x) { return x[1]; }).map(function (x) {
      return '<dt>' + x[0] + '</dt><dd>' + (x[0] === 'Website' ? safeLink(x[1]) : esc(x[1])) + '</dd>';
    }).join('') + '</dl>';
  }
  function pendingCard(r) {
    var chips = (r.failed_checks || []).map(function (f) { return '<span class="chip bad" title="' + esc(f.check) + '">' + esc(f.note) + '</span>'; }).join('');
    if (!r.checked_at) chips += '<span class="chip">Not checked yet</span>';
    if (r.status === 'awaiting_email') chips += '<span class="chip">Waiting for email click</span>';
    var btns = r.type === 'sponsor'
      ? '<button class="btn small" data-act="sponsor">Make sponsor</button>'
      : '<button class="btn small" data-act="approve">Approve</button><button class="btn ghost small" data-act="edit">Edit</button><button class="btn ghost small" data-act="recheck">Re-check</button>';
    return '<div class="row" data-id="' + esc(r.id) + '"><h3>' + esc(r.name) + '</h3>' +
      '<div class="meta">' + esc(TYPE[r.type] || r.type) + ' · ' + esc(city(r.city_id)) + ' · ' + esc(fmtDate(r.created_at)) + '</div>' +
      '<div class="chips">' + chips + '</div><div data-body>' + details(r) + '</div>' +
      '<div class="actions">' + btns + '<button class="btn bad small" data-act="reject">Reject</button></div></div>';
  }
  async function loadPending() {
    var el = $('#pending-list');
    try {
      pending = await rest('listings_pending?status=in.(pending,awaiting_email)&order=created_at.desc&limit=200&select=*');
      $('#n-pending').textContent = pending.length ? '(' + pending.length + ')' : '';
      el.innerHTML = pending.length ? pending.map(pendingCard).join('') : '<p class="small">Nothing waiting.</p>';
    } catch (e) { el.innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; }
  }
  function editForm(r) {
    var f = function (n, label, ta) {
      if (n === 'address' && r.type === 'mikvah_women') return '';
      if (n === 'minyan_times' && r.type !== 'shul') return '';
      if (n === 'kashrus' && r.type !== 'restaurant') return '';
      var v = esc(r[n] || '');
      return '<label class="' + (ta ? 'span2' : '') + '">' + label + (ta ? '<textarea name="' + n + '">' + v + '</textarea>' : '<input name="' + n + '" value="' + v + '">') + '</label>';
    };
    return '<form class="grid two" data-edit>' + f('name', 'Name') + f('city_id', 'City id') + f('address', 'Address') + f('phone', 'Phone') +
      f('website', 'Website') + f('contact_email', 'Email') + f('minyan_times', 'Minyan times', 1) + f('kashrus', 'Kashrus') + f('description', 'Description', 1) +
      '<div class="actions span2"><button class="btn small" type="submit">Save</button><button class="btn ghost small" type="button" data-act="cancel">Cancel</button></div></form>';
  }
  $('#pending-list').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var card = b.closest('[data-id]'), id = card.getAttribute('data-id');
    var r = pending.find(function (x) { return x.id === id; });
    var act = b.getAttribute('data-act');
    try {
      if (act === 'approve') { b.disabled = true; await rest('rpc/publish_listing', { method: 'POST', body: { p_id: id, p_by: 'admin' } }); msg('Approved: ' + r.name, ''); await loadPending(); }
      else if (act === 'reject') { if (!confirm('Reject "' + r.name + '"?')) return; await rest('listings_pending?id=eq.' + id, { method: 'PATCH', body: { status: 'rejected', decided_at: new Date().toISOString() }, prefer: 'return=minimal' }); await loadPending(); }
      else if (act === 'recheck') {
        b.disabled = true; b.textContent = 'Checking…';
        var res = await api('/functions/v1/verify-listing', { method: 'POST', body: { action: 'recheck', id: id, resendEmail: true } });
        msg('Re-check: ' + res.status, ''); await loadPending();
      }
      else if (act === 'edit') { $('[data-body]', card).innerHTML = editForm(r); }
      else if (act === 'cancel') { $('[data-body]', card).innerHTML = details(r); }
      else if (act === 'sponsor') { fillSponsor({ name: r.name, city_id: r.city_id, url: r.website, request_id: r.id, active: false }); $('#t-spons').click(); }
    } catch (err) { msg(err.message, 'bad'); b.disabled = false; }
  });
  $('#pending-list').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.target, id = form.closest('[data-id]').getAttribute('data-id'), body = {};
    FIELDS.forEach(function (n) { if (form[n]) body[n] = form[n].value.trim() || null; });
    try { await rest('listings_pending?id=eq.' + id, { method: 'PATCH', body: body, prefer: 'return=minimal' }); msg('Saved. Approve when ready.', ''); await loadPending(); }
    catch (err) { msg(err.message, 'bad'); }
  });

  /* ---------- live ---------- */
  var live = [];
  async function loadLive() {
    var el = $('#live-list');
    try {
      live = await rest('listings_live?order=created_at.desc&limit=500&select=*');
      el.innerHTML = live.length ? live.map(function (r) {
        return '<div class="row" data-id="' + esc(r.id) + '"><h3>' + esc(r.name) + '</h3><div class="meta">' + esc(TYPE[r.type]) + ' · ' + esc(city(r.city_id)) +
          ' · <span class="chip ok">' + (r.verified ? 'Verified ' + esc(r.verified_at || '') + ' (' + esc(r.verified_by || '') + ')' : 'Not verified') + '</span></div>' + details(r) +
          '<div class="actions"><button class="btn bad small" data-act="remove">Remove</button></div></div>';
      }).join('') : '<p class="small">No live listings yet.</p>';
    } catch (e) { el.innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; }
  }
  $('#live-list').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-act=remove]'); if (!b) return;
    var id = b.closest('[data-id]').getAttribute('data-id');
    if (!confirm('Remove this listing from the site?')) return;
    try { await rest('listings_live?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' }); await loadLive(); } catch (err) { msg(err.message, 'bad'); }
  });

  /* ---------- sponsors ---------- */
  var sponsors = [], fs = $('#f-sp');
  function fillSponsor(s) {
    fs.reset();
    ['id', 'request_id', 'name', 'city_id', 'text', 'url', 'start_date', 'end_date'].forEach(function (n) { if (s[n] != null) fs[n].value = s[n]; });
    fs.active.checked = !!s.active;
    $('#sp-title').textContent = s.id ? 'Edit sponsor' : 'Add sponsor';
    $('#sp-count').textContent = fs.text.value.length + '/120';
    fs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  fs.text.addEventListener('input', function () { $('#sp-count').textContent = fs.text.value.length + '/120'; });
  $('#sp-clear').addEventListener('click', function () { fs.reset(); fs.id.value = ''; fs.request_id.value = ''; $('#sp-title').textContent = 'Add sponsor'; });
  async function loadSponsors() {
    var el = $('#sp-list');
    try {
      sponsors = await rest('sponsors?order=created_at.desc&select=*');
      el.innerHTML = sponsors.length ? sponsors.map(function (s) {
        return '<div class="row" data-id="' + esc(s.id) + '"><h3>' + esc(s.name) + ' <span class="chip ' + (s.active ? 'ok' : '') + '">' + (s.active ? 'On' : 'Off') + '</span></h3>' +
          '<div class="meta">' + esc(s.city_id === 'all' ? 'All cities' : city(s.city_id)) + (s.start_date || s.end_date ? ' · ' + esc(s.start_date || '…') + ' → ' + esc(s.end_date || '…') : '') + '</div>' +
          '<p style="margin:6px 0">' + esc(s.text) + '</p><div class="meta">' + safeLink(s.url) + '</div>' +
          '<div class="actions"><button class="btn ghost small" data-act="edit">Edit</button><button class="btn small" data-act="toggle">' + (s.active ? 'Turn off' : 'Turn on') + '</button><button class="btn bad small" data-act="del">Delete</button></div></div>';
      }).join('') : '<p class="small">No sponsors yet.</p>';
    } catch (e) { el.innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; }
  }
  $('#sp-list').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var id = b.closest('[data-id]').getAttribute('data-id'), s = sponsors.find(function (x) { return x.id === id; }), act = b.getAttribute('data-act');
    try {
      if (act === 'edit') fillSponsor(s);
      else if (act === 'toggle') { await rest('sponsors?id=eq.' + id, { method: 'PATCH', body: { active: !s.active }, prefer: 'return=minimal' }); await loadSponsors(); }
      else if (act === 'del') { if (!confirm('Delete sponsor "' + s.name + '"?')) return; await rest('sponsors?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' }); await loadSponsors(); }
    } catch (err) { msg(err.message, 'bad'); }
  });
  fs.addEventListener('submit', async function (e) {
    e.preventDefault();
    var st = $('#sp-st');
    var body = {
      name: fs.name.value.trim(), city_id: fs.city_id.value || 'all', text: fs.text.value.trim().slice(0, 120),
      url: fs.url.value.trim() || null, active: fs.active.checked,
      start_date: fs.start_date.value || null, end_date: fs.end_date.value || null
    };
    if (body.url && !/^https?:\/\//i.test(body.url)) body.url = 'https://' + body.url;
    if (!body.name || !body.text) { st.textContent = 'Name and text are needed.'; return; }
    try {
      if (fs.id.value) await rest('sponsors?id=eq.' + fs.id.value, { method: 'PATCH', body: body, prefer: 'return=minimal' });
      else {
        if (fs.request_id.value) body.request_id = fs.request_id.value;
        await rest('sponsors', { method: 'POST', body: body, prefer: 'return=minimal' });
        if (body.request_id) await rest('listings_pending?id=eq.' + body.request_id, { method: 'PATCH', body: { status: 'approved', decided_at: new Date().toISOString() }, prefer: 'return=minimal' });
      }
      st.textContent = 'Saved.'; $('#sp-clear').click(); await Promise.all([loadSponsors(), loadPending()]);
    } catch (err) { st.textContent = err.message; }
  });

  /* ---------- start ---------- */
  async function start() {
    if (!session) { $('#login').hidden = false; return; }
    try {
      var email = await whoAmI();
      if (!email || email.toLowerCase() !== ADMIN) { save(null); msg('This account is not the admin.', 'bad'); $('#login').hidden = false; return; }
      $('#login').hidden = true; $('#app').hidden = false; $('#who').textContent = 'Signed in as ' + email;
      await citiesReady;
      await Promise.all([loadPending(), loadLive(), loadSponsors()]);
    } catch (e) { save(null); $('#login').hidden = false; }
  }
  start();
})();
