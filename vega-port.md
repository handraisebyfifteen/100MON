# Vega 版への移植 — 設計図

> 状態：ドラフト v0.1（2026-10-15）
> 設計書 §15 の第3週ぶん。ブラウザ版（`/web`）を React Native for Vega の `/app` に移す手順。
> Vega SDK の細かい API はまだ確かめていない。「要確認」と書いた項目は、Mac で SDK を入れたあと、
> Amazon Devices Builder Tools（MCP）と公式ドキュメントで確かめてから着手する。

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
| `font-family: var(--font-digits)` | `fontFamily: 'PressStart2P-Regular'`（同梱した TTF のファイル名に合わせる。要確認） |
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

### 1. 骨組み（10/16）

- `/app` を作り、`/core` と `/data` を読み込めるようにする（§5）
- `platform/` の3つ（入力・音・保存）を実験アプリの結果で作る
- `theme.ts`（色）、`layout.ts`（`px()`）
- タイトル → ゲーム → 結果 の切り替えだけの `App.tsx`

### 2. 1問が動く（10/17）

- `Game.tsx`：問題文のタイプライター、4択、確定、判定の丸バツ
- `FrameTimer`（§9）
- `PixelIcon`（§8）
- この時点でシミュレータで遊べること。**ここまでが最優先**

### 3. 100問通してスコアが出る（10/18）

- `Result.tsx`、記録の保存
- 連続正解のポップと音
- `Title.tsx`（スタート・記録・設定）

### 4. 残り（10/19）

- `Settings.tsx`、`Records.tsx`
- 見た目の細部（二重線、角の欠け、目盛りの縞、点滅）
- 自動再生（デモ動画用）

### 5. 提出に向けて（第4週）

- ランキング（バックエンドができてから）
- アプリ名・アイコン・提出用のパッケージ

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
