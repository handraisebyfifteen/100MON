# 100MON — Fire OS 版（/fos）

Fire TV（Fire OS）向けのアプリ。中身（画面・ゲーム・ランキング）は Vega 版と同じ `/app/src` をそのまま使い、
Fire OS 用に作り直したのは **リモコン入力** と **効果音** の2つだけ。

| | Vega 版（/app） | Fire OS 版（/fos） |
|---|---|---|
| React Native | 0.83（Amazon の Kepler 版） | 0.83（`react-native-tvos`。Android TV 向けの React Native） |
| 画面・ゲーム・ランキング | `app/src/` | 同じ `app/src/` を読む（`metro.config.js` の `watchFolders`） |
| リモコン入力 | `app/src/platform/input.ts` | `fos/src/platform/input.ts`（`input.android.ts` が振り分ける） |
| 効果音 | `app/src/platform/sound.ts`（生の PCM を流し込む） | `fos/src/platform/sound.ts` → Android の SoundPool（`SfxModule.kt`） |
| 保存・通信・画面の換算 | `app/src/platform/{storage,api,layout,frame}.ts` | 同じファイルがそのまま動く |
| パッケージ名 | `com.byfifteen.hyakumon` | 同じ（ストアで1つの登録にまとめるため） |

## しくみ：どうやって2つの OS で同じコードを使っているか

- Metro（React Native のバンドラー）は、Android 向けにビルドするとき `input.ts` より `input.android.ts` を優先して読む。
  `app/src/platform/input.android.ts` と `sound.android.ts` は、`/fos/src/platform/` の実装を指すだけの1行のファイル。
  Vega 版のビルド（platform は `kepler`）はこれらを見ないので、Vega 版には影響しない
- 効果音の名前と設定の型は `app/src/platform/soundNames.ts` にまとめ、両方から使う
- **リモコンのキーが届く条件**（2つとも無いと、決定も十字キーも無反応で「戻る」だけ効く。エミュレータで確認した）
  1. Android はキー入力を「フォーカスを持つ View」の系統にしか配らない。このアプリはフォーカスできる部品を置かないので、
     `MainActivity.kt` が画面を得るたびに React の根元の View をフォーカス可能にしてフォーカスを与えている
  2. `react-native-tvos` の Android 側は、標準では「離したとき」しか JS に渡さない。`MainApplication.kt` で
     `ReactFeatureFlags.enableKeyDownEvents = true` にして「押したとき」も渡している（`fos/src/platform/input.ts` は押したときに反応する）
  - 押しっぱなしは、約 300ms 後から `longDown` などの名前で約 300ms おきに来る。`input.ts` が `repeat = true` に変換する（Vega 版の約 200ms おきより少しゆっくり）
- `fos/tsconfig.json` は `moduleSuffixes: [".android", ""]` で同じ振り分けをし、Vega 専用の2ファイルは `exclude` している

## 必要なもの（Mac）

- Android Studio（Android SDK。`~/Library/Android/sdk` に入っていること）
- JDK 17：`brew install openjdk@17`（React Native は 17 でコンパイルする決まり。無いと Gradle が自動取得を試みて失敗する）
- Node 20 以上

## Fire TV で動かす（毎回の手順）

Fire TV 側で一度だけ：**設定 → My Fire TV → 開発者オプション → ADB デバッグ** をオン
（開発者オプションが無ければ **バージョン情報** で端末名を7回押す）。IP は **バージョン情報 → ネットワーク** に出る。

```sh
cd fos
npm install                       # 初回だけ
TV=192.168.1.23 npm run tv        # ビルド → つなぐ → 入れる → 開く（IP は自分の Fire TV のもの。一度つながれば次からは省ける）
npm run tv -- --no-build          # コードを変えていないとき（入れ直すだけ）
npm run tv -- --clean             # 音や画像を変えたのに反映されないとき
```

- Metro（開発サーバー）は使わず、JS を中に入れた release ビルド（`android/app/build/outputs/apk/release/app-release.apk`）を入れる。Vega 版の `npm run sim` と同じ考え方
- ログ：`~/Library/Android/sdk/platform-tools/adb logcat -s ReactNativeJS`（`devParams.ts` の `debug: true` で `[qth]` のログが出る）
- 型チェック：`npm run typecheck`（`/app/src` も含めて Android 向けに検査する）

## 素材

- 効果音：`web/public/sfx/*.wav` → `android/app/src/main/res/raw/`（小文字の名前。`newBest` → `newbest`）
- 書体：`app/assets/fonts/*.ttf` → `android/app/src/main/assets/fonts/`
- どちらも `npm run sync-assets`（`tools/sync-assets.mjs`）でコピーする。`npm run tv` が毎回呼ぶ。コピー先も git に入れてある
- アイコン：`app/assets/image/icon.png` から `res/mipmap-*/ic_launcher.png` を作った（`sips -z`）。バナー `res/drawable/tv_banner.png`（320×180）は Fire TV では使われないが Android TV の決まりで置いてある

## 提出（ストア）に向けて

- `android/app/build.gradle` の `versionCode` を更新のたびに 1 ずつ上げる（Vega 版の `build_number` に当たる）。`versionName` は Vega 版の `version` と揃える
- release の署名はまだひな形のまま（debug 用の鍵）。提出前に自分の鍵（keystore）を作り、**リポジトリには置かず**に `~/.gradle/gradle.properties` から読む形にする
- 対応機種：`minSdkVersion 24`（Android 7.0）なので **Fire OS 6 以降**（Fire TV Stick 4K、第3世代 Stick、Cube など）。Fire OS 5 の古い Stick（2016 年の第2世代など）では動かない
