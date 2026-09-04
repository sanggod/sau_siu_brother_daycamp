/* 大螢幕 — the projector board.

   Everything is built once and then patched in place. The 200ms tick walks
   40 cached cells and only touches the DOM where a value actually changed,
   so a full minute of countdown costs 40 string compares per frame and a
   handful of writes. */
(function () {
  var F = window.Flip;
  var CFG = F.settings();
  var N = 40, COLS = 5, ROWS = 8;
  var FLASH_MS = 6000, CONFIRM_MS = 3500, URGENT_MS = 20000;
  /* Where the board stops being "filling up" and starts being "what's left". */
  var ENDGAME_AT = 30;

  var el = {
    stage: document.getElementById('stage'),
    board: document.getElementById('board'),
    count: document.getElementById('count'),
    bar: document.getElementById('bar'),
    togo: document.getElementById('togo'),
    flash: document.getElementById('flash'),
    flashN: document.getElementById('flash-n'),
    flashName: document.getElementById('flash-name'),
    flashDesc: document.getElementById('flash-desc'),
    log: document.getElementById('log'),
    dot: document.getElementById('dot'),
    mode: document.getElementById('mode'),
    reset: document.getElementById('reset'),
    win: document.getElementById('win'),
    winAgain: document.getElementById('win-again')
  };

  var state = null;      // latest synced game state
  var flash = null;      // the draw currently highlighted, or null
  var flashTimer = 0;
  var confirm = false;   // reset is armed
  var confirmTimer = 0;
  var cells = [];        // {root, time, on, text, urgent}
  var lastLogId = null;
  var shown = { count: -1, mode: '', modeClass: null, won: null, flashKey: null };

  /* ── the 1920x1080 stage scales to whatever the projector gives us ── */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    el.stage.style.setProperty('--scale', s);
  }

  /* ── board ── */
  function buildBoard() {
    var frag = document.createDocumentFragment();
    for (var n = 1; n <= N; n++) {
      var c = (n - 1) % COLS, r = Math.floor((n - 1) / COLS);
      var cell = document.createElement('div');
      cell.className = 'cell';
      // One sheet, 5x8: pick this cell's slice out of it.
      cell.style.setProperty('--bx', (c * 25) + '%');
      cell.style.setProperty('--by', (r * 100 / (ROWS - 1)) + '%');
      cell.innerHTML =
        '<div class="inner">' +
          '<div class="face front"></div>' +
          '<div class="face back"></div>' +
        '</div>' +
        '<div class="num">' + n + '</div>' +
        '<div class="time"></div>';
      frag.appendChild(cell);
      cells.push({ root: cell, time: cell.lastChild, on: false, text: '', urgent: false });
    }
    el.board.appendChild(frag);
    if (!CFG.showTimers) document.body.classList.add('no-timers');
  }

  /* ── per-frame patching ── */
  function tick() {
    if (!state) return;
    var now = Date.now();
    var live = window.FlipSync.live(state, now);
    var count = 0;

    for (var n = 1; n <= N; n++) {
      var cell = cells[n - 1], b = live[n], on = !!b;
      if (on) count++;
      if (cell.on !== on) {
        cell.on = on;
        cell.root.classList.toggle('on', on);
      }
      if (!on) {
        if (cell.text !== '') { cell.text = ''; cell.time.textContent = ''; }
        if (cell.urgent) { cell.urgent = false; cell.time.classList.remove('urgent'); }
        continue;
      }
      var rem = b.at + b.dur - now;
      var text = F.mmss(rem), urgent = rem < URGENT_MS;
      if (cell.text !== text) { cell.text = text; cell.time.textContent = text; }
      if (cell.urgent !== urgent) {
        cell.urgent = urgent;
        cell.time.classList.toggle('urgent', urgent);
      }
    }

    if (shown.count !== count) {
      shown.count = count;
      el.count.textContent = String(count);
      el.bar.style.width = (count / N * 100) + '%';

      var endgame = count >= ENDGAME_AT && count < N;
      el.board.classList.toggle('endgame', endgame);
      el.togo.hidden = !endgame;
      if (endgame) {
        var strong = document.createElement('b');
        strong.textContent = String(N - count);
        el.togo.replaceChildren(document.createTextNode('仲差 '), strong,
                                document.createTextNode(' 格就贏'));
      }
    }

    var won = count >= N;
    if (shown.won !== won) {
      shown.won = won;
      el.win.hidden = !won;
    }

    var mode = F.modeText();
    var line = mode + ' · 第 ' + (state.round || 1) + ' 局';
    F.setText(el.mode, line);
    var cls = F.modeClass();
    if (shown.modeClass !== cls) {
      shown.modeClass = cls;
      el.dot.className = 'dot ' + cls;
    }
  }

  /* ── 啱啱抽到 ── */
  function renderFlash() {
    var last = flash || (state && state.last) || null;
    var active = !!flash;
    var key = (last ? last.id + ':' + last.n : 'none') + ':' + active;
    if (shown.flashKey === key) return;
    shown.flashKey = key;

    el.flash.classList.toggle('active', active);
    if (active) {
      el.flash.style.background = F.tone(last.tone);
      el.flash.style.color = F.onTone(last.tone);
    } else {
      el.flash.style.background = '';
      el.flash.style.color = '';
    }
    // No number until something has actually been drawn — a placeholder glyph
    // at 122px Archivo Black just reads as a stray bar across the hall.
    el.flashN.hidden = !last;
    el.flashN.textContent = last ? String(last.n) : '';
    el.flashName.textContent = last ? last.name : '準備開始？';
    el.flashDesc.textContent = last ? last.desc : '㩒手機嘅抽格機，抽你哋第一格。';

    // Restart the pop each time a draw lands, not just on the first one.
    el.flash.classList.remove('bump');
    if (active) { void el.flash.offsetWidth; el.flash.classList.add('bump'); }
  }

  /* ── 紀錄 ── */
  function renderLog() {
    var draws = (state && state.draws) || [];
    var head = draws.length ? draws[0].id : null;
    if (lastLogId === head) return;
    lastLogId = head;

    var frag = document.createDocumentFragment();
    draws.slice(0, 6).forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'log-row';
      row.innerHTML =
        '<div class="dot"></div>' +
        '<div class="n"></div>' +
        '<div class="what"></div>' +
        '<div class="at"></div>';
      row.children[0].style.background = F.tone(d.tone);
      row.children[1].textContent = d.n;
      row.children[2].textContent = d.name;
      row.children[3].textContent = F.clock(d.at);
      frag.appendChild(row);
    });
    el.log.replaceChildren(frag);
  }

  /* ── 重新開始: two presses, or R twice ── */
  function doReset() {
    disarm();
    flash = null;
    clearTimeout(flashTimer);
    renderFlash();
    if (window.FlipSync) window.FlipSync.reset();
  }
  function reset() {
    if (!confirm) {
      confirm = true;
      el.reset.classList.add('armed');
      el.reset.textContent = '再按一次確認';
      confirmTimer = setTimeout(disarm, CONFIRM_MS);
      return;
    }
    doReset();
  }
  function disarm() {
    clearTimeout(confirmTimer);
    confirm = false;
    el.reset.classList.remove('armed');
    el.reset.textContent = '重新開始';
  }

  /* ── boot ── */
  buildBoard();
  fit();
  window.addEventListener('resize', fit);
  el.reset.addEventListener('click', reset);
  /* No double-press here: the round is already over, so there is no live game
     to protect the way there is mid-round. */
  el.winAgain.addEventListener('click', doReset);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'r' || e.key === 'R') reset();
  });

  F.whenReady(function () {
    window.FlipSync.configure({ min: CFG.minSeconds, max: CFG.maxSeconds, magic: CFG.magic });
    window.FlipSync.onState(function (st) {
      var prev = state;
      var isNew = st && st.last && (!prev || !prev.last || prev.last.id !== st.last.id);
      state = st;
      if (isNew) {
        flash = st.last;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(function () { flash = null; renderFlash(); }, FLASH_MS);
      }
      renderFlash();
      renderLog();
      tick();
    });
    setInterval(tick, 200);
  });
})();
