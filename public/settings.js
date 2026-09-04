/* 營期設定 — 改完直接 firebase deploy，唔使碰其他檔案。

   呢度係「開新一局嘅預設值」。營期中途想改，唔使 redeploy —— 開 /admin
   設定台改，所有機即刻跟，重新開始都唔會走返轉頭。
   網址覆寫（例如 screen.html?min=90&magic=0&timers=0）都係改預設值。 */
window.FLIP_SETTINGS = {
  minSeconds: 120,   // 每格最短笑幾耐（秒）
  maxSeconds: 180,   // 每格最長笑幾耐（秒）
  magic: true,       // 魔法效果開／關
  negative: true,    // 負面魔法（愁雲密佈／笑得唔夠久／愁哥哥反悔）
  miss: true,        // 食白果（抽到已經笑緊嗰格）
  showTimers: true   // 大螢幕格仔上面顯唔顯示倒數
};
