# Vega 版への移植 — 設計図

> 状態：ドラフト v0.1（2026-10-15）
> 設計書 §15 の第3週ぶん。ブラウザ版（`/web`）を React Native for Vega の `/app` に移す手順。
> Vega SDK の細かい API はまだ確かめていない。「要確認」と書いた項目は、Mac で SDK を入れたあと、
> Amazon Devices Builder Tools（MCP）と公式ドキュメントで確かめてから着手する。
> 2026-10-15：実験アプリで確かめた結果を §10 の 0 番の下に表でまとめた。各節の「要確認」はその表が優先。

---

## 1. 方針

- **ゲームの中身（`/core`）は1行も変えない。** 画面と時計と入力を Vega 側で用意し、`/core` に時刻を渡して返ってきた状態を描くだけにする。ブラウザ版と同じ作り
- **ブラウザ版の画面の構造・文言・見た目をそのまま写す。** 新しい見た目は考えない。部品ごとに「HTML/CSS → RN の View/Text」に置き換える
- **まず「1問が動く」ところまでを通す**（設計書 §15 の優先順位1）。見た目の細部（枠の二重線・角の欠け・点滅）はあとから
- **Vega 固有の API に触る場所を3つに閉じ込める**：入力（リモコン）、音、保存。ここだけ `app/src/platform/` にまとめ、画面からは直接呼ばない

---

## 2. ブラウザ版の仕分け

| ブラウザ版 | 行数 | Vega 版 | 備考 |
|---|---|---|---|
| `core/src/*` | — | **そのまま使う** | import の向きだけ合わせる（§5） |
| `data/*.json` | — | **そのまま使う** | Metro で JSON を読む |
| `web/public/sfx/*.wav` | 13 本 | **そのまま使う** | 再生の仕組みだけ Vega の API に替える（§6） |
| `@fontsource` の woff2 | 4 本 | **同じ書体を TTF で同梱** | RN は woff2 を読めない。Google Fonts の TTF（同じ OFL）を使う |
| `web/src/i18n.ts` | 218 | **そのまま使う** | `IconName`・`SoundName` の型 import だけ付け替え |
| `web/src/format.ts` | 58 | **そのまま使う** | 画面に依存しない |
| `web/src/demo.ts` | 70 | **そのまま使う** | 自動再生は Vega 版でもデモ動画の撮影に使える |
| `web/src/data.ts` | 14 | そのまま使う | パスの書き方を合わせるだけ |
| `web/src/storage.ts` | 96 | **書き直す（薄く）** | `localStorage` → 非同期の保存。起動時に読み終えてから画面を出す（§7） |
| `web/src/sound.ts` | 118 | **書き直す（薄く）** | `AudioContext` → Vega の音声 API。関数名と `SOUND_NAMES` は同じにしておく（§6） |
| `web/src/input.ts` | 73 | **書き直す（薄く）** | `keydown` → Vega のリモコンイベント。`useRemoteInput(handler)` の形は同じにする（§4） |
| `web/src/params.ts` | 52 | **定数ファイルに置き換える** | URL が無いので、`app/src/devParams.ts` に `demo / lang / ms / n / seed` を直書きする。提出ビルドでは全部 null |
| `web/src/fonts.ts` | 52 | **捨てる** | 同梱フォントは起動時から使える。読み込み待ちは不要 |
| `web/src/components/Stage.tsx` | 30 | **`px()` 関数に置き換える** | 画面サイズに合わせた拡大縮小を、CSS transform ではなく数値の換算で行う（§3） |
| `web/src/components/DebugOverlay.tsx` | 55 | 後回し | 必要になったら Text を1つ置く |
| `web/src/components/PixelIcon.tsx` | 86 | **書き直す** | SVG → ドットの行を View の横並びで描く。ライブラリに頼らない（§8） |
| `web/src/components/KeyHint.tsx` | 28 | 書き直す | 構造は同じ |
| `web/src/components/FrameTimer.tsx` | 84 | **書き直す** | Web Animations API が無い。ブラウザ版の「毎フレーム計算する」側の作りを使う（§9） |
| `web/src/screens/Title.tsx` | 95 | 書き直す | 構造は同じ。`focus` の state で行を選ぶ作りをそのまま写す |
| `web/src/screens/Settings.tsx` | 218 | 書き直す | 同上 |
| `web/src/screens/Records.tsx` | 113 | 書き直す | 表（`<table>`）は View の行に |
| `web/src/screens/Result.tsx` | 97 | 書き直す | 構造は同じ |
| `web/src/screens/Game.tsx` | 237 | 書き直す | 構造は同じ。`requestAnimationFrame` のループはそのまま使える |
| `web/src/App.tsx` | 323 | 書き直す | 画面の切り替えと記録の保存。`wakeLock` の部分は捨てる |
| `web/src/styles.css` | 1063 | **StyleSheet に写す** | 一番手間がかかる。§3 の換算表に沿って機械的に写す |

書き直す量の見込み：画面5つ＋部品3つ＋ platform 3つで、ブラウザ版の `web/src` とほぼ同じ 2,500 行前後。

---

## 3. 画面の大きさ

ブラウザ版は 1920×1080 の px で組み、`Stage` が全体を CSS transform で縮めている。
RN には transform で全体を縮める作りが向かないので、**数値を換算する関数**にする。

```ts
// app/src/platform/layout.ts
import { useWindowDimensions } from 'react-native';
export function useStage() {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / 1920, height / 1080);
  const px = (v: number) => Math.round(v * scale);
  return { px, offsetX: (width - 1920 * scale) / 2, offsetY: (height - 1080 * scale) / 2 };
}
```

- `styles.css` の `64px` は `px(64)` に写す。フォントサイズも同じ
- 要確認：Vega の `useWindowDimensions` が 1080p の TV で何を返すか（1920×1080 か、密度で割った 960×540 か）。どちらでも上の式で動く
- 画面の端 54px / 96px に文字を置かないルール（`styles.css` の冒頭）はそのまま守る

### `styles.css` → StyleSheet の換算表

| CSS | RN |
|---|---|
| 二重線の枠（`border` + `box-shadow: inset`） | View を2枚重ねる（外側 `borderWidth: px(8)` 水色、内側 `borderWidth: px(8)` 青） |
| 角を欠く `clip-path: polygon(...)` | **後回し**。角の 8px に背景色の小さな View を4つ重ねて欠けたように見せる |
| `animation: ... steps(n)` | `setInterval` か `requestAnimationFrame` で state を段階的に切り替える。`Animated` のなめらかな補間は使わない（段階的な動きが見た目の決まり） |
| `text-shadow: 4px 4px 0` | `textShadowOffset: {width: px(4), height: px(4)}, textShadowRadius: 0` |
| `font-family: var(--font-digits)` | `fontFamily: 'Press Start 2P'`（同梱した TTF のファイル名から拡張子を除いたもの。§10-0 で確認済み） |
| `letter-spacing` | `letterSpacing` |
| `display: grid`（十字の4択） | `position: 'absolute'` で4つを座標指定。グリッドは無い |
| `:root` の色変数 | `app/src/theme.ts` に同じ名前で定数化 |

---

## 4. 入力（リモコン）

ブラウザ版の `useRemoteInput((input, at, repeat) => ...)` と同じ形にする。`input` は `up / down / left / right / ok / back` の6種類。

- 要確認：Vega でリモコンのキーを受け取る API（`TVEventHandler` / `useTVEventHandler` 相当があるか、それとも `@amazon-devices/` のパッケージか）
- 要確認：イベントに押した瞬間の時刻が入っているか。**無ければ受け取った時刻（`performance.now()`）で記録する**。ブラウザ版の `eventTime()` と同じ考え方で、ずれは数ミリ秒なので許容する
- 要確認：「戻る」ボタンを押したときにアプリが終了しないようにする方法（ゲーム中は中断、タイトルでは終了、という切り分け）
- 要確認：押しっぱなしの連続入力（`repeat`）が区別できるか。できなければ、同じキーの間隔が短すぎるものを捨てる
- RN の標準のフォーカス移動（`hasTVPreferredFocus` など）は**使わない**。ブラウザ版と同じく、画面ごとに `focus` の番号を state で持ち、矢印で動かす。4択は方向キー1回で決まる作りなので、フォーカス移動の仕組みが邪魔になる

---

## 5. `/core` と `/data` の読み込み

- `/app` は `/core` の外にあるので、Metro の `watchFolders` に `../core` と `../data` を足す
- `@core` のエイリアスは `babel-plugin-module-resolver`（または Metro の `resolver.extraNodeModules`）で `../core/src/index.ts` に向ける
- `/core` は `tsconfig.base.json` の `verbatimModuleSyntax` を使っている。Vega 側の Babel/TS 設定で `import type` が通ることを確かめる
- 要確認：Vega の Metro が `/app` の外のファイルを扱えるか。扱えなければ、ビルド前に `/core` と `/data` を `/app/src/` にコピーする npm script で逃げる

---

## 6. 音

ブラウザ版の `sound.ts` の関数（`initSound / playSound / setSoundSettings / SOUND_NAMES`）をそのまま残し、中身だけ替える。

- 要確認：Vega で短い効果音を低遅延で鳴らす方法。候補は `@amazon-devices/react-native-w3cmedia`（HTML5 の `Audio` 相当）。13 本すべてを起動時に読み込んでおく
- 要確認：同じ音を続けて鳴らせるか（`type` は 70ms 間隔で鳴る）。無理なら文字送りの音は間引くか、諦める
- 遅延が 100ms を超えるようなら、正解・不正解の音だけ残して文字送りの音は切る（設定画面で1つずつ切れる作りを活かす）
- wav は 652KB。アプリの大きさとしては問題ない

---

## 7. 保存

- 要確認：Vega で使える KV 保存（`@react-native-async-storage/async-storage` の Vega 版があるか）
- `localStorage` と違って非同期なので、**起動時に読み終えるまで画面を出さない**。ブラウザ版が書体の読み込みを待っていたのと同じ位置に置き換える
- 保存するキーと中身はブラウザ版と同じ（`qth.settings.v1 / qth.player.v1 / qth.runs.v2`）

---

## 8. ドット絵の記号（PixelIcon）

- SVG ライブラリを入れず、`ICONS` の文字列（`'..###..'`）を**行ごとに横に並べた View** で描く。横に続くドットは1つの View にまとめる（ブラウザ版の rect のまとめ方と同じ）
- 大きさは `px()` で換算し、ドット1つの幅を整数にする（境界がにじまないように）
- 向き（矢印の回転）は `transform: [{ rotate: '90deg' }]`

---

## 9. 枠タイマー（FrameTimer）

- ブラウザ版の「アニメーションの仕組みが無いブラウザ向け」の側（`requestAnimationFrame` で毎フレーム `transform` を計算する作り）をそのまま使う
- 棒は4本の View。`transform: [{ scaleX }]` で縮める。目盛りの数（上下54・左右13）はブラウザ版と同じ
- 目盛りの縞模様（16px ごと）は、後回し。まずは1本の棒が段階的に縮むところまで
- 時間の計測は RunEngine がタイムスタンプで行うので、描画が遅れても記録はずれない（ブラウザ版と同じ）

---

## 10. 作業の順番

### 0. Mac での準備（Replit ではできない）

1. Vega Studio（VS Code 拡張）と Vega SDK、Vega Virtual Device を入れる
2. サンプルアプリをシミュレータで動かす
3. Amazon Devices Builder Tools（MCP）を Claude Code につなぐ
4. **小さな実験アプリで、§4〜§7 の「要確認」を潰す**（半日）
   - リモコンのキーが取れるか、時刻は入っているか
   - 同梱した TTF が使えるか
   - wav が鳴るか、遅延はどれくらいか
   - 保存ができるか
   - `useWindowDimensions` の値

ここで詰まったものは、設計を変える（例：音は正解・不正解だけ、保存はメモリだけ、など）。

#### 実験の結果（2026-10-15、Vega SDK 0.24.12112 / CLI 1.4.4、Apple Silicon、Vega Virtual Device）

実験アプリは `~/qth-probe`（helloWorld テンプレート、RN 0.83）。このリポジトリには入れていない。

| 項目 | 結果 | Vega 版での扱い |
|---|---|---|
| キーを受け取る API | `@amazon-devices/react-native-kepler` の `useTVEventHandler` で取れた。manifest に `com.amazon.inputd.service` を入れている | `useRemoteInput` の中身をこれにする |
| イベントの中身 | `{eventType, eventKeyAction, eventId}` だけ。**時刻は無い**。`eventKeyAction` は 0 が押した・1 が離した | 0 のときだけ処理する。時刻は受け取った瞬間の `performance.now()` |
| 決定ボタンの名前 | `inputd-cli` の `KEY_ENTER`（＝キーボードの Enter）は **`enter`** で来る。純正リモコンの中央は文書上 `select` | `select` と `enter` の両方を `ok` にする |
| 押しっぱなし | 0 が**同じ `eventId` のまま**繰り返し来る。最初の繰り返しまで約 540ms、以降約 200ms 間隔 | 直前の押下と `eventId` が同じなら `repeat = true` |
| 戻る | `useTVEventHandler` に `back` が来るのに加えて、離したときに `BackHandler` の `hardwareBackPress` が呼ばれる。`true` を返すと終了しない、`false` で**アプリが終了した** | 戻るは `BackHandler` だけで扱い、`useTVEventHandler` 側の `back` は捨てる（二重に動かないように）。タイトルでは `false` |
| フォーカス | 画面にフォーカスできる要素が無くてもキーは届いた（1 回だけ確認）。念のため見えない `Pressable` を 1 つ置いた版でも同じ | §4 の方針どおり、RN のフォーカス移動は使わない |
| `useWindowDimensions` | **960×540、scale 2**（`useKeplerWindowDimensionsV2` も同じ）。`Dimensions.get('screen')` は 0×0 で使えない | §3 の式で倍率 0.5 になり、そのまま動く。丸めは `Math.round` より `PixelRatio.roundToNearestPixel`（実画素で揃う） |
| 保存 | `@react-native-async-storage/async-storage` を `npm:@amazon-devices/react-native-async-storage__async-storage@~2.1.0` で入れて（`overrides` も同じ）、読み書きできた。2 キーの読み込みは約 30ms。アプリを止めて起動し直しても残った（画面でも、2 回目の起動で前回の値から続いて数えた）。`vega run-app` で入れ直すと消える | §7 のとおり。起動時に読み終えてから画面を出す |
| 効果音の鳴らし方 | `@amazon-devices/react-native-w3cmedia` の `AudioPlayer`（React の部品ではないクラス）を音ごとに 1 つ作り、`initialize()` → `src` を設定。14 本の準備に約 1.3 秒 | 起動時の読み込み待ちに入れる |
| 同梱 wav の場所 | `assets/sfx/*.wav` に置くと `.vpkg` の `assets/sfx/` に入る。`src` は **`/pkg/assets/sfx/<名前>.wav`**。`file:///pkg/...` は GStreamer がファイル名として探して失敗する | |
| 遅延 | `play()` から `playing` イベントまで 1〜6ms。ただし**耳で聞いた遅れは未確認** | |
| 2 回目以降の再生 | 一度鳴り終わるとプレイヤーが閉じ、`currentTime = 0` → `play()` ではすぐ `ended` になって**鳴らない**。`src` を入れ直してから `play()` すると鳴り直す（`playing` まで約 60ms） | 鳴らすたびに `src` を入れ直す。60ms が気になる音は、プレイヤーを 2 つ用意して交互に使い、使い終わった方を先に入れ直しておく |
| 再生の長さ | `play()` から `ended` まで、1.8 秒の音で約 2.24 秒、1.3 秒の音で約 1.75 秒。どちらも音の長さより約 0.45 秒長い | 0.45 秒が「鳴り始めの遅れ」か「終わりの余白」かは耳で確かめる |
| 耳で聞いた結果（シミュレータ、Mac → HDMI → テレビのスピーカー） | **長い音（0.4 秒以上）は聞こえるが、短い音（0.3 秒以下）は聞こえない。** 無音をループで流し続けて出力経路を起こしておいても変わらない。イベント上は `playing` → `ended` が来ていて、鳴ったことになっている | **シミュレータでは決着がつかないので打ち切り（約 1.5 時間使った）。** 実機で確かめるまで、音の作りは下の「決めたこと」で進める |
| 試した対策 | ① 頭に無音を足す：結果があいまい。② 先に `play()`→`pause()` で止めておく「準備済み」方式：短い音は `pause()` が間に合わず、**準備した瞬間に鳴ってしまう**（0.8 秒の無音付きなら漏れない）。使えない | |

**音について決めたこと（2026-10-15）**

- Vega 版の `sound.ts` は、音ごとに `AudioPlayer` を 1 つ持ち、鳴らすたびに `src` を入れ直して `play()` する、いちばん単純な作りにする。設定画面で音を 1 つずつ切れる作りはそのまま残す
- 短い音がシミュレータで聞こえない件は、**実機（Vega OS の Fire TV）で確かめるまで保留**。実機でも聞こえなければ、正解・不正解・タイムアップ・終了の長い音だけ残し、カーソル・文字送りの音は切る（§6 に書いたとおり）
- 実験アプリ `~/qth-probe` は、実機が手に入ったときに同じ手順で確かめるために残しておく（操作は `src/App.tsx` の冒頭に書いてある）
- 手元の Fire TV は **Fire OS** なので Vega 版は動かない。Vega OS の実機（2025 年の Fire TV Stick 4K Select など）が無い間は、音の確認はできない。提出前に実機を用意するか、長い音だけの構成で提出するかを第 4 週に決める
| 連続再生 | `type` を 70ms 間隔で 10 回発行はできた。**10 回聞こえるかは未確認**。`setInterval(70)` 10 回の所要時間は 704〜931ms とばらついた | 文字送りなど時間で進むものは、呼ばれた回数ではなく経過時刻から計算する（ブラウザ版と同じ） |
| w3cmedia の版 | npm の RN 0.83 向けは `2.3.4-rn-83`（`rn83-alpha` タグ）。ビルド時に「kepler-compatibility.json に無い版」と警告が出るが、ビルドは通る。実行時は端末側の 2.3.2 が使われた | 警告は無視してよいか、正式版が出たら差し替え |
| w3cmedia の manifest | `com.amazon.mediametrics.service`・`mediabuffer`・`mediatransform`・`audio.stream`・`audio.control`・`media.server` を `[wants]` に入れた | 同じものを入れる |
| 同梱 TTF | `assets/fonts/` に置くと `.vpkg` に入り、**画面で効いた**（Press Start 2P の数字、DotGothic16 のかな・漢字とも）。`fontFamily` はファイル名（拡張子なし）で指定する。`Press Start 2P.ttf` → `'Press Start 2P'`、`PressStart2P-Regular.ttf` → `'PressStart2P-Regular'` のどちらも効いた | `styles.css` と同じ名前にそろえて `Press Start 2P.ttf` / `DotGothic16.ttf` で同梱する |
| 記号の文字 | `◀` `▶` が書体に関係なく**カラー絵文字**で表示された | 矢印などの記号は文字で出さず PixelIcon で描く（ブラウザ版も問題文の `−` 以外は使っていない） |

ほかに分かったこと

- **リリースビルドでは `console.log` が端末のログに出ない。** `console.warn` は出る。ログは `vega exec vda -s <serial> shell "loggingctl log -f -o short_precise"` で流して `grep -a` で拾う
- 音のプレイヤーは 1 本ごとに大量のログを出し、端末のログ上限（毎秒 300 行）で起動直後の他のログが間引かれる
- 音のプレイヤーが「PlayerSession を作れない」というエラーをログに出す（`com.amazon.media.playersession.service` を入れていないため）。鳴らすのには影響していない。メディア操作（再生・一時停止ボタン）を奪っていないかは未確認
- 仮想デバイスの中のシェル（`com.amazon.dev.shell.service`）が落ちて、ログもキー送信もできなくなることがある。`vega virtual-device stop` → `start` で戻った
- 仮想デバイスでは公式のスクリーンショット（`gwsi-tool-screenshooter`）は使えない（実機だけ）

**シミュレータで動かす（毎回の手順）**

`app/` で次の1行。シミュレータの起動 → ビルド → 入れる → 開く を続けてやる（`app/tools/sim.sh`）。

```sh
cd app
npm run sim                  # ふだんはこれ
npm run sim -- --no-build    # コードを変えていないとき（入れ直すだけ）
npm run sim -- --clean       # 音や画像を変えたのに反映されないとき（build/ を消して作り直す）
```

- シミュレータのウィンドウの「リモコン」をクリックして操作する（キーボードの矢印は効かない。§10-0）
- 動かないとき：`vega virtual-device stop` → `npm run sim`（長く動かすとシミュレータの中の通信が切れることがある）
- Replit の SSH 先では動かない。Vega SDK は macOS か Ubuntu（x86_64）が対象で、シミュレータの画面を手元に出す必要もあるため、`app/` の作業はこの Mac でやる

### 1. 骨組み（10/16）— **済（2026-10-15）**

- `/app` を作り、`/core` と `/data` を読み込めるようにする（§5）
- `platform/` の3つ（入力・音・保存）を実験アプリの結果で作る
- `theme.ts`（色）、`layout.ts`（`px()`）
- タイトル → ゲーム → 結果 の切り替えだけの `App.tsx`

できたこと：シミュレータで タイトル → ゲーム → 3問回答 → 結果 → タイトル → ゲーム → 戻る → タイトル が通った（`inputd-cli` でキーを送り、`[qth]` のログで確認）。
ゲーム画面は進行と音の呼び出しまでブラウザ版と同じ。枠タイマー・判定の大きな丸バツ・点滅は §10-2。記録・設定の画面は §10-4。

作りながら分かったこと：

- Metro は `watchFolders` に `../core` と `../data` を足し、`resolver.extraNodeModules['@core']` を `../core/src` に向ければ読める。ただし `/core` のファイルが使う `@babel/runtime` が見つからないので、`resolver.nodeModulesPaths` に `app/node_modules` を足す
- `data/*.json` は `import rawQuestions from '../../data/questions.temp.json'` でそのまま読める
- `react-native build-vega` が `manifest.toml` の `[needs]` に使っているモジュール（w3cmedia、async-storage など）を自動で書き足す。手で書く必要はない
- `performance.now()` は RN にあるが型が無いので、`src/global.d.ts` で宣言した
- `devParams.ts` の `debug` を true にすると、画面の切り替えと受け取ったキーを `[qth]` で端末のログに出す。確認のときは `questionLimit: 3` にすると 3 問で結果まで行ける
- シミュレータを長く動かしていると、`loggingctl log -f` にアプリのログが流れなくなった。`vega virtual-device stop` → `start` で戻る

### 2. 1問が動く（10/17）— **済（2026-10-15、見た目の確認待ち）**

- `Game.tsx`：問題文のタイプライター、4択、確定、判定の丸バツ
- `FrameTimer`（§9）
- `PixelIcon`（§8）
- この時点でシミュレータで遊べること。**ここまでが最優先**

できたこと：ブラウザ版の演出をひととおり写した。真ん中に大きく出る丸バツ（正解は大きく出て止まる、不正解と時間切れは左右に揺れる）、枠の中の色の一瞬の点滅、正解数の跳ね、連続正解の跳ねと節目の点滅、選択中の枠と OK の点滅、READY の点滅、枠タイマー（目盛り 54 / 13 で段階的に減る、残りわずかで赤）。
CSS の `animation: steps(n)` は `components/steps.ts` の `useSteps`（決めた時刻で描き直す）と `useBlink`（周期で切り替える）に置き換えた。時刻は `styles.css` の keyframes の % から出している。
まだ無いもの：枠の角の欠け、枠タイマーの目盛りの縞模様（§10-4）。

**引っかかり（ラグ）の調査と対策（2026-10-15）**

自動再生（`demo`）で 10 問走らせ、フレームの間隔を測った（`debug` のとき `[qth] frames` でログに出る）。

| 条件 | 1問あたり 50ms 超の引っかかり | 最長 |
|---|---|---|
| `requestAnimationFrame` のループ、音あり | 2〜10 回 | 350〜425ms |
| タイマーで 60fps に抑えたループ、音あり | 2〜10 回 | 350〜446ms |
| 同、音なし | **0 回** | 21〜40ms |
| 同、音あり、入れ直しを鳴り終わりに移してプレイヤーを複数持つ | 2〜6 回 | 100〜150ms |
| 同、文字送りの音だけオフ（下の 4。Vega 版の既定） | **0 回** | 29〜48ms |

分かったこと：

1. **Vega の `requestAnimationFrame` は画面の更新に同期していない。** 1 問で 5,000〜15,000 回（毎秒 1,000 回以上）呼ばれ、JS スレッドを食いつぶす。`platform/frame.ts` の `startFrameLoop`（`setTimeout` 16ms）に置き換えた。ゲームの進行ループと枠タイマーの両方
2. **引っかかりの正体は効果音の `src` の入れ直し。** 前の再生が終わっていないパイプラインを壊して作り直すと 100〜360ms、終わっていれば 20〜60ms（たまに 140ms）JS スレッドが止まる。`play()` 自体は 1ms。ライブラリの JS 側のログ（`LogUtil.setLogLevel`）を止めても変わらない
3. 対策：入れ直しを `ended` のとき（鳴り終わり）に行い、鳴らすときは `play()` だけにした。鳴り終わっていないプレイヤーしか無ければ飛ばす。それでも文字送りの音（70ms おき）は入れ直しが途切れず、20〜60ms の引っかかりが続く
4. ~~Vega 版は文字送りの音を最初からオフにする~~ → 下の「効果音の作り直し」で不要になった。全部の音をオンに戻した

**効果音の作り直し（2026-10-16）**

w3cmedia のまま入れ直しを鳴り終わりに移した版で、**アプリが強制終了された**（AppNotResponding。JS スレッドが 7 秒以上止まった）。クラッシュ記録を変換すると、止まっていたのは `src` の入れ直し。w3cmedia の `AudioPlayer` は動画用の重いプレイヤーで、**同時に開いておける数に上限がある**らしく、ほかのプレイヤーが閉じるのを待って 1 回 1〜7 秒止まっていた（プレイヤーを 18 個持たせたので悪化した）。

試したもの：

| 方式 | 引っかかり（40 問） | 落ちたか | メモリ（PSS） | 判断 |
|---|---|---|---|---|
| w3cmedia の `AudioPlayer` を音ごとに持つ | 多数、最長 7 秒 | ANR で強制終了 | 約 93MB | やめた |
| 見えない WebView の Web Audio（WebView 4.0 から使える） | 0 回、最長 38ms | 起動直後に OS の描画部分（`libkepler_slatium.so`）で SIGSEGV。3 回中 2 回 | 約 245MB（WebView のプロセスが別に約 87MB） | やめた。重いうえに落ちる |
| **`keplerscript-audio-lib` の `AudioPlaybackStream` に生の PCM を流し込む** | **3 回、最長 59ms** | なし | **約 85MB** | **採用** |

採用した作り（`app/src/platform/sound.ts`）：

- ファミコンの音源と同じ考え方。音声の出力を 1 本だけ開いておき、512 フレーム（約 11.6ms）ごとに「いま鳴っている音を足し合わせたもの」を `writeAsync` で流し込み続ける。何も鳴っていないときは無音を流す
- `writeAsync` は出力に空きができるまで待ってから返るので、ループは自然に実時間に揃う（1 秒に約 86 回、詰まり・エラーなし）
- 音のデータは `app/tools/embed-sfx.mjs` が `web/public/sfx/*.wav` から PCM だけを取り出し、`app/src/generated/sfxData.ts` に base64 で埋め込む（ビルドのたびに作り直す。git には入れない）。起動時に `Int16Array` に戻す（14 本、約 650KB）
- 鳴らすときは「この音を重ねる」と一覧に足すだけ。同時に鳴らせるのは 8 つまで
- 背景に回ったら出力を閉じ、前面に戻ったら開き直す
- 出力の開き方：`FLAG_LOW_LATENCY` と、1 回の長さ・溜める数の指定は、シミュレータでは「error starting playback stream」で断られた。指定を外した `CONTENT_TYPE_GAME`・`USAGE_MEDIA`・モノラル・44.1kHz で開けた。実機では低遅延の指定が通るかもしれないので、上から順に試す作りにしてある
- まだ確かめていないこと：シミュレータで短い音が聞こえるか、鳴るまでの遅れ（耳で）

### 3. 100問通してスコアが出る（10/18）

- `Result.tsx`、記録の保存
- 連続正解のポップと音
- `Title.tsx`（スタート・記録・設定）

### 4. 残り（10/19）

- `Settings.tsx`、`Records.tsx` — **済（2026-10-16、シミュレータで見え方を確認）**。ブラウザ版と同じ行・同じ操作。記録の表は RN に table が無いので、View を横に並べて 6 列を等分した
- 見た目の細部 — **済（2026-10-16、シミュレータで見え方を確認）**
  - 二重線：§10-1 で済み（`Panel.tsx`）
  - 角の欠け：`clip-path` が無いので、地の色の 8px の View を4隅にかぶせて欠いたように見せる（`Panel.tsx` の `notchColor`）
  - 目盛りの縞：`repeating-linear-gradient` が無いので、16px ごとに幅 4px の黒い View を棒の上に並べる（上下 109 本、左右 14 本。一度作って動かさない）
  - 点滅：タイトルと設定の選んでいる行の外枠を、白と金で 400ms 周期に切り替える（`useBlink`）。ゲーム画面の選択肢と OK は §10-2 で済み
- 自動再生 — **済**。`devParams.ts` の `demo: true` で走る（§10-2 のラグの計測で使った）

シミュレータを起動し直した直後、`vega exec vda install` が `failed to run abb_exec. Error: closed` で入らないことがあった。`vega device install-app -d emulator-5554 -p build/x86_64-release/qthehundred_x86_64.vpkg` なら入る。

### 5. 提出に向けて（第4週）

- ランキング — **済（2026-10-16、走行終了の申告は期間が開いてから確認）**。Vega 版だけに付ける（ブラウザ版は TV での見え方の確認用なので付けない）
  - `platform/api.ts`：サーバー（`backend/README.md` の ApiUrl）を `fetch` で呼ぶ。走行開始・走行終了・ランキング取得の3つ。個人成績はいまの「記録」画面で足りているので呼ばない。manifest に通信の権限は要らなかった（シミュレータから 200 が返った）
  - 走行の流れ：スタートを押すとタイトルで「サーバーにつないでいます…」を出して `POST /runs/start`。**返ってきた種と設定で RunEngine を作る**（サーバーが同じ種・設定で検証するため）。終了したら結果画面を出してから `POST /runs/{runId}/finish` を送り、返ってきた順位と参加人数を結果画面の下に出す
  - つながらない・期間外・回数切れのときは、端末内の記録だけの走行にする。ゲーム画面に「オフライン」の札、結果画面に「ランキング対象外：理由」を出す。お試し（`questionLimit`）と自動再生は申告しない
  - `screens/Ranking.tsx`：上位10人と自分（設計書 §10）。OK でもう一度読む、左・戻るでタイトル
  - `devParams.ts` の `online: false` でサーバーを呼ばずに走れる（ラグの計測用）
  - 確認したこと：シミュレータから `GET /leaderboard` が 200（1.8 秒）、`POST /runs/start` が 403 `PERIOD_CLOSED`（仮ピリオド `temp-P00` は 10/19 開始）→ オフラインの走行に切り替わった。走行終了の申告と順位の表示は、期間が開いてから（または期間を今日を含むように入れ直してから）確かめる
  - **確定（2026-10-16）**：設定画面の「表示速度」は、ランキングに載る（サーバーに申告した）走行には効かない。サーバーが決めた表示速度（設計書 §6 の確定値：日本語 150ms・英語 50ms）で走る。サーバーは自分の設定値で1問ごとの時間を検証し、スコアを計算し直すため。表示速度の設定が効くのは、オフラインの走行とお試しだけ。設定画面で「表示速度」の行を選ぶと、下に「ランキングの走行には効きません」と出す（下のキー案内に重ならないよう、速度の警告と同じ位置。警告が出ているときは警告を優先）
- アプリ名・アイコン・提出用のパッケージ
  - アプリ名とアイコン — **済（2026-10-16、ビルドが通りシミュレータで起動）**。`manifest.toml` の `title = "100MON"`、`icon = "@image/icon.png"`（`assets/image/icon.png`、512×512 の PNG・1MB 以下が Vega の決まり）
  - パッケージ ID は `com.byfifteen.hyakumon`（ストアに出したら変えられない）。ID の区切りごとに英字で始める決まりがあるので `100mon` は使えない。`package.json` の `qthehundred` はビルドしたファイルの名前になるだけなので、そのままにした
  - シミュレータのホーム画面のタイルは、このアイコンの中央を横長に切り抜いて出す（上下が切れる）。タイルで見せたいものは中央の 512×288 の帯に収める。そのため、バナーから十字キーと「100」「MON」を切り出し、左に十字・右に2段の文字で帯の中に並べ直した（2026-10-16）
  - タイトル画面の名前も「100MON」にした（日本語・英語とも Press Start 2P。「仮称」の札は外した）
  - ストアの掲載用バナー（1280×720）は提出のときに登録する
  - 残り：実機（armv7）向けのリリースビルドと提出

---

## 11. 迷ったときの決まり

- ブラウザ版と Vega 版で**見た目や動きが食い違ったら、ブラウザ版に合わせる**（ブラウザ版は TV で見え方を確認済み）
- Vega 固有の制約で同じにできないところは、この文書の該当する節に「できなかったこと」として書き足す
- 設計書（`design.md`）の記述と食い違ったら、設計書の方を直す

---

## 付録：Mac での準備手順（Vega SDK 0.24 の公式ドキュメントで確認、2026-10-15）

### 1. 下準備

- Homebrew、Node.js（18 以上。MCP が Node 26 で動かない報告があるので 24 が安全）、VS Code
- ターミナルで（Apple Silicon では Rosetta 2 も入る）
  ```
  [[ $(arch) == "arm64" ]] && softwareupdate --install-rosetta --agree-to-license; brew update && brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman
  ```

### 2. Vega SDK を入れる（10〜15分）

- VS Code を閉じてから
  ```
  curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash && source ~/vega/env
  ```
- 聞かれたら Enter（保存先 `~/vega/sdk`、SDK＋Vega Virtual Device、Vega Studio 拡張）
- 確認：`vega --version` で Active SDK Version と Vega CLI Version の2行
- 新しいターミナルで `vega` が無ければ `source ~/.zshrc`

### 3. サンプルアプリをシミュレータで動かす

- VS Code → Vega アイコン → Vega Studio パネル → Projects の「+」
  - テンプレート `helloWorld`（RN 0.83）。`helloWorld-rn72` は RN 0.72
  - 名前は英数字のみ、パッケージ名は `com.<名前>.<アプリ名>`
- Devices の VirtualDevice:Tv → 再生。シミュレータの窓が出るまで待つ
- プロジェクト名の横の build → Output タブ（Vega）に `info build-kepler completed`
- 再生ボタンでアプリが起動する
- CLI でやる場合：
  ```
  vega project generate --template helloWorld --name sampleapp --packageId com.example.sampleapp --outputDir sampleapp
  cd sampleapp && npm install && npm run build:app
  vega virtual-device start            # 起動が遅いときは --timeout 120
  vega run-app build/aarch64-release/sampleapp_aarch64.vpkg com.example.sampleapp.main -d VirtualDevice
  ```
  Intel Mac は `x86_64-release/…_x86_64.vpkg`。実機（Fire TV）は `armv7`
  - `.vpkg` は `build/private/kepler/@amazon-devices/<名前>/undefined/vega/<arch>/Release/@amazon-devices/` の下にもできる。VS Code の Vega Studio でビルドしたときはこちらにしかできなかった。CLI の `npm run build:release` では両方にできた
- `manifest.toml` に `[os.version]` が無いとビルドが失敗する。その場合は `vega project update-manifest --os-min 1.2 --os-version 1.2`

### 4. MCP（Amazon Devices Builder Tools）を Claude Code につなぐ

- このリポジトリをクローンしたフォルダで
  ```
  npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli --force
  npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest check-status --agent claude-code-cli
  ```
- Claude Code で「Amazon Devices Builder Tools のツール一覧を出して」と聞いて、`search_documentation` などが出れば成功
- 外す場合：`npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest clean-context`
- ドキュメント検索の問い合わせだけ Amazon に送られる。コードは送られない

### 5. そのあと

Claude Code に「vega-port.md の §10 の 0 番、要確認の実験アプリから始めて」と伝える。

### 参照

- https://developer.amazon.com/docs/vega/0.24/install-vega-sdk
- https://developer.amazon.com/docs/vega/0.24/build-an-app
- https://developer.amazon.com/docs/vega/0.24/run-apps
- https://developer.amazon.com/docs/adbt/get-started.html
