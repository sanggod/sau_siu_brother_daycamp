/* 愁哥哥同笑弟弟 — shared game state.
   Firebase Realtime Database when firebase-config.js has a databaseURL,
   otherwise a local BroadcastChannel + localStorage fallback (one machine). */
(function () {
  var N = 40, COLS = 5, ROWS = 8, PATH = 'flipgame/v1';

  var CFG = { min: 120, max: 180, magic: true };

  var EFFECTS = [
    { id: 'none',   w: 60, name: '翻一格',     desc: '笑弟弟出現，計時開始。',     tone: 'plain' },
    { id: 'spread', w: 8,  name: '傳染笑',     desc: '隔籬格都忍唔住一齊笑。',     tone: 'good' },
    { id: 'triple', w: 8,  name: '大笑三聲',   desc: '另外三格隨機一齊翻開。',     tone: 'good' },
    { id: 'long',   w: 7,  name: '笑到停唔到', desc: '這格的計時加倍。',           tone: 'good' },
    { id: 'row',    w: 3,  name: '全村一齊笑', desc: '整整一行五格翻開。',         tone: 'good' },
    { id: 'gloom',  w: 6,  name: '愁雲密佈',   desc: '一格已翻開的翻返愁哥哥。',   tone: 'bad' },
    { id: 'half',   w: 5,  name: '笑得唔夠久', desc: '兩格的計時剩返一半。',       tone: 'bad' },
    { id: 'regret', w: 3,  name: '愁哥哥反悔', desc: '唔翻，仲要收返一格。',       tone: 'bad' }
  ];

  function pickEffect() {
    if (!CFG.magic) return EFFECTS[0];
    var total = 0, i;
    for (i = 0; i < EFFECTS.length; i++) total += EFFECTS[i].w;
    var r = Math.random() * total;
    for (i = 0; i < EFFECTS.length; i++) { r -= EFFECTS[i].w; if (r <= 0) return EFFECTS[i]; }
    return EFFECTS[0];
  }
  function baseDur() {
    var lo = CFG.min * 1000, hi = Math.max(CFG.max * 1000, lo + 1000);
    return Math.round(lo + Math.random() * (hi - lo));
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function neighbours(n) {
    var c = (n - 1) % COLS, r = Math.floor((n - 1) / COLS), out = [];
    if (r > 0) out.push(n - COLS);
    if (r < ROWS - 1) out.push(n + COLS);
    if (c > 0) out.push(n - 1);
    if (c < COLS - 1) out.push(n + 1);
    return out;
  }

  function empty() { return { round: 1, boxes: {}, draws: [], seq: 0 }; }
  function norm(s) {
    s = s || {};
    return { round: s.round || 1, boxes: s.boxes || {}, draws: s.draws || [], seq: s.seq || 0, last: s.last || null, wonAt: s.wonAt || 0 };
  }
  function prune(st, now) {
    var b = {};
    for (var k in st.boxes) { var x = st.boxes[k]; if (x && x.at + x.dur > now) b[k] = x; }
    st.boxes = b;
  }

  function applyDraw(cur) {
    var now = Date.now(), st = norm(cur);
    prune(st, now);
    var n = 1 + Math.floor(Math.random() * N);
    var eff = pickEffect(), extra = [], i, k, ks;

    function flip(m, d) { st.boxes[m] = { at: now, dur: d || baseDur() }; }
    function takeOne(skip) {
      ks = Object.keys(st.boxes).filter(function (x) { return +x !== skip; });
      if (!ks.length) return 0;
      k = ks[Math.floor(Math.random() * ks.length)];
      delete st.boxes[k];
      return +k;
    }

    if (eff.id === 'none') flip(n);
    else if (eff.id === 'spread') { flip(n); neighbours(n).forEach(function (m) { flip(m); extra.push(m); }); }
    else if (eff.id === 'triple') {
      flip(n);
      var pool = [];
      for (i = 1; i <= N; i++) if (i !== n && !st.boxes[i]) pool.push(i);
      shuffle(pool).slice(0, 3).forEach(function (m) { flip(m); extra.push(m); });
    }
    else if (eff.id === 'long') flip(n, Math.round(baseDur() * 2));
    else if (eff.id === 'row') {
      var row = Math.floor((n - 1) / COLS);
      for (i = 0; i < COLS; i++) { var m = row * COLS + i + 1; flip(m); if (m !== n) extra.push(m); }
    }
    else if (eff.id === 'gloom') { flip(n); var g = takeOne(n); if (g) extra.push(-g); }
    else if (eff.id === 'half') {
      flip(n);
      ks = Object.keys(st.boxes).filter(function (x) { return +x !== n; });
      shuffle(ks).slice(0, 2).forEach(function (key) {
        var b = st.boxes[key], rem = b.at + b.dur - now;
        b.dur = b.dur - Math.max(0, Math.round(rem / 2) - 15000);
        extra.push(-(+key));
      });
    }
    else if (eff.id === 'regret') { var u = takeOne(0); if (u) extra.push(-u); }

    st.seq = (st.seq || 0) + 1;
    var rec = {
      id: st.seq, n: n, at: now, eff: eff.id, name: eff.name, desc: eff.desc,
      tone: eff.tone, kept: eff.id !== 'regret', extra: extra.join(',')
    };
    st.last = rec;
    st.draws = [rec].concat(st.draws || []).slice(0, 10);
    if (Object.keys(st.boxes).length >= N && !st.wonAt) st.wonAt = now;
    if (Object.keys(st.boxes).length < N) st.wonAt = 0;
    return st;
  }

  var listeners = [], state = empty(), impl = null, online = true;
  function emit() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state); } catch (e) {} } }
  function set(s) { state = norm(s); emit(); }

  function useLocal() {
    var KEY = 'flipgame.state.v1';
    var bc = ('BroadcastChannel' in window) ? new BroadcastChannel('flipgame') : null;
    function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} if (bc) bc.postMessage(s); }
    if (bc) bc.onmessage = function (e) { set(e.data); };
    window.addEventListener('storage', function (e) { if (e.key === KEY) set(read()); });
    impl = {
      mode: 'local',
      draw: function () { var s = applyDraw(read()); write(s); set(s); },
      reset: function () { var s = empty(); s.round = (norm(read()).round || 1) + 1; write(s); set(s); }
    };
    set(read() || empty());
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function useFirebase(cfg) {
    var v = '10.12.5', base = 'https://www.gstatic.com/firebasejs/' + v + '/';
    await loadScript(base + 'firebase-app-compat.js');
    await loadScript(base + 'firebase-database-compat.js');
    firebase.initializeApp(cfg);
    var db = firebase.database(), ref = db.ref(PATH);
    ref.on('value', function (snap) { set(snap.val()); });
    db.ref('.info/connected').on('value', function (s) { online = !!s.val(); emit(); });
    impl = {
      mode: 'firebase',
      draw: function () { ref.transaction(function (cur) { return applyDraw(cur); }); },
      reset: function () { ref.transaction(function (cur) { var s = empty(); s.round = ((cur && cur.round) || 1) + 1; return s; }); }
    };
  }

  var ready = (async function () {
    var cfg = null;
    try { cfg = (await import('./firebase-config.js')).default; } catch (e) {}
    if (cfg && cfg.databaseURL) {
      try { await useFirebase(cfg); return; }
      catch (e) { console.warn('[FlipSync] firebase failed, local mode', e); }
    }
    useLocal();
  })();

  window.FlipSync = {
    N: N, COLS: COLS, ROWS: ROWS, EFFECTS: EFFECTS, ready: ready,
    configure: function (o) { if (o) { if (o.min) CFG.min = o.min; if (o.max) CFG.max = o.max; if (o.magic !== undefined) CFG.magic = !!o.magic; } },
    onState: function (f) { listeners.push(f); f(state); return function () { listeners = listeners.filter(function (x) { return x !== f; }); }; },
    draw: function () { if (impl) impl.draw(); },
    reset: function () { if (impl) impl.reset(); },
    prune: prune,
    get mode() { return impl ? impl.mode : 'booting'; },
    get online() { return impl && impl.mode === 'firebase' ? online : true; }
  };
})();
