/* 愁哥哥同笑弟弟 — shared game state.
   Firebase Realtime Database when firebase-config.js has a databaseURL,
   otherwise a local BroadcastChannel + localStorage fallback (one machine).

   Box keys are stored as "b1".."b40" rather than "1".."40" on purpose:
   Realtime Database silently coerces an object whose keys are integers into a
   sparse ARRAY, which would hand the draw logic null holes to pick from. */
(function () {
  var N = 40, COLS = 5, ROWS = 8, PATH = 'flipgame/v1';
  var FB_VERSION = '10.12.5';

  /* Seeded from settings.js on boot. It is only ever the DEFAULT for a fresh
     game: once a round carries a cfg the shared copy wins, because the draw
     runs on whichever phone pressed the button and eight phones disagreeing
     about the timer length would be chaos. /admin edits the shared copy. */
  var CFG = { min: 120, max: 180, magic: true, negative: true, miss: true, timers: true };

  var EFFECTS = [
    { id: 'none',   w: 60, name: '翻一格',     desc: '笑弟弟出嚟喇，開始計時。',   tone: 'plain' },
    { id: 'spread', w: 8,  name: '傳染笑',     desc: '隔籬四格都忍唔住一齊笑。',   tone: 'good' },
    { id: 'triple', w: 8,  name: '大笑三聲',   desc: '仲有另外三格一齊翻開。',     tone: 'good' },
    { id: 'long',   w: 7,  name: '笑到停唔到', desc: '呢格可以笑耐多一倍。',       tone: 'good' },
    { id: 'row',    w: 3,  name: '全村一齊笑', desc: '成行五格一齊翻開。',         tone: 'good' },
    { id: 'gloom',  w: 6,  name: '愁雲密佈',   desc: '收返一格，變返愁哥哥。',     tone: 'bad' },
    { id: 'half',   w: 5,  name: '笑得唔夠久', desc: '兩格嘅時間剩返一半。',       tone: 'bad' },
    { id: 'regret', w: 3,  name: '愁哥哥反悔', desc: '唔翻住，仲要收返一格。',     tone: 'bad' }
  ];

  /* Not a 魔法 — you cannot roll it. It is what a draw is called when the wheel
     lands on one of the decoy numbers (see DECOY_RATE below). */
  var MISS = { id: 'miss', name: '食白果', desc: '呢格已經喺度笑緊，今次冇格翻。', tone: 'bad' };

  /* The wheel is mostly the boxes still showing 愁哥哥, but a few numbers that
     are already laughing go in as decoys — a wheel that can only ever land on a
     grey square reads as rigged. Landing on a decoy is a miss: nothing flips,
     nothing re-times. ~6% of what is left, and never zero while anything is
     open, so the last square is still a gamble. */
  var DECOY_RATE = 0.06;

  function key(n) { return 'b' + n; }
  function num(k) { return +String(k).slice(1); }

  function effectById(id) {
    if (id === 'miss') return MISS;
    for (var i = 0; i < EFFECTS.length; i++) if (EFFECTS[i].id === id) return EFFECTS[i];
    return null;
  }
  function pickEffect(cfg) {
    if (!cfg.magic) return EFFECTS[0];
    var pool = [], i;
    for (i = 0; i < EFFECTS.length; i++) {
      if (cfg.negative || EFFECTS[i].tone !== 'bad') pool.push(EFFECTS[i]);
    }
    var total = 0;
    for (i = 0; i < pool.length; i++) total += pool[i].w;
    var r = Math.random() * total;
    for (i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) return pool[i]; }
    return EFFECTS[0];
  }
  function baseDur(cfg) {
    var lo = cfg.min * 1000, hi = Math.max(cfg.max * 1000, lo + 1000);
    return Math.round(lo + Math.random() * (hi - lo));
  }

  function clampNum(v, lo, hi, fallback) {
    v = Math.round(+v);
    if (!isFinite(v)) return fallback;
    return Math.max(lo, Math.min(hi, v));
  }
  function normCfg(c) {
    c = c || {};
    var out = {
      min: clampNum(c.min, 5, 3600, CFG.min),
      max: clampNum(c.max, 5, 3600, CFG.max),
      magic:    c.magic    === undefined ? CFG.magic    : !!c.magic,
      negative: c.negative === undefined ? CFG.negative : !!c.negative,
      miss:     c.miss     === undefined ? CFG.miss     : !!c.miss,
      timers:   c.timers   === undefined ? CFG.timers   : !!c.timers
    };
    if (out.max < out.min) out.max = out.min;
    return out;
  }
  function normForced(f) {
    if (!f) return null;
    var n = Math.round(+f.n);
    if (!(n >= 1 && n <= N)) return null;
    var eff = f.eff && effectById(f.eff) ? f.eff : '';
    return { n: n, eff: eff };
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function neighbours(n) {
    var c = (n - 1) % COLS, r = Math.floor((n - 1) / COLS), out = [];
    if (r > 0) out.push(n - COLS);
    if (r < ROWS - 1) out.push(n + COLS);
    if (c > 0) out.push(n - 1);
    if (c < COLS - 1) out.push(n + 1);
    return out;
  }

  function empty(cfg) {
    return {
      round: 1, boxes: {}, draws: [], seq: 0, last: null, wonAt: 0,
      cfg: normCfg(cfg), forced: null
    };
  }
  function norm(s) {
    s = s || {};
    var boxes = {}, src = s.boxes || {};
    // Tolerate a legacy/array-coerced shape as well as the "bN" one.
    for (var k in src) {
      var b = src[k];
      if (!b || typeof b.at !== 'number' || typeof b.dur !== 'number') continue;
      var n = String(k).charAt(0) === 'b' ? num(k) : +k;
      if (n >= 1 && n <= N) boxes[key(n)] = { at: b.at, dur: b.dur };
    }
    return {
      round: s.round || 1, boxes: boxes, draws: s.draws || [],
      seq: s.seq || 0, last: s.last || null, wonAt: s.wonAt || 0,
      cfg: normCfg(s.cfg), forced: normForced(s.forced)
    };
  }
  function prune(st, now) {
    var b = {};
    for (var k in st.boxes) { var x = st.boxes[k]; if (x && x.at + x.dur > now) b[k] = x; }
    st.boxes = b;
  }
  function liveNums(st) {
    var out = [];
    for (var k in st.boxes) if (st.boxes[k]) out.push(num(k));
    return out;
  }

  function applyDraw(cur) {
    var now = Date.now(), st = norm(cur), i;
    var cfg = st.cfg;
    prune(st, now);

    /* /admin can nail the next draw to a square (and optionally an effect) for
       when the hall needs a particular thing to happen. One draw only — it is
       consumed here whether or not it was usable. */
    var forced = st.forced;
    st.forced = null;

    var closed = [], open = [];
    for (i = 1; i <= N; i++) (st.boxes[key(i)] ? open : closed).push(i);

    var n, missed;
    if (forced) {
      n = forced.n;
      missed = false;             // a forced square opens, decoys do not apply
    } else {
      /* A uniform 1-40 pick meant that past ~30 flipped, most draws landed on a
         box that was already open and only restarted its timer — operators saw
         the button do nothing several presses in a row. The wheel is now the
         closed boxes plus a handful of open ones as decoys. */
      var decoys = (cfg.miss && closed.length && open.length)
        ? Math.min(open.length, Math.max(1, Math.round(closed.length * DECOY_RATE)))
        : 0;
      var wheel = closed.concat(shuffle(open.slice()).slice(0, decoys));
      n = wheel.length ? wheel[Math.floor(Math.random() * wheel.length)]
                       : 1 + Math.floor(Math.random() * N);
      // Landed on a decoy: the square is already laughing, so nothing changes.
      missed = !!st.boxes[key(n)];
    }

    var eff = (forced && forced.eff) ? effectById(forced.eff) : null;
    if (!eff) eff = missed ? MISS : pickEffect(cfg);
    if (eff.id === 'miss') missed = true;
    var extra = [], pool;

    function flip(m, d) { st.boxes[key(m)] = { at: now, dur: d || baseDur(cfg) }; }
    function takeOne(skip) {
      var ks = liveNums(st).filter(function (x) { return x !== skip; });
      if (!ks.length) return 0;
      var m = ks[Math.floor(Math.random() * ks.length)];
      delete st.boxes[key(m)];
      return m;
    }

    if (eff.id === 'miss') { /* nothing flips, nothing re-times */ }
    else if (eff.id === 'none') flip(n);
    else if (eff.id === 'spread') {
      flip(n);
      neighbours(n).forEach(function (m) { flip(m); extra.push(m); });
    }
    else if (eff.id === 'triple') {
      flip(n);
      pool = [];
      for (i = 1; i <= N; i++) if (i !== n && !st.boxes[key(i)]) pool.push(i);
      shuffle(pool).slice(0, 3).forEach(function (m) { flip(m); extra.push(m); });
    }
    else if (eff.id === 'long') flip(n, Math.round(baseDur(cfg) * 2));
    else if (eff.id === 'row') {
      var row = Math.floor((n - 1) / COLS);
      for (i = 0; i < COLS; i++) {
        var m = row * COLS + i + 1;
        flip(m);
        if (m !== n) extra.push(m);
      }
    }
    else if (eff.id === 'gloom') {
      flip(n);
      var g = takeOne(n);
      if (g) extra.push(-g);
    }
    else if (eff.id === 'half') {
      flip(n);
      shuffle(liveNums(st).filter(function (x) { return x !== n; })).slice(0, 2).forEach(function (m) {
        var b = st.boxes[key(m)], rem = b.at + b.dur - now;
        b.dur = b.dur - Math.max(0, Math.round(rem / 2) - 15000);
        extra.push(-m);
      });
    }
    else if (eff.id === 'regret') {
      var u = takeOne(0);
      if (u) extra.push(-u);
    }

    st.seq = (st.seq || 0) + 1;
    var rec = {
      id: st.seq, n: n, at: now, eff: eff.id, name: eff.name, desc: eff.desc,
      tone: eff.tone, kept: eff.id !== 'regret' && eff.id !== 'miss',
      extra: extra.join(',')
    };
    st.last = rec;
    st.draws = [rec].concat(st.draws || []).slice(0, 10);
    var count = liveNums(st).length;
    if (count >= N && !st.wonAt) st.wonAt = now;
    if (count < N) st.wonAt = 0;
    return st;
  }

  var listeners = [], state = empty(), impl = null, online = true;
  function emit() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](state); } catch (e) {} } }
  function set(s) { state = norm(s); emit(); }

  function useLocal() {
    var KEY = 'flipgame.state.v1';
    var bc = ('BroadcastChannel' in window) ? new BroadcastChannel('flipgame') : null;
    function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    function write(s) {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
      if (bc) bc.postMessage(s);
    }
    if (bc) bc.onmessage = function (e) { set(e.data); };
    window.addEventListener('storage', function (e) { if (e.key === KEY) set(read()); });
    impl = {
      mode: 'local',
      draw: function () { var s = applyDraw(read()); write(s); set(s); },
      reset: function () {
        // Settings survive a reset: the operator changed them mid-camp for a
        // reason, and a new round should not quietly undo that.
        var prev = norm(read());
        var s = empty(prev.cfg);
        s.round = (prev.round || 1) + 1;
        write(s); set(s);
      },
      patch: function (fn) { var s = norm(read()); fn(s); write(s); set(s); }
    };
    set(read() || empty());
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = res;
      s.onerror = function () { rej(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* Same-origin copies first — camp wifi should not have to reach gstatic
     before the board can start. Falls back to the CDN if vendor/ is missing. */
  function loadFirebaseSdk() {
    var local = ['vendor/firebase-app-compat.js', 'vendor/firebase-database-compat.js'];
    var cdn = local.map(function (f) {
      return 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/' + f.split('/').pop();
    });
    return local.reduce(function (p, src) {
      return p.then(function () { return loadScript(src); });
    }, Promise.resolve()).catch(function (e) {
      console.warn('[FlipSync] vendored SDK unavailable, using CDN', e);
      return cdn.reduce(function (p, src) {
        return p.then(function () { return loadScript(src); });
      }, Promise.resolve());
    });
  }

  async function useFirebase(cfg) {
    await loadFirebaseSdk();
    firebase.initializeApp(cfg);
    var db = firebase.database(), ref = db.ref(PATH);
    ref.on('value', function (snap) { set(snap.val()); });
    db.ref('.info/connected').on('value', function (s) { online = !!s.val(); emit(); });
    impl = {
      mode: 'firebase',
      draw: function () { ref.transaction(function (cur) { return applyDraw(cur); }); },
      reset: function () {
        ref.transaction(function (cur) {
          var prev = norm(cur);
          var s = empty(prev.cfg);      // settings survive a reset
          s.round = (prev.round || 1) + 1;
          return s;
        });
      },
      patch: function (fn) {
        ref.transaction(function (cur) { var s = norm(cur); fn(s); return s; });
      }
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
    N: N, COLS: COLS, ROWS: ROWS, EFFECTS: EFFECTS, MISS: MISS,
    DECOY_RATE: DECOY_RATE, ready: ready,
    /** Seed the defaults a fresh game starts from (settings.js / URL params).
        Does not touch a round that already carries a cfg. */
    configure: function (o) {
      if (!o) return;
      if (o.min) CFG.min = o.min;
      if (o.max) CFG.max = o.max;
      if (o.magic !== undefined) CFG.magic = !!o.magic;
      if (o.negative !== undefined) CFG.negative = !!o.negative;
      if (o.miss !== undefined) CFG.miss = !!o.miss;
      if (o.timers !== undefined) CFG.timers = !!o.timers;
    },
    /** Change the live settings for every device. /admin uses this. */
    setConfig: function (patch) {
      if (!impl || !patch) return;
      impl.patch(function (s) {
        var c = s.cfg, k;
        for (k in patch) if (patch[k] !== undefined) c[k] = patch[k];
        s.cfg = normCfg(c);
      });
    },
    /** Nail the next draw to a square, optionally to an effect too. */
    forceNext: function (n, eff) {
      if (!impl) return;
      impl.patch(function (s) { s.forced = normForced({ n: n, eff: eff }); });
    },
    cfgDefaults: function () { return normCfg(null); },
    onState: function (f) {
      listeners.push(f);
      f(state);
      return function () { listeners = listeners.filter(function (x) { return x !== f; }); };
    },
    /** Numbers of the boxes currently showing 笑弟弟, with their timers. */
    live: function (st, now) {
      var out = {};
      for (var k in st.boxes) {
        var b = st.boxes[k];
        if (b && b.at + b.dur > now) out[num(k)] = b;
      }
      return out;
    },
    draw: function () { if (impl) impl.draw(); },
    reset: function () { if (impl) impl.reset(); },
    prune: prune,
    get mode() { return impl ? impl.mode : 'booting'; },
    get online() { return impl && impl.mode === 'firebase' ? online : true; }
  };
})();
