/* Registers the offline shell. Skipped on plain http:// (other than
   localhost), where service workers are unavailable anyway. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('[flipgame] service worker not registered', e);
    });
  });
}
