/* 手機 — the operator's draw button. Draw-only: reset lives on the 大螢幕. */
(function () {
  var F = window.Flip;
  var CFG = F.settings();
  var N = 40, ROLL_MS = 800, ROLL_STEP = 55, URGENT_MS = 20000;
  var DRAW_LABEL = '抽 一 次';

  var el = {
    dot: document.getElementById('dot'),
    countN: document.getElementById('count-n'),
    countB: document.getElementById('count-b'),
    flash: document.getElementById('flash'),
    flashN: document.getElementById('flash-n'),
    flashName: document.getElementById('flash-name'),
    flashDesc: document.getElementById('flash-desc'),
    idle: document.getElementById('idle'),
    draw: document.getElementById('draw'),
    openSheet: document.getElementById('open-sheet'),
    closeSheet: document.getElementById('close-sheet'),
    sheet: document.getElementById('sheet'),
    list: document.getElementById('sheet-list'),
    empty: document.getElementById('sheet-empty'),
    mode: document.getElementById('mode')
  };

  var state = null;
  var rolling = false, rollTimer = 0, rollStop = 0;
  var sheetOpen = false;
  var rows = {};   // box number -> {root, bar, at, text, urgent}
  var shown = { count: -1, modeClass: null, flashKey: null, won: null };
  var won = false;

  /* ── the number spins for 800ms before the real draw lands ── */
  function draw() {
    if (rolling || won || !window.FlipSync) return;
    rolling = true;
    el.draw.classList.add('rolling');
    el.draw.textContent = '抽…';
    rollTimer = setInterval(function () {
      el.flashN.textContent = String(1 + Math.floor(Math.random() * 40));
    }, ROLL_STEP);
    rollStop = setTimeout(function () {
      clearInterval(rollTimer);
      rolling = false;
      el.draw.classList.remove('rolling');
      el.draw.textContent = won ? '等大螢幕重新開始' : DRAW_LABEL;
      el.draw.disabled = won;
      shown.flashKey = null;
      renderFlash();
    }, ROLL_MS);
    renderFlash();
    window.FlipSync.draw();
  }

  function renderFlash() {
    var last = (state && state.last) || null;
    var has = !!last || rolling;
    el.flash.hidden = !has;
    el.idle.hidden = has;
    if (!has) return;

    var key = rolling ? 'roll' : last.id + ':' + last.n;
    if (shown.flashKey === key) return;
    shown.flashKey = key;

    if (rolling) {
      el.flash.classList.remove('active');
      el.flash.style.background = '';
      el.flash.style.color = '';
      el.flashName.textContent = '抽…';
      el.flashDesc.textContent = '';
      return;
    }
    el.flash.classList.add('active');
    el.flash.style.background = F.tone(last.tone);
    el.flash.style.color = F.onTone(last.tone);
    el.flashN.textContent = String(last.n);
    el.flashName.textContent = last.name;
    el.flashDesc.textContent = last.desc;
  }

  /* ── 笑住嘅格 — only built while the sheet is actually open ── */
  function makeRow(n) {
    var row = document.createElement('div');
    row.className = 'sheet-row';
    row.innerHTML = '<div class="n">' + n + '</div>' +
                    '<div class="track"><i></i></div>' +
                    '<div class="at"></div>';
    return { root: row, bar: row.children[1].firstChild, at: row.children[2], text: '', urgent: null, pct: -1 };
  }

  function renderSheet(live, now) {
    var order = Object.keys(live).map(Number).sort(function (a, b) {
      return (live[a].at + live[a].dur) - (live[b].at + live[b].dur);
    });

    for (var n in rows) {
      if (!live[n]) { rows[n].root.remove(); delete rows[n]; }
    }

    order.forEach(function (n, i) {
      var b = live[n], rem = b.at + b.dur - now;
      var r = rows[n] || (rows[n] = makeRow(n));
      if (!r.root.isConnected) el.list.appendChild(r.root);

      var pct = Math.max(0, Math.min(100, rem / b.dur * 100));
      if (Math.abs(r.pct - pct) > 0.15) { r.pct = pct; r.bar.style.width = pct + '%'; }
      var text = F.mmss(rem);
      if (r.text !== text) { r.text = text; r.at.textContent = text; }
      var urgent = rem < URGENT_MS;
      if (r.urgent !== urgent) { r.urgent = urgent; r.root.classList.toggle('urgent', urgent); }

      // Keep DOM order matching the sorted order without a full rebuild.
      var want = el.list.children[i + 1];   // children[0] is the empty notice
      if (want !== r.root) el.list.insertBefore(r.root, want || null);
    });

    el.empty.hidden = order.length > 0;
  }

  function tick() {
    if (!state) return;
    var now = Date.now();
    var live = window.FlipSync.live(state, now);
    var count = Object.keys(live).length;

    if (shown.count !== count) {
      shown.count = count;
      el.countN.textContent = String(count);
      el.countB.textContent = String(count);
    }

    won = count >= N;
    if (shown.won !== won) {
      shown.won = won;
      el.draw.classList.toggle('done', won);
      if (!rolling) {
        el.draw.disabled = won;
        el.draw.textContent = won ? '等大螢幕重新開始' : DRAW_LABEL;
      }
    }

    var cls = F.modeClass();
    if (shown.modeClass !== cls) {
      shown.modeClass = cls;
      el.dot.className = 'dot ' + cls;
    }

    if (sheetOpen) {
      F.setText(el.mode, F.modeText() + ' · 第 ' + (state.round || 1) + ' 局');
      renderSheet(live, now);
    }
  }

  function toggleSheet(open) {
    sheetOpen = open;
    el.sheet.hidden = !open;
    if (!open) {
      for (var n in rows) rows[n].root.remove();
      rows = {};
    }
    tick();
  }

  el.draw.addEventListener('click', draw);
  el.openSheet.addEventListener('click', function () { toggleSheet(true); });
  el.closeSheet.addEventListener('click', function () { toggleSheet(false); });

  F.whenReady(function () {
    window.FlipSync.configure({
      min: CFG.minSeconds, max: CFG.maxSeconds, magic: CFG.magic,
      negative: CFG.negative, miss: CFG.miss, timers: CFG.showTimers
    });
    window.FlipSync.onState(function (st) {
      state = st;
      renderFlash();
      tick();
    });
    setInterval(tick, 200);
  });
})();
