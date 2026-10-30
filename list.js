(function () {
  'use strict';
  var C = window.WORLD_CONFIG || {};
  var URL_ = String(C.supabaseUrl || '').replace(/\/+$/, '');
  var KEY = String(C.supabaseAnonKey || '');
  var LIVE = !!(URL_ && KEY);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function headers() {
    var h = { apikey: KEY, 'Content-Type': 'application/json' };
    if (!/^sb_/.test(KEY)) h.Authorization = 'Bearer ' + KEY;
    return h;
  }

  /* tabs */
  var tabs = $$('[role=tab]');
  function show(id) {
    tabs.forEach(function (t) {
      var on = t.id === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.id); history.replaceState(null, '', t.id === 't-ad' ? '#advertise' : '#add'); }); });
  if (location.hash === '#advertise') show('t-ad');

  /* banner: coming soon / email confirmation result */
  var banner = $('#banner');
  var q = new URLSearchParams(location.search).get('confirm');
  var msgs = {
    live: ['Thank you! Your email is confirmed and your listing is live.', ''],
    review: ['Thank you! Your email is confirmed. We\u2019ll review the listing shortly.', ''],
    done: ['This listing was already handled. Thank you!', ''],
    used: ['This link was already used.', 'warn'],
    expired: ['This link expired. Please submit again.', 'warn'],
    bad: ['This link isn\u2019t valid.', 'bad']
  };
  if (q && msgs[q]) { banner.textContent = msgs[q][0]; banner.className = 'note ' + msgs[q][1]; banner.hidden = false; }
  else if (!LIVE) { banner.innerHTML = '<strong>Coming soon.</strong> Submissions open shortly.'; banner.hidden = false; }

  if (!LIVE) $$('[data-submit]').forEach(function (b) { b.disabled = true; b.textContent = 'Coming soon'; });

  /* cities */
  fetch('data/world-city-list.json').then(function (r) { return r.json(); }).then(function (list) {
    var byRegion = {};
    list.forEach(function (c) { (byRegion[c.region || 'Other'] = byRegion[c.region || 'Other'] || []).push(c); });
    $$('select[data-cities]').forEach(function (sel) {
      var html = '<option value="">Choose a city…</option>';
      if (sel.hasAttribute('data-all')) html += '<option value="all">All cities</option>';
      Object.keys(byRegion).forEach(function (r) {
        html += '<optgroup label="' + esc(r) + '">' + byRegion[r].map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.name) + (c.country && c.name.indexOf(c.country) < 0 ? ', ' + esc(c.country) : '') + '</option>';
        }).join('') + '</optgroup>';
      });
      html += '<optgroup label="Not listed"><option value="other">Other (say which in the description)</option></optgroup>';
      sel.innerHTML = html;
    });
  }).catch(function () {
    $$('select[data-cities]').forEach(function (sel) { sel.innerHTML = '<option value="other">Other (say which in the description)</option>'; });
  });

  /* type-dependent fields */
  var fAdd = $('#f-add');
  function syncType() {
    var t = fAdd.type.value;
    $$('[data-for]', fAdd).forEach(function (el) { el.hidden = el.getAttribute('data-for') !== t; });
    $$('[data-not]', fAdd).forEach(function (el) { el.hidden = el.getAttribute('data-not') === t; });
    if (t === 'mikvah_women') fAdd.address.value = '';
  }
  fAdd.type.addEventListener('change', syncType);
  syncType();

  /* counters */
  $$('[data-count]').forEach(function (c) {
    var f = c.closest('label').querySelector('textarea');
    var max = f.maxLength;
    var up = function () { c.textContent = f.value.length + '/' + max; };
    f.addEventListener('input', up); up();
  });

  /* submit */
  function validate(form) {
    var bad = [];
    ['name', 'city_id', 'contact_email', 'type'].forEach(function (n) { if (form[n] && !String(form[n].value).trim()) bad.push(n); });
    if (form.phone && !form.phone.closest('label').hidden && !form.phone.value.trim()) bad.push('phone');
    if (form.contact_email.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contact_email.value.trim())) bad.push('contact_email');
    if (form.website && form.website.value.trim() && !/^(https?:\/\/)?[^\s.]+\.[^\s]+$/i.test(form.website.value.trim())) bad.push('website');
    bad.forEach(function (n) { form[n].setAttribute('aria-invalid', 'true'); });
    if (bad.length) form[bad[0]].focus();
    return !bad.length;
  }
  function payload(form) {
    var o = {};
    $$('input,select,textarea', form).forEach(function (el) {
      if (!el.name || el.closest('[hidden]')) return;
      var v = el.value.trim();
      if (v) o[el.name] = v;
    });
    if (o.website && !/^https?:\/\//i.test(o.website)) o.website = 'https://' + o.website;
    if (o.type === 'mikvah_women') delete o.address;
    return o;
  }
  function resultHtml(r) {
    var labels = {
      website: 'No valid website', website_live: 'Website didn\u2019t load', website_name: 'Name not on the website',
      website_phone: 'Phone not on the website', email_domain: 'Email isn\u2019t on the website\u2019s domain'
    };
    if (r.status === 'published') return '<div class="note">Verified and live. Thank you!</div>';
    if (r.status === 'awaiting_email') return '<div class="note">Almost done: open the link we just emailed you to go live.</div>';
    var why = (r.failed || []).filter(function (f) { return labels[f.check]; }).map(function (f) { return '<li>' + esc(labels[f.check]) + '</li>'; }).join('');
    return '<div class="note">Thank you! We\u2019ll review it shortly.' + (why ? '<ul>' + why + '</ul>' : '') + '</div>';
  }
  async function submit(form, e) {
    e.preventDefault();
    if (!LIVE) return;
    $$('[aria-invalid]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
    if (!validate(form)) return;
    var body = payload(form);
    if (body.hp) return;
    var btn = $('[data-submit]', form), st = $('[data-status]', form), out = $('[data-result]', form);
    btn.disabled = true; st.textContent = 'Checking…'; out.innerHTML = '';
    try {
      var r = await fetch(URL_ + '/functions/v1/verify-listing', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        if (r.status === 400 || r.status === 429) throw Object.assign(new Error(j.error || 'Error'), { user: true });
        throw new Error('fn ' + r.status);
      }
      out.innerHTML = resultHtml(j);
      form.reset(); syncType();
    } catch (err) {
      if (err && err.user) { out.innerHTML = '<div class="note bad">' + esc(err.message) + '</div>'; }
      else {
        // fallback: save straight to the pending table so nothing is lost; admin reviews it
        try {
          var h = headers(); h.Prefer = 'return=minimal';
          delete body.hp;
          var r2 = await fetch(URL_ + '/rest/v1/listings_pending', { method: 'POST', headers: h, body: JSON.stringify(body) });
          if (!r2.ok) throw new Error('rest ' + r2.status);
          out.innerHTML = resultHtml({ status: 'pending', failed: [] });
          form.reset(); syncType();
        } catch (e2) {
          out.innerHTML = '<div class="note bad">Couldn\u2019t send right now. Please try again later.</div>';
        }
      }
    } finally {
      btn.disabled = false; st.textContent = '';
    }
  }
  fAdd.addEventListener('submit', function (e) { submit(fAdd, e); });
  var fAd = $('#f-ad');
  fAd.addEventListener('submit', function (e) { submit(fAd, e); });
})();
