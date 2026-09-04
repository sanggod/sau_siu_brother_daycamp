/* 營期設定 — 改完直接 firebase deploy，唔使碰其他檔案。
   每部機都可以用網址覆寫，例如 screen.html?min=90&max=150&magic=0&timers=0 */
window.FLIP_SETTINGS = {
  minSeconds: 120,   // 每格最短笑幾耐（秒）
  maxSeconds: 180,   // 每格最長笑幾耐（秒）
  magic: true,       // 魔法效果開／關
  showTimers: true   // 大螢幕格仔上面顯唔顯示倒數
};
