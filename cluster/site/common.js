// Site page: the version, pod and node come from the pod itself (/info) through the platform gateway.
(function () {
  var $ = function (i) { return document.getElementById(i); };
  var set = function (i, v) { var e = $(i); if (e) e.textContent = v; };
  var reloading = false;
  function reload() { reloading = true; location.reload(); }
  // the tab was closed: tell the platform, which deletes the instance pod after a few seconds
  // (a reload comes back sooner and cancels the deletion)
  window.addEventListener('pagehide', function () { if (!reloading) navigator.sendBeacon('bye'); });

  // ── language: chosen in the shell (localStorage dp-lang, same origin); reason texts arrive from the platform already translated
  var DICT = {
    ru: { strategy: 'Стратегия', header: 'Заголовок', pod: 'Под', node: 'Нода', why: 'Почему так', orders: 'Заказов сегодня (счётчик этого пода):',
      loading: 'загрузка…', lastReq: 'последний запрос: {code} · {ms} ms', error: 'ошибка: {msg} — перезагрузка…', guest: 'гость',
      odd: 'X-Beta: {b} (ID {id} нечётный → получает обновление)', even: 'X-Beta: {b} (ID {id} чётный → остаётся на старой)' },
    en: { strategy: 'Strategy', header: 'Header', pod: 'Pod', node: 'Node', why: 'Why', orders: 'Orders today (this pod’s counter):',
      loading: 'loading…', lastReq: 'last request: {code} · {ms} ms', error: 'error: {msg} — reloading…', guest: 'guest',
      odd: 'X-Beta: {b} (ID {id} is odd → gets the update)', even: 'X-Beta: {b} (ID {id} is even → stays on the old one)' },
    de: { strategy: 'Strategie', header: 'Header', pod: 'Pod', node: 'Node', why: 'Warum', orders: 'Bestellungen heute (Zähler dieses Pods):',
      loading: 'lädt …', lastReq: 'letzte Anfrage: {code} · {ms} ms', error: 'Fehler: {msg} — wird neu geladen …', guest: 'Gast',
      odd: 'X-Beta: {b} (ID {id} ist ungerade → erhält das Update)', even: 'X-Beta: {b} (ID {id} ist gerade → bleibt auf der alten)' }
  };
  function lang() {
    var l = 'en';
    try { l = localStorage.getItem('dp-lang') || ''; } catch (e) {}
    return DICT[l] ? l : 'en';
  }
  function tr(key, params) {
    var s = DICT[lang()][key] || DICT.en[key] || key;
    return s.replace(/\{(\w+)\}/g, function (_, n) { return params && n in params ? params[n] : '{' + n + '}'; });
  }
  function labels() {
    document.documentElement.lang = lang();
    var nodes = document.querySelectorAll('[data-i]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = tr(nodes[i].getAttribute('data-i'));
  }
  window.addEventListener('storage', function (e) { if (e.key === 'dp-lang') { labels(); if (info) render(hdr); } });

  // user emulation: X-Beta: true when the ID is odd (a numeric ID by value, a name by the sum of its character codes)
  function isBeta(id) {
    id = String(id || '').trim();
    if (/^\d+$/.test(id)) return Number(id) % 2 === 1;
    var s = 0, i, cs = id.toLowerCase();
    for (i = 0; i < cs.length; i++) s += cs.charCodeAt(i);
    return s % 2 === 1;
  }
  var userId = null;
  var info = null, epoch0 = null, site = { versions: [] }, lineIdx = 0, lastSwap = 0, lastStatus = null;

  var FALLBACK = { id: '?', title: 'Shop', greeting: '…', desc: '', color: '#64748b',
    dynTitle: '', dynLines: '…', dynSeconds: 3 };

  function ver() {
    var vs = site.versions || [];
    var id = info && info.version;
    return vs.filter(function (v) { return v.id === id; })[0] || FALLBACK;
  }
  function lines() {
    var l = String(ver().dynLines || '').split('\n').filter(Boolean);
    return l.length ? l : ['—'];
  }

  function render(hdr) {
    var v = ver();
    document.documentElement.style.setProperty('--c', v.color);
    document.title = v.title + ' · ' + (info ? info.version : '');
    set('title', v.title);
    set('version', info ? info.version : '…');
    set('greeting', String(v.greeting).replace('{name}', hdr.user || tr('guest')));
    set('desc', v.desc);
    set('dyn-title', v.dynTitle);
    if (info) { set('pod', info.pod); set('node', info.node); set('counter', String(info.orders)); }
    set('strategy', hdr.strategy || '');
    set('reason', hdr.reason || '');
    var beta = isBeta(userId);
    set('beta', tr(beta ? 'odd' : 'even', { b: beta, id: userId || 'anonymous' }));
    if (lastStatus) set('status', lastStatus.err ? tr('error', { msg: lastStatus.err }) : tr('lastReq', { code: 200, ms: lastStatus.ms }));
  }

  var hdr = {};
  function readHeaders(r) {
    var reason = r.headers.get('x-reason');
    hdr = {
      epoch: r.headers.get('x-epoch'),
      strategy: r.headers.get('x-strategy'),
      reason: reason ? decodeURIComponent(reason) : '',
      user: decodeURIComponent(r.headers.get('x-user') || ''),
      pod: r.headers.get('x-pod'),
    };
  }

  function beat() {
    var t0 = performance.now();
    // the user ID comes from the first gateway response (x-user); after that every request carries X-Beta
    var headers = userId === null ? {} : { 'X-Beta': String(isBeta(userId)) };
    fetch('info', { cache: 'no-store', headers: headers }).then(function (r) {
      if (r.status >= 500) throw new Error('HTTP ' + r.status);
      readHeaders(r);
      userId = hdr.user === 'anonymous' ? '' : hdr.user;
      return r.json();
    }).then(function (j) {
      info = j;
      if (epoch0 === null) epoch0 = hdr.epoch;
      // the strategy changed or the pod we sat on is gone — a reload means routing again
      else if (hdr.epoch !== epoch0 || j.pod !== firstPod) { reload(); return; }
      if (!firstPod) firstPod = j.pod;
      lastStatus = { ms: Math.round(performance.now() - t0) };
      render(hdr);
    }).catch(function (e) {
      lastStatus = { err: e.message };
      set('status', tr('error', { msg: e.message }));
      setTimeout(reload, 1500);
    });
  }
  var firstPod = null;

  function loadSite() {
    fetch('/api/site', { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (s) { site = s; if (info) render(hdr); }).catch(function () {});
  }

  function dynamic() {
    set('clock', new Date().toLocaleTimeString(lang()));
    var v = ver();
    if (Date.now() - lastSwap >= (v.dynSeconds || 3) * 1000) {
      lastSwap = Date.now();
      lineIdx = (lineIdx + 1) % lines().length;
      var t = $('ticker');
      if (t) { t.style.opacity = 0; setTimeout(function () { t.textContent = lines()[lineIdx % lines().length]; t.style.opacity = 1; }, 200); }
    }
  }

  labels(); loadSite(); beat();
  setInterval(beat, 2000);
  setInterval(loadSite, 2000);
  setInterval(dynamic, 1000);
})();
