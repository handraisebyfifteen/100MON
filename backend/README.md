# backend — サーバー側（今週の問題の配信とランキング）

世界中のプレイヤーが同じ週の100問で競うための裏側。設計書 `design.md` の §5・§6・§9・§10・§12 を実装したもの。
2026-10-17 に `trivia-` の名前で作り直した（旧 `q-the-hundred-backend` スタックは消していない。下の「旧スタック」を参照）。

```
アプリ ──fetch──▶ API Gateway (HTTP API) ──▶ Lambda (trivia-api) ──▶ DynamoDB
                                                ▲
            EventBridge Scheduler（毎週月曜 00:10 UTC）── Lambda (trivia-aggregate)：週の終わりの集計
```

- アプリは URL を `fetch` で呼ぶだけ。AWS のキーや SDK はアプリに持たせない
- 公開する API は **5つ**（今週の問題・走行開始・走行終了・ランキング取得・個人成績取得）
- 回数・時刻・正誤・スコアの判定はすべてサーバー側。アプリから送られた `correct` や `score` は使わない
- 問題は DynamoDB（Periods テーブル）に置き、Lambda が配る。毎週の公式戦はアプリを更新せずに問題を差し替えられる

## いま動いているもの（2026-10-17 デプロイ）

| 項目 | 値 |
|---|---|
| スタック名 | `trivia-backend`（us-east-2） |
| ApiUrl（ベースURL） | `https://vcgagzkf7d.execute-api.us-east-2.amazonaws.com/prod` |
| テーブル | `trivia-periods` / `trivia-runs` / `trivia-leaderboard` / `trivia-config`（すべてオンデマンド課金） |
| Lambda | `trivia-api`（5つの API）/ `trivia-aggregate`（週の集計） |
| スケジュール | `trivia-weekly-close`（毎週月曜 00:10 UTC） |

入っているピリオド：

| periodId | 期間（UTC） | 中身 |
|---|---|---|
| `2026-P01` | 2026-10-19 〜 10-26 | 本番の100問（`data/questions.2026-P01.json`） |
| `temp-P00` | 2026-10-19 〜 10-26 | 仮データ100問（`data/questions.temp.json`） |
| `test-P00` | 2026-10-12 〜 10-19 | 動作確認用。仮データ100問を、作った週に窓が来るようにしたもの（2026-10-19 00:00 UTC で終わる） |

同じ週に複数のピリオドが開いているときは、`startsAt` が新しいほうを「今週」とする。
動作確認で `smoke-player-0001` / `smoke-player-0002` / `curl-player-0001` の走行と順位が `test-P00` に残っている（消していない）。

## ファイル

| 場所 | 中身 |
|---|---|
| `template.yaml` | AWS の構成（SAM テンプレート）。テーブル・API・Lambda・スケジュール |
| `samconfig.toml` | `sam deploy` の既定値（スタック名 `trivia-backend`、リージョン us-east-2） |
| `build.mjs` | Lambda 用のバンドルを `dist/` に作る（`/core` を取り込む）。seed / smoke も同じ方法で作る |
| `src/service.ts` | 5つの API と週の集計の中身 |
| `src/verify.ts` | 走行の検証、スコアの計算し直し、理論上の最短・最長時間 |
| `src/points.ts` | 週のポイント（3部門・上位何%・激ムズ3倍） |
| `src/rank-key.ts` | 順位の並べ替えキー |
| `src/names.ts` | 表示名の自動生成（例：SwiftFalcon-4821）。自由入力は受け付けない |
| `src/store.ts` / `store-dynamo.ts` / `store-memory.ts` | 保存先。本番は DynamoDB、テストはメモリ |
| `src/handlers/api.ts` | API の入口（ルートごとに service を呼ぶ） |
| `src/handlers/aggregate.ts` | 週の集計の入口 |
| `scripts/seed.ts` | 問題セットとピリオドを Periods に入れ、Config に初期値を入れる道具 |
| `scripts/smoke.ts` | デプロイした API をアプリと同じ順で叩く確認道具 |
| `test/` | vitest。AWS なしで動く（スコア、順位、回数、最短時間、二重呼び出し など） |
| `iam/pipeline-seed-policy.json` | パイプラインの IAM ユーザーに付ける、投入用の最小権限 |

`/core` にあったもの（スコア計算 `score.ts`、設定の解決 `settings.ts`、出題順 `rng.ts`、問題セットの検証 `validate.ts`）はそのまま再利用している。backend の中に新しく作ったのは、最短・最長時間（`verify.ts`）、順位キー、表示名、ポイント、保存先。

## API

ベース URL は `sam deploy` の出力 `ApiUrl`。本文はすべて JSON。CORS は有効（`AllowedOrigin` パラメータ、既定は `*`）。
エラーは必ず `{ "error": { "code": "...", "message": "..." } }` の形。`code` はアプリが分岐に使う短い名前。内部の事情は返さない。

### 1. GET /period/current?locale=ja|en — 今週の問題

- 「今週」は、Config に `activePeriodId` があればそれ、無ければ UTC の現在時刻が `startsAt` 以上 `endsAt` 未満のピリオド
- **開始前のピリオドの問題は返さない**（時刻で決めるときは候補にならず、`activePeriodId` で固定していても `PERIOD_NOT_STARTED` になる）
- 返す問題は指定した言語の問題文・選択肢・確定位置だけ。もう一方の言語は返さない
- `answerIndex` も返す（ハッカソン時点の割り切り。設計書 §18）
- 返り値：`period`（id, startsAt, endsAt, quarter, isHardWeek, answerWindowSec, maxAttempts, retryWindowMin）, `locale`, `settings`（猶予・表示速度・入力ロック）, `resolvedVia`（config / clock）, `serverTime`, `questions[100]`
- エラー：`INVALID_LOCALE`(400), `NO_ACTIVE_PERIOD`(404), `PERIOD_NOT_FOUND`(404), `PERIOD_NOT_STARTED`(403)

### 2. POST /runs/start — 走行開始

```json
{ "playerId": "端末の匿名ID", "periodId": "2026-P01", "locale": "ja", "seed": 12345 }
```

- **開始した時点で1回の挑戦として数える**（途中で終わった走行も1回）
- `seed` は省略可。省略するとサーバーが決めて返す。**返ってきた seed で RunEngine を作ること**（終了時に出題順を照合する）
- 返り値：`runId`, `attemptNumber`, `serverStartedAt`, `seed`, `displayName`, `settings`, `period`, `retryDeadline`
- エラー：`PERIOD_CLOSED`(403, 期間外), `MAX_ATTEMPTS`(403, 激ムズで回数を使い切り), `RETRY_WINDOW_EXPIRED`(403, 1回目の終了から60分超), `TOO_MANY_STARTS`(429, 同じ playerId からの開始が多すぎる。既定 10分に10回。Config.startRateLimit)

### 3. POST /runs/finish — 走行終了

```json
{ "runId": "…", "answers": [ { "questionId": "…", "order": 1, "chosenIndex": 2, "timedOut": false, "elapsedMs": 1234 }, … ] }
```

- `answers` は `RunEngine.result().answers` をそのまま送ればよい（`correct` が入っていても無視する）。`playerId` と `clientTotalMs` は省略可
- サーバー側で、保存してある問題の `answerIndex` と照らして正誤を判定し直す。スコアは設計書 §5 の式（1問10点の積み上げ、1000点満点）で計算し直す
- タイム ＝ サーバー時刻の（終了 − 開始）
- 理論上の最短時間を下回る記録は `suspicious: true` を付けて Run に残し、順位には入れない（ベスト・1回目のスコアは更新しない。累計と回数は足す）
- **同じ runId を2回呼んでも二重に数えない**。2回目以降は保存してある結果を `duplicate: true` で返す
- 返り値：`score`(0〜1), `points`(1000点満点), `timeMs`, `correctCount`, `timedOutCount`, `suspicious`, `suspiciousReason`, `isNewBest`, `bestScore`, `bestPoints`, `rank`（順位に載っていなければ null）, `entrants`, `duplicate`
- エラー：`INVALID_RUN_ID`(400), `RUN_NOT_FOUND`(404), `INCOMPLETE_RUN`(400, 100問ちょうどでない), `UNKNOWN_QUESTION`(400, 存在しない問題ID), `ORDER_MISMATCH`(400, 出題順が seed と合わない), `INVALID_ANSWERS`(400), `ELAPSED_OVER_LIMIT`(400, 1問の時間が長すぎる), `CLOCK_MISMATCH`(400, アプリの合計時間がサーバーの計測より長い), `RUN_EXPIRED`(403, 始めてから長く経ちすぎ)
- `POST /runs/{runId}/finish` も同じ処理（アプリの古い呼び方のために残してある。本文の `runId` は不要）

### 4. GET /leaderboard?periodId=…&locale=…&playerId=…

- 上位10人（`top`）と自分（`me`）。`playerId` を省くと `me` は null。順位に載っていない（suspicious しかない）人も null
- 表示名（`displayName`）だけ返し、他人の `playerId` は返さない。匿名IDは本人確認の代わりなので、見せると成りすましに使える

### 5. GET /players/{playerId}/stats?periodId=…

- `totals`：獲得ポイント、累計走行回数、累計回答数、累計正解数、全走行の正解率
- `best`：全ピリオドを通しての最高スコア
- `periods`：ピリオド×言語ごとのベスト・1回目のスコア・正解率・走行回数・週のポイント
- `current`：今週（`periodId` を省くと今のピリオド）の言語別の成績。順位・参加人数・**開始した回数**（`startedAttempts`、途中で終わった走行も含む）
- 他人の匿名IDを知っていれば見られる。本人確認の仕組みが無いため（設計書 §11）

## 動作確認に使ったコマンド（2026-10-17、全部通った）

```sh
API=https://vcgagzkf7d.execute-api.us-east-2.amazonaws.com/prod

# 1. 今週の問題が100問返る（ja / en）
curl -s "$API/period/current?locale=ja" | head -c 600
curl -s "$API/period/current?locale=en" | head -c 600

# 2. 走行開始 → 走行終了 → 3. ランキング → 4. 個人成績。
#    終了の回答は seed から出題順を再現する必要があるので、smoke スクリプトで通す
#    （全問正解で答え、最短時間ぶん待ってから終了する。約1分）
npm run backend:build
npm run backend:smoke -- "$API" smoke-player-0001 ja

# 2'. 走行開始だけを curl で
curl -s -X POST "$API/runs/start" -H 'content-type: application/json' \
  -d '{"playerId":"curl-player-0001","periodId":"test-P00","locale":"ja"}'

# 3'. ランキング、4'. 個人成績
curl -s "$API/leaderboard?periodId=test-P00&locale=ja&playerId=smoke-player-0001"
curl -s "$API/players/smoke-player-0001/stats"

# 5. わざとおかしい入力（エラーが決まった形で返る）
RUN=<2' で返った runId>
curl -s -X POST "$API/runs/finish" -H 'content-type: application/json' \
  -d "{\"runId\":\"$RUN\",\"answers\":[{\"questionId\":\"tmp_0001\",\"order\":1,\"chosenIndex\":2,\"timedOut\":false,\"elapsedMs\":400}]}"
#   → {"error":{"code":"INCOMPLETE_RUN","message":"answers must have exactly 100 items"}} [400]
curl -s -X POST "$API/runs/finish" -H 'content-type: application/json' -d '{"runId":"no-such-run","answers":[]}'
#   → {"error":{"code":"RUN_NOT_FOUND",...}} [404]
curl -s -X POST "$API/runs/finish" -H 'content-type: application/json' -d '{not json'
#   → {"error":{"code":"INVALID_BODY",...}} [400]
curl -s -X POST "$API/runs/start" -H 'content-type: application/json' \
  -d '{"playerId":"curl-player-0001","periodId":"2026-P01","locale":"ja"}'
#   → {"error":{"code":"PERIOD_CLOSED",...}} [403]（開始前）
curl -s "$API/period/current?locale=xx"
#   → {"error":{"code":"INVALID_LOCALE",...}} [400]
```

smoke スクリプトは、同じ runId の二重終了（`duplicate: true`）、速すぎる走行（`suspicious: true`、順位に入らない）、存在しない runId、壊れた playerId も続けて確認する。

## 判定の決まり（実装で確定したこと）

- **挑戦回数**はピリオド×言語ごとに、開始した時点で数える（途中で終わった走行も1回）
- **激ムズの2回目の期限**は「1回目の終了時刻＋60分」。1回目が途中で終わって終了時刻が無いときは「1回目の開始時刻＋60分」。`maxAttempts` と `retryWindowMin` はそれぞれ独立に効く
- **スコア**は設計書 §5 の現行式（1問ごとに 5点＋速さで最大5点、不正解と時間切れは0）。指示書にあった「基準時間 ÷ タイム × 正答率」は設計書で 2026-10-15 に廃止されているので使わず、`baseTimeSec` も Config に入れていない
- **理論上の最短時間** ＝ Σ max(入力ロック 200ms, 確定位置 × 1文字の表示時間) × `minTimeFactor`（暫定 0.5）
  - 答えが確定する文字が出るまでは、読んで答えることはできない。ただし答えを覚える遊び方は設計どおり認めているので、確定位置の半分までは許す
  - 係数は Config で変えられる。本番の走行データを見て調整する（設計書 §18）
- **同スコアの順位**：ベストを出した挑戦回数（`bestAttemptNumber`）が少ないほうが上。同スコアではベストを書き換えない
- **suspicious な走行**：Run には残す。Leaderboard Entry の `attempts`・`totalCorrect`・`totalAnswered` は足すが、`bestScore` 系と `firstScore` は触らない。最初の走行が suspicious なら、`firstScore` は次の正当な走行のスコアになる
- **1回目のスコア（firstScore）**は suspicious でない最初の走行。以後は書き換えない（`if_not_exists`）
- **上位何%**＝順位 ÷ 参加人数（順位に載っている人だけ）。1人だけの週は「完走」の点になる

## DynamoDB の持ち方（キーの一覧）

| テーブル | キー | 索引 | 中身 |
|---|---|---|---|
| `trivia-periods` | pk = `periodId` | — | ピリオドの項目（startsAt, endsAt, quarter, isHardWeek, questionIds, answerWindowSec?, maxAttempts?, retryWindowMin?）と `questions`（100問、言語両方、answerIndex 込み）。1件 約36KB |
| `trivia-runs` | pk = `playerId`, sk = `runId` | `byRunId`（pk = runId） | 走行の生データ。runId は 13桁の開始時刻（ミリ秒）で始まるので、playerId ごとに時刻順に並ぶ。終了時は runId だけで byRunId から引く |
| `trivia-leaderboard` | pk = `board`（`ピリオドID#言語`）, sk = `playerId` | `byRank`（board, rankKey）、`byPlayer`（playerId, board） | ピリオド×言語ごとのベスト。`rankKey` は「満点からの差」と「何回目の挑戦か」を桁をそろえた文字列で、小さいほど上位。ベストが無い行には rankKey が無く、byRank に載らない |
| `trivia-config` | pk = `key`（`global` の1件） | — | `value` = ServerConfig |

Leaderboard を「メインのキー＝board と playerId ＋ 順位用の GSI」にした理由：自分の1件は GetItem 1回で取れ、上位10人は byRank を前から10件読むだけで済む。順位は「自分より rankKey が小さい人数 ＋ 1」を COUNT で数える。
走行のたびの更新は、累計を `ADD`、`firstScore` を `if_not_exists`、ベストを「無いか低いときだけ」の条件付き更新で書くので、同時に2回終わっても壊れない。

Config の初期値（`scripts/seed.ts` が無いときだけ入れる）：

| 項目 | 値 | 備考 |
|---|---|---|
| `answerWindowSec` | 5 | 激ムズは Period 側の 10 が優先 |
| `typewriterMsPerChar` | 150 | **暫定**。実際は `typewriterMsPerCharByLocale`（ja: 150, en: 50）が使われる |
| `inputLockMs` | 200 | |
| `startRateLimit` | `{ windowSec: 600, max: 10 }` | 同じ playerId の開始の上限 |
| `minTimeFactor` | 0.5 | **暫定**。最短時間の係数 |
| `activePeriodId` | （無し） | 開発・デモで今週を固定するときに入れる |
| `points` | 設計書 §6 の区分・重み・倍率 | |

今週を固定する／外す（コンソールでもよい）：

```sh
aws dynamodb update-item --region us-east-2 --table-name trivia-config --key '{"key":{"S":"global"}}' \
  --update-expression 'SET #v.activePeriodId = :p' --expression-attribute-names '{"#v":"value"}' \
  --expression-attribute-values '{":p":{"S":"2026-P01"}}'
aws dynamodb update-item --region us-east-2 --table-name trivia-config --key '{"key":{"S":"global"}}' \
  --update-expression 'REMOVE #v.activePeriodId' --expression-attribute-names '{"#v":"value"}'
```

## 問題の投入（毎週）

```sh
npm run backend:build
npm run backend:seed -- data/questions.2026-P02.json data/period.2026-P02.json
```

- `data/` のファイルを差し替えて同じコマンドで登録できる（形は設計書 §9。`parseQuestionSet` で検証してから入れる）
- 何度実行しても同じ結果：同じ periodId の項目だけを上書きする。Config は無いときだけ入れる。**既存のデータを消す処理は無い**
- 1件のサイズを表示し、380KB を超えたら止める（DynamoDB の上限は 400KB）
- テーブル名は環境変数 `PERIODS_TABLE` / `CONFIG_TABLE` で変えられる（省略時 `trivia-periods` / `trivia-config`）
- AWS の資格情報は `~/.aws`（`aws configure`）のものを使う。リポジトリには置かない
- パイプラインのユーザー（`trivia-pipeline`）で投入するなら、`iam/pipeline-seed-policy.json` をインラインポリシーとして付け直す（旧テーブル向けのものから書き換えた。**IAM への反映はまだ**）

## デプロイ手順（Mac から）

```sh
brew install awscli aws-sam-cli   # 初回だけ
aws configure                     # アクセスキー、リージョン us-east-2（~/.aws に保存される）

npm test                          # vitest（core + backend）
npm run backend:build             # dist/ にバンドルを作る
cd backend
sam validate --lint
sam build
sam deploy                        # samconfig.toml の既定値で。初回は --guided でもよい
```

出力に `ApiUrl` と4つのテーブル名が出る。

注意：SAM の `ScheduleV2` は名前を省くと論理IDがそのままスケジュール名になり、同じアカウントの別スタックと衝突する。`Name` を付けてある。

## 週の集計

- 毎週月曜 00:10 UTC に `trivia-aggregate` が自動で動き、終わったばかりのピリオドに言語別でポイントを付ける
- 手で動かす：Lambda のコンソールから `{ "periodId": "2026-P01" }` を渡してテスト実行。何度動かしても二重には足されない（上書き）

## 不正対策の線引き（設計書 §12）

やること：サーバー時刻で計測、最短時間を下回る記録を順位から除外（生データは `suspicious: true` で残す）、出題順・正誤・スコアの計算し直し、生データ保存、同じ playerId の開始回数の上限、ステージ全体のスロットリング（秒 25、バースト 50）。
おかしい記録は DynamoDB のコンソールから手で消せる。

**できていないこと**

- 「1端末あたり」の呼び出し上限。HTTP API はステージ全体の上限しか掛けられない。端末ごとに掛けるには REST API＋APIキー、または WAF が必要。ハッカソン時点では、ステージ全体の上限＋`startRateLimit` で進める
- 答えを覚えて速く押す・AI に聞く行為（設計どおり防がない）
- アプリを入れ直して匿名IDを作り直す行為（設計どおり承知で進める）
- `answerIndex` をアプリに返しているので、通信を見れば答えが分かる（ハッカソン時点の割り切り）

## 旧スタック（q-the-hundred-backend）

2026-10-16 に作った最初の版。**消していない**。テーブル名は `q-the-hundred-backend-*`、ApiUrl は `https://p9j0z2lfmh.execute-api.us-east-2.amazonaws.com/prod`。
アプリ（`app/src/platform/api.ts` の `API_BASE`）はまだ旧スタックを向いている。新しい API に切り替えるときは、`rank` と `bestScore` が null になり得ることと、`serverDurationMs` が `timeMs` に変わったことに合わせる。
旧スタックを消すときは `sam delete --stack-name q-the-hundred-backend`（テーブルは `DeletionPolicy: Retain` なので、別途コンソールから消す）。

## 料金の目安

DynamoDB はオンデマンド、Lambda と API Gateway は呼ばれた分だけ。ハッカソン規模（数百走行）なら無料枠に収まる見込み。テーブルは `DeletionPolicy: Retain` なので、スタックを消しても記録は残る（消すときは手で）。
