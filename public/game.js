/* Shared helpers for both views. */
window.Flip = (function () {
  var DEFAULTS = { minSeconds: 120, maxSeconds: 180, magic: true, showTimers: true };

  /** settings.js provides the camp's defaults; ?min=&max=&magic=&timers=
      override them per device, which is what the prototype's Tweaks panel did. */
  function settings() {
    var s = Object.assign({}, DEFAULTS, window.FLIP_SETTINGS || {});
    var q = null;
    try { q = new URLSearchParams(location.search); } catch (e) {}
    if (q) {
      if (q.has('min')) s.minSeconds = +q.get('min') || s.minSeconds;
      if (q.has('max')) s.maxSeconds = +q.get('max') || s.maxSeconds;
      if (q.has('magic')) s.magic = q.get('magic') !== '0';
      if (q.has('timers')) s.showTimers = q.get('timers') !== '0';
    }
    return s;
  }

  function mmss(ms) {
    var t = Math.max(0, Math.round(ms / 1000));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }

  function clock(ts) {
    var d = new Date(ts), p = function (v) { return String(v).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function tone(t) {
    return t === 'good' ? '#52A63C' : t === 'bad' ? '#F2678E' : '#F7B71D';
  }
  function onTone(t) { return t === 'plain' ? '#40301B' : '#fff'; }

  function modeText() {
    var s = window.FlipSync;
    if (!s || s.mode === 'booting') return '連線中…';
    if (s.mode === 'firebase') return s.online ? 'Firebase 已連線' : 'Firebase 斷線中';
    return '本機同步（同一部機）';
  }

  function modeClass() {
    var s = window.FlipSync;
    if (!s || s.mode !== 'firebase') return '';
    return s.online ? 'online' : 'offline';
  }

  /** Run `boot` once FlipSync has finished picking a backend. */
  function whenReady(boot) {
    if (window.FlipSync) return boot();
    var t = setInterval(function () {
      if (window.FlipSync) { clearInterval(t); boot(); }
    }, 60);
  }

  /** Text writes are the hot path on the 200ms tick — skip the ones that
      would not change anything. */
  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }
  function setClass(el, name, want) {
    if (el) el.classList.toggle(name, !!want);
  }

  return {
    settings: settings, mmss: mmss, clock: clock,
    tone: tone, onTone: onTone,
    modeText: modeText, modeClass: modeClass,
    whenReady: whenReady, setText: setText, setClass: setClass
  };
})();
