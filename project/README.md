# 愁哥哥同笑弟弟 — 日營翻格遊戲

## 開兩個畫面
同一個檔案，兩種版面，用 URL 決定：

- 大螢幕（投影／PC）：`.../Flip%20Game.dc.html?view=pc`
- 手機（8 組各自一部）：`.../Flip%20Game.dc.html?view=mobile`

無寫 `?view=` 就自動判斷（闊過 900px 當大螢幕）。畫面右下角有切換連結。

## 玩法
- 40 格，5 欄 × 8 行，正面係愁哥哥（灰暗），反面係笑弟弟（鮮色 + 光暈）。
- 組員完成一個任務 → 操作員按手機上嘅「抽一格」→ 隨機抽 1–40 → 大螢幕即刻翻該格。
- 每格笑 2:00–3:00（隨機）之後自動翻返愁哥哥。
- 抽到已經翻開嘅格 → 計時重新計。
- 40 格同一刻全部係笑弟弟 → 大螢幕出「全村都笑咗！」
- 重置只在大螢幕：右下角「重置全局」按兩次確認，或者按 `R` 兩次。手機只可以抽格。

## 魔法（可以在 Tweaks 關掉）
| 名 | 機率 | 效果 |
|---|---|---|
| 翻一格 | 60% | 正常翻一格 |
| 傳染笑 | 8% | 上下左右四格一齊翻 |
| 大笑三聲 | 8% | 另外三格隨機一齊翻 |
| 笑到停唔到 | 7% | 該格計時加倍（4–6 分鐘） |
| 全村一齊笑 | 3% | 整整一行五格翻開 |
| 愁雲密佈 | 6% | 翻該格，但收返一格已翻開嘅 |
| 笑得唔夠久 | 5% | 兩格計時剩返一半 |
| 愁哥哥反悔 | 3% | 唔翻，仲要收返一格 |

## Firebase 設定
1. Firebase console 建立 project → 開 **Realtime Database**（區域揀 asia-southeast1）。
2. Rules（營期間用，之後記得收返）：
   ```json
   { "rules": { "flipgame": { ".read": true, ".write": true } } }
   ```
3. 專案設定 → Your apps → 複製 SDK config，填入 `firebase-config.js`。
4. `firebase deploy` 或者用 Firebase Hosting 上傳整個 folder（`Flip Game.dc.html`、`support.js`、`sync.js`、`firebase-config.js`、`assets/`）。

`databaseURL` 留空 → 自動用本機模式（同一部機嘅多個窗口／tab 會同步），可以先咁樣試玩。

## 檔案
- `Flip Game.dc.html` — 兩個版面
- `sync.js` — 遊戲狀態、抽格邏輯、魔法、Firebase／本機同步
- `firebase-config.js` — 要你填
- `assets/sau.png`、`assets/siu-m.png` — 大螢幕用嘅兩幅圖（`siu-m` 係左右反轉版，配合 3D 翻轉）
