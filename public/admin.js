/* 設定台 — change the live settings mid-camp.

   Everything here writes to the SHARED game state, not to this device. The
   draw runs on whichever phone pressed the button, so a per-device setting
   would mean eight phones quietly disagreeing about the timer length. */
(function () {
  var F = window.Flip;
  var CFG = F.settings();
  var N = 40, MIN_S = 15, MAX_S = 1800;

  var el = {
    dot: document.getElementById('dot'),
    count: document.getElementById('count'),
    round: document.getElementById('round'),
    minV: document.getElementById('min-v'),
    maxV: document.getElementById('max-v'),
    durPresets: document.getElementById('dur-presets'),
    moodPresets: document.getElementById('mood-presets'),
    magic: document.getElementById('t-magic'),
    negative: document.getElementById('t-negative'),
    miss: document.getElementById('t-miss'),
    timers: document.getElementById('t-timers'),
    pick: document.getElementById('pick'),
    forceEff: document.getElementById('force-eff'),
    forced: document.getElementById('forced'),
    forcedText: document.getElementById('forced-text'),
    forcedClear: document.getElementById('forced-clear'),
    reset: document.getElementById('reset'),
    mode: document.getElementById('mode')
  };

  var state = null;
  var cells = [];
  var confirmReset = false, confirmTimer = 0;
  var shown = { cfg: '', count: -1, round: -1, forced: '', live: '', modeClass: null };

  function mmss(sec) {
    return Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0');
  }
  function cfgOf(st) {
    return (st && st.cfg) || (window.FlipSync ? window.FlipSync.cfgDefaults() : {});
  }

  /* ── the 1–40 picker, laid out like the board ── */
  function buildPicker() {
    var frag = document.createDocumentFragment();
    for (var n = 1; n <= N; n++) {
      var b = document.createElement('button');
      b.className = 'pick-cell';
      b.textContent = n;
      b.dataset.n = n;
      frag.appendChild(b);
      cells.push(b);
    }
    el.pick.appendChild(frag);
    el.pick.addEventListener('click', function (e) {
      var t = e.target.closest('.pick-cell');
      if (!t || !window.FlipSync) return;
      window.FlipSync.forceNext(+t.dataset.n, el.forceEff.value);
    });
  }

  function buildEffectOptions() {
    if (!window.FlipSync) return;
    var list = window.FlipSync.EFFECTS.concat([window.FlipSync.MISS]);
    list.forEach(function (eff) {
      var o = document.createElement('option');
      o.value = eff.id;
      o.textContent = eff.name;
      el.forceEff.appendChild(o);
    });
  }

  /* ── writes ── */
  function bump(which, by) {
    var c = cfgOf(state), next = {};
    next[which] = Math.max(MIN_S, Math.min(MAX_S, (c[which] || 0) + by));
    // Keep the pair sane from either end rather than silently snapping later.
    if (which === 'min' && next.min > c.max) next.max = next.min;
    if (which === 'max' && next.max < c.min) next.min = next.max;
    window.FlipSync.setConfig(next);
  }

  el.durPresets.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-dur]');
    if (!b) return;
    var v = b.dataset.dur.split(',');
    window.FlipSync.setConfig({ min: +v[0], max: +v[1] });
  });

  el.moodPresets.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mood]');
    if (!b) return;
    var kind = b.dataset.mood === 'kind';
    window.FlipSync.setConfig({ magic: true, negative: !kind, miss: !kind });
  });

  document.querySelectorAll('.step').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = b.dataset.step.split(':');
      bump(p[0], +p[1]);
    });
  });

  [['magic', el.magic], ['negative', el.negative],
   ['miss', el.miss], ['timers', el.timers]].forEach(function (pair) {
    pair[1].addEventListener('change', function () {
      var patch = {};
      patch[pair[0]] = pair[1].checked;
      window.FlipSync.setConfig(patch);
    });
  });

  el.forcedClear.addEventListener('click', function () {
    window.FlipSync.forceNext(0, '');    // out of range clears it
  });

  function disarm() {
    clearTimeout(confirmTimer);
    confirmReset = false;
    el.reset.classList.remove('armed');
    el.reset.textContent = '重新開始';
  }
  el.reset.addEventListener('click', function () {
    if (!confirmReset) {
      confirmReset = true;
      el.reset.classList.add('armed');
      el.reset.textContent = '再撳一次確認';
      confirmTimer = setTimeout(disarm, 3500);
      return;
    }
    disarm();
    window.FlipSync.reset();
  });

  /* ── render ── */
  function render() {
    var c = cfgOf(state);
    var key = [c.min, c.max, c.magic, c.negative, c.miss, c.timers].join('|');
    if (shown.cfg !== key) {
      shown.cfg = key;
      F.setText(el.minV, mmss(c.min));
      F.setText(el.maxV, mmss(c.max));
      el.magic.checked = !!c.magic;
      el.negative.checked = !!c.negative;
      el.miss.checked = !!c.miss;
      el.timers.checked = !!c.timers;
      // 負面魔法 is meaningless with 魔法 off; say so rather than lying.
      el.negative.disabled = !c.magic;
      el.negative.closest('.toggle').classList.toggle('muted', !c.magic);

      var mood = (c.magic && !c.negative && !c.miss) ? 'kind'
               : (c.magic && c.negative && c.miss) ? 'normal' : '';
      el.moodPresets.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.mood === mood);
      });
      el.durPresets.querySelectorAll('button').forEach(function (b) {
        var v = b.dataset.dur.split(',');
        b.classList.toggle('on', +v[0] === c.min && +v[1] === c.max);
      });
    }

    var now = Date.now();
    var live = state && window.FlipSync ? window.FlipSync.live(state, now) : {};
    var count = Object.keys(live).length;
    if (shown.count !== count) {
      shown.count = count;
      F.setText(el.count, String(count));
    }
    var round = (state && state.round) || 1;
    if (shown.round !== round) {
      shown.round = round;
      F.setText(el.round, String(round));
    }

    var liveKey = Object.keys(live).sort().join(',');
    if (shown.live !== liveKey) {
      shown.live = liveKey;
      for (var n = 1; n <= N; n++) cells[n - 1].classList.toggle('on', !!live[n]);
    }

    var f = state && state.forced;
    var fKey = f ? f.n + ':' + (f.eff || '') : '';
    if (shown.forced !== fKey) {
      shown.forced = fKey;
      el.forced.hidden = !f;
      cells.forEach(function (b) {
        b.classList.toggle('picked', !!f && +b.dataset.n === f.n);
      });
      if (f) {
        var eff = f.eff && window.FlipSync ? effName(f.eff) : '';
        el.forcedText.textContent = '下一抽 → 第 ' + f.n + ' 格' + (eff ? '（' + eff + '）' : '');
      }
    }

    F.setText(el.mode, F.modeText() + ' · 第 ' + round + ' 局');
    var cls = F.modeClass();
    if (shown.modeClass !== cls) {
      shown.modeClass = cls;
      el.dot.className = 'dot ' + cls;
    }
  }

  function effName(id) {
    var all = window.FlipSync.EFFECTS.concat([window.FlipSync.MISS]);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].name;
    return id;
  }

  buildPicker();
  F.whenReady(function () {
    window.FlipSync.configure({
      min: CFG.minSeconds, max: CFG.maxSeconds, magic: CFG.magic,
      negative: CFG.negative, miss: CFG.miss, timers: CFG.showTimers
    });
    buildEffectOptions();
    window.FlipSync.onState(function (st) { state = st; render(); });
    setInterval(render, 500);
  });
})();
