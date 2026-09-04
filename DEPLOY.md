# 愁哥哥同笑弟弟 — 落機同部署

呢份係實作版嘅說明。設計原稿（Claude Design 出嘅 prototype）仍然放喺
`project/`，冇改過，可以對住睇。

## 檔案喺邊

```
public/                 ← Firebase Hosting 就係擺呢個 folder
  index.html            入口：一個 QR code + 兩個掣
  screen.html           大螢幕（投影／電視）
  play.html             手機抽格機（8 組每組一部）
  admin.html            設定台（營期中途改設定）
  app.css               全部版面嘅樣式
  game.js               兩邊共用嘅小工具
  sync.js               遊戲狀態、抽格、魔法、Firebase／本機同步
  screen.js / play.js / admin.js
                        各自嘅畫面邏輯
  settings.js           ★ 營期設定（時間、魔法開關）
  firebase-config.js    ★ 要填 Firebase 設定
  sw.js                 離線快取
  assets/*.webp         已經焗好嘅畫（見下面）
  vendor/               Firebase SDK 10.12.5（同源，唔使等 gstatic）
firebase.json           Hosting + Database 設定
database.rules.json     Realtime Database 規則
tools/                  出圖、出 QR、驗證用嘅script
project/                Claude Design 原稿（唔會 deploy）
```

網址（`cleanUrls` 開咗，所以冇 `.html`）：

| 用途 | 網址 |
|---|---|
| 入口／QR | `https://<你個 project>.web.app/` |
| 大螢幕 | `https://<你個 project>.web.app/screen` |
| 手機 | `https://<你個 project>.web.app/play` |
| 設定台 | `https://<你個 project>.web.app/admin` |

## 部署

```bash
npm i -g firebase-tools
firebase login

# 1. 填 public/firebase-config.js（Firebase console → 專案設定 → 你的應用程式）
# 2. 建立 Realtime Database（區域揀 asia-southeast1）
# 3. 寫低你個 project id
echo '{"projects":{"default":"你個-project-id"}}' > .firebaserc

# 4. 出返個 QR（指住手機版網址）
npm run qr https://你個-project-id.web.app/play

# 5. 上機
firebase deploy
```

`firebase deploy` 會一次過推 Hosting 同 Database rules。

### 想先試玩，未有 Firebase？

`firebase-config.js` 嘅 `databaseURL` 留空，個 game 會行**本機模式**：
同一部機開幾多個窗都會同步（BroadcastChannel + localStorage）。

```bash
npm run serve     # http://127.0.0.1:5000
```

開一個窗去 `/screen`，再開幾個去 `/play`，就可以綵排。

## 設定台 `/admin`

營期中途出咗狀況（細路唔夠時間、士氣低、要趕收尾）就開設定台，唔使 redeploy，
改完全部機即刻跟。大螢幕右下角有個「設定」連結，或者直接開 `/admin`。

| 改乜 | 做乜 |
|---|---|
| 每格笑幾耐 | 最短／最長各自 ±15 秒，或者撳 `趕時間 / 正常 / 耐啲 / 好耐` |
| 魔法效果 | 閂咗就每次淨係老實翻一格 |
| **負面魔法** | 淨係閂愁雲密佈／笑得唔夠久／愁哥哥反悔，好嘅魔法照舊 |
| **食白果** | 閂咗就每次抽都一定開到新格 |
| 大螢幕倒數 | 格仔角落嘅時間收唔收埋 |
| **指定下一格** | 撳個 1–40 板，下次手機抽格一定抽到嗰格。可以順便指定效果。淨係管一次 |
| 順風 / 正常 | 一撳搞掂：順風 = 負面同食白果都閂 |

三件事要記住：

- **設定係全場共用嘅，唔係淨係呢部機。** 抽格係喺撳掣嗰部手機度行，所以設定一定要
  跟住個 game 走，唔係八部電話各有各嘅時間。
- **改時間只影響之後抽嘅格。** 已經翻開嗰啲會照住原本嘅時間行完。
- **撳「重新開始」唔會清走設定。** 你中途改咗係有原因嘅，開新一局唔應該靜靜雞還原。

`settings.js` 而家淨係「開新一局嘅預設值」；設定台改嘅嘢會蓋過佢。

`/admin` **冇密碼**，同 database rules 一樣係營期全開。個網址唔好印喺 QR 或者
派畀組員 —— 大螢幕嗰條連結同你自己部機知就夠。

## 營期預設值

改 `public/settings.js`，再 `firebase deploy`：

```js
window.FLIP_SETTINGS = {
  minSeconds: 120,   // 每格最短笑幾耐
  maxSeconds: 180,   // 每格最長笑幾耐
  magic: true,       // 魔法效果
  showTimers: true   // 大螢幕格仔上顯唔顯示倒數
};
```

唔想 redeploy 嘅話，個別機可以用網址覆寫，例如
`/screen?min=90&max=150&timers=0`、`/play?magic=0`。

## 玩法（同原設計一樣）

- 40 格，5 欄 × 8 行。正面愁哥哥（灰），反面笑弟弟（暖黃 + 光暈）。
- 組員完成任務 → 操作員撳手機「抽一次」→ 大螢幕即刻翻。
- 每格笑 2:00–3:00（隨機）之後自動翻返愁哥哥。
- **個轉盤唔再係死板嘅 1–40**。以前係 1–40 隨機抽，夾到 30 幾格之後，差唔多
  每次都抽返已經翻開嘅格，得個計時重新計，操作員連撳幾次都好似冇反應。
  而家個轉盤 = 仲係愁哥哥嗰啲，再加**一兩個已經笑緊嘅號碼做陪跑**
  （淨係得愁哥哥嘅轉盤一眼睇得穿係做馬）。陪跑嘅大約係剩低數目嘅 6%，
  但最少一個：

  | 仲有幾多格愁哥哥 | 轉盤幾多個號碼 | 抽唔中嘅機會 |
  |---|---|---|
  | 40（啱啱開局） | 40 | 0% |
  | 35 | 37 | 5.4% |
  | 30 | 32 | 6.3% |
  | 10 | 11 | 9.1% |
  | 3 | 4 | 25% |
  | 1 | 2 | 50% |

- **抽中陪跑號碼 = 食白果**：嗰格本身已經喺度笑緊，所以乜都唔會變 —— 唔會翻新格，
  亦都唔會幫佢續時間。大螢幕出粉紅色「食白果 · 呢格已經喺度笑緊，今次冇格翻。」
  剩返最後一兩格嗰陣抽唔中嘅機會會明顯升，撳多兩次係正常嘅。
- 翻夠 30 格，大螢幕自動轉「**收官模式**」：已經翻開嘅格收起倒數同淡化號碼，
  淨低嘅愁哥哥用紫色框圈住，右邊出「仲差 N 格」。
- 40 格同一刻全部係笑弟弟 → 大螢幕出「全村都笑咗！」，手機嘅抽格掣即刻鎖住，
  要大螢幕撳「重新開始」先可以再玩。
- **重置只在大螢幕**：右下角「重新開始」撳兩次，或者撳 `R` 兩次。手機淨係可以抽格。

### 魔法

| 名 | 機率 | 效果 |
|---|---|---|
| 翻一格 | 60% | 正常翻一格 |
| 傳染笑 | 8% | 上下左右四格一齊翻 |
| 大笑三聲 | 8% | 另外三格一齊翻 |
| 笑到停唔到 | 7% | 嗰格計時加倍（4–6 分鐘） |
| 全村一齊笑 | 3% | 成行五格一齊翻開 |
| 愁雲密佈 | 6% | 翻嗰格，但收返一格已經翻開嘅 |
| 笑得唔夠久 | 5% | 兩格計時剩返一半 |
| 愁哥哥反悔 | 3% | 唔翻，仲要收返一格 |

魔法效果打橫出喺大螢幕左邊嗰塊大牌上面，用效果嘅顏色（綠＝好、粉紅＝衰、黃＝普通）
鋪滿成塊卡，撳完之後留 6 秒。

## 收營之後

`database.rules.json` 而家係全開（8 部手機唔使登入即開即用）。收咗營記得改：

```json
{ "rules": { "flipgame": { ".read": true, ".write": false } } }
```

再 `firebase deploy --only database`。

---

# Notes for whoever maintains this

## What changed from the design prototype

The prototype in `project/` runs on Claude Design's `dc-runtime`: it pulls
React, ReactDOM and **Babel standalone** off unpkg and compiles the component
in the browser on every load. That is right for a design tool and wrong for
eight phones on camp wifi. `public/` is the same design rebuilt as plain
HTML/CSS/JS — no framework, no build step, no runtime compilation.

Everything visual is transcribed from the prototype's inline styles; the
palette and metrics are unchanged.

### Changes after the first camp-day test

The copy is no longer the prototype's. It had drifted into 書面語／台式中文
(「這格的計時加倍」、「40 格全部變成笑弟弟，同一刻，就贏」), which reads wrong to a
Hong Kong hall; it is now plain Cantonese throughout.

Three behaviour changes came out of the same test:

- **The wheel is the closed boxes plus a few decoys** (`applyDraw` in `sync.js`).
  It used to pick uniformly from 1–40, so once ~30 boxes were open most presses
  landed on an already-open box and merely restarted its timer — the operator
  saw the button do nothing several presses running. A closed-only wheel fixes
  that but reads as rigged, so `DECOY_RATE` (6%, minimum 1) puts a couple of
  already-laughing numbers back in. Landing on one is a **miss**: no box opens
  and no timer moves. `verify-engine.js` asserts that every non-miss draw opened
  a closed square, that a miss leaves the board byte-identical, and that misses
  stay under 20% of draws.

  The minimum-of-1 is deliberate and has a sharp tail: at one square left the
  wheel is 2 numbers, so half the presses miss. That was the choice — the last
  square should be a gamble — but it is the thing to revisit first if the hall
  ever stalls at 39/40.
- **Endgame focus mode** past 30 open (`ENDGAME_AT` in `screen.js`, `.board.endgame`
  in `app.css`). A nearly-full board was 40 number badges and 40 countdowns on a
  wall of yellow, and the few 愁哥哥 left — the only thing anyone still had to act
  on — disappeared into it. Settled cells lose their countdown and fade their
  badge; whatever is still grey gets a purple ring.
- **The win locks the phone.** All 40 open used to leave the draw button live,
  so operators kept drawing into a finished round. It now disables and points at
  the projector's 重新開始.

The 魔法 card also moved from the right rail to the left column and got much
bigger — the hall should read *what* happened, not just which square lit up.

### The board artwork is pre-baked

Each of the 40 cells showed two faces, and each face ran
`background-blend-mode: multiply` against a face colour plus a CSS `filter`
(`grayscale(1) contrast(1.03)` on 愁哥哥, `saturate(1.12)` on 笑弟弟). That is
80 filtered compositing layers on the projector machine, every frame of every
flip.

`tools/bake-assets.py` computes that same blend and filter maths once, ahead
of time, and writes the result to WebP. The pages then draw plain bitmaps.

`tools/verify-parity.js` renders a cell both ways in Chromium and diffs the
pixels, so the shortcut stays honest:

```
worst channel difference across all slices: 8/255
mean channel difference: 0.3 – 1.2 / 255
```

The residual is WebP quantisation on hard edges, not a maths error — a wrong
matrix would move the *mean*, which is what the check actually gates on.

Side effect: **3752 KB of PNG became 215 KB of WebP.**

### One real bug fixed

The prototype stored flipped boxes as `boxes: { "1": …, "17": … }`. Realtime
Database silently converts an object whose keys are integers into a sparse
**array**, so `boxes` would come back with null holes in it — and the `愁雲密佈`
/ `愁哥哥反悔` effects pick a random key to un-flip, so they could "take back"
a hole instead of a real box, doing nothing while telling the hall they did.

Boxes are now keyed `"b1"`.. `"b40"`. `tools/verify-engine.js` asserts the
shape over 4000 draws.

### Other production bits

- **Firebase SDK is vendored** into `public/vendor/` (pinned 10.12.5) instead
  of loaded from gstatic, so a slow DNS lookup on camp wifi cannot stall the
  board. `sync.js` falls back to the CDN if the vendored copy is missing.
- **Service worker** (`sw.js`) precaches the shell. HTML is network-first so a
  redeploy is always picked up; assets are cache-first against a versioned
  cache. Bump `VERSION` in `sw.js` when you change CSS/JS.
- **Web app manifest** so the 8 phones can add 抽格機 to their home screen and
  run it without browser chrome.
- Fonts still come from Google Fonts, as in the design. They are behind
  `display=swap` with real system-CJK fallbacks — the pages render correctly
  before (or without) the webfonts. If camp wifi turns out to be bad enough to
  matter, self-hosting subset `.woff2` files is the next step.

## Verifying

```bash
npm i            # playwright, for the checks
npm run verify   # engine + end-to-end + pixel parity
```

- `verify:engine` — 4000 draws through the real `sync.js`: storage shape, the
  40-box ceiling, the win condition, that a draw never lands on an already-open
  box while a closed one is left, and that all 8 magic effects fire at their
  designed weights.
- `verify:app` — loads all three pages against a server that mimics Firebase's
  clean URLs, draws on the phone, and asserts the projector flips; checks the
  reset double-press, the timer sheet, that no reset control leaked onto the
  phone, that the board switches to endgame focus past 30, and that a win
  locks the phone's draw button.

  That server also **stubs `firebase-config.js` with an empty `databaseURL`**, so
  the checks always run in local sync mode. Without the stub they inherit
  whatever project the repo is pointed at and play a full game into the live
  camp database.
- `verify:admin` — drives /admin and then checks what a *different* page
  actually rolls: 400 draws with 負面魔法 off contain no gloom/half/regret, 食白果
  off produces no misses, the 好耐 preset really lands 5–8 minute boxes, a forced
  square is what comes up and is spent after one draw, the projector's
  countdowns follow the toggle, and settings survive 重新開始. A toggle that
  flips without reaching the draw would pass a naive test and still leave eight
  phones disagreeing.
- `verify:parity` — the pixel diff described above.

## Re-generating assets

```bash
npm run assets                                  # re-bake from project/assets/
npm run qr https://your-project.web.app/play    # after a domain change
```

The landing page prints the phone URL as text from `location.origin`, so that
line is always right even if `qr.svg` is stale.
