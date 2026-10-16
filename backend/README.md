# backend — ランキングのサーバー側

世界中のプレイヤーが同じ週の100問で競うための裏側。設計書 `design.md` の §2・§6・§9・§10・§12 を実装したもの。

```
アプリ ──fetch──▶ API Gateway (HTTP API) ──▶ Lambda ──▶ DynamoDB
                                             ▲
                       EventBridge（毎週月曜 00:10 UTC）── 週の終わりの集計
```

- アプリは URL を `fetch` で呼ぶだけ。AWS のキーはアプリに持たせない
- 公開する API は4つだけ（走行開始・走行終了・ランキング取得・個人成績取得）
- 回数・時刻・スコアの判定はすべてサーバー側。アプリから送られた `correct` や `score` は使わない

## ファイル

| 場所 | 中身 |
|---|---|
| `template.yaml` | AWS の構成（SAM テンプレート）。テーブル・API・Lambda・スケジュール |
| `samconfig.toml` | `sam deploy` の既定値（スタック名、リージョン us-east-2） |
| `build.mjs` | Lambda 用のバンドルを `dist/` に作る（`/core` を取り込む） |
| `src/service.ts` | 4つの API と週の集計の中身 |
| `src/verify.ts` | 走行の検証とスコアの計算し直し |
| `src/points.ts` | 週のポイント（3部門・上位何%・激ムズ3倍） |
| `src/rank-key.ts` | 順位の並べ替えキー |
| `src/names.ts` | 表示名の自動生成（例：SwiftFalcon-4821） |
| `src/store.ts` / `store-dynamo.ts` / `store-memory.ts` | 保存先。本番は DynamoDB、テストはメモリ |
| `src/handlers/api.ts` | API の入口（ルートごとに service を呼ぶ） |
| `src/handlers/aggregate.ts` | 週の集計の入口 |
| `src/seed.ts` | 問題セットとピリオドをサーバーに入れる道具 |
| `test/` | vitest。本物の RunEngine で遊んだ記録を送って確かめる |

## API

ベース URL は `sam deploy` の出力 `ApiUrl`。本文はすべて JSON。エラーは `{ "error": { "code", "message" } }` の形で、内部の事情は返さない。

### POST /runs/start — 走行開始

```json
{ "playerId": "端末の匿名ID", "periodId": "2026-P01", "locale": "ja", "seed": 12345 }
```

- `seed` は省略可。省略するとサーバーが決めて返す。**返ってきた seed で RunEngine を作ること**（終了時に出題順を照合する）
- 返り値：`runId`, `attemptNumber`, `serverStartedAt`, `seed`, `displayName`, `settings`（猶予・表示速度・入力ロック）, `period`, `retryDeadline`
- 弾くとき：`PERIOD_CLOSED`（期間外）, `ATTEMPTS_EXHAUSTED`（激ムズで2回使い切り）, `RETRY_WINDOW_CLOSED`（激ムズで1回目から60分超）

### POST /runs/{runId}/finish — 走行終了

```json
{ "playerId": "端末の匿名ID", "answers": [ ...RunResult.answers... ], "clientTotalMs": 412345 }
```

- `answers` は `RunEngine.result().answers` をそのまま
- 返り値：`score`（0〜1）, `points`（1000点満点の表示用）, `correctCount`, `timedOutCount`, `isNewBest`, `bestScore`, `rank`, `entrants`
- 弾くとき：`ORDER_MISMATCH`（出題順が seed と合わない）, `ELAPSED_OVER_LIMIT`（1問の時間が長すぎる）, `CLOCK_MISMATCH`（アプリの合計時間がサーバーの計測より長い）, `RUN_TOO_FAST`（理論上の最短時間を下回る。記録は残すが順位に入れない）, `RUN_EXPIRED`（始めてから長く経ちすぎ）, `RUN_ALREADY_FINISHED`

### GET /leaderboard?periodId=…&locale=…&playerId=…

- 上位10人（`top`）と自分（`me`）。`playerId` を省くと `me` は null
- 他人の `playerId` は返さない。匿名IDは本人確認の代わりなので、見せると成りすましに使える

### GET /players/{playerId}/stats?periodId=…&locale=…

- `totals`：獲得ポイント、走行回数、回答数、正解数（全ピリオドの合計）
- `periods`：ピリオドごとのベスト・1回目のスコア・正解率・週のポイント
- `current`：`periodId` と `locale` を付けたときだけ。今週の成績と順位

## 判定の決まり（実装で確定したこと）

- **挑戦回数**はピリオド×言語ごとに数える。途中で終わった走行も1回として数える（設計書どおり）
- **激ムズの2回目の期限**は「1回目の終了時刻＋60分」。1回目が途中で終わって終了時刻が無いときは「1回目の開始時刻＋60分」
- **正確率部門の「1回目」**は、走り終えた最初の走行。途中で終わった走行には点が無いので対象にしない
- **正解率部門の挑戦回数**は、走り終えた回数
- **理論上の最短時間**＝問題数 × 入力ロック（200ms）。各問とも出題直後のロックが明けるまで押せないため
- **上位何%**＝順位 ÷ 参加人数。1人だけの週は 1/1＝100% なので、どの区分にも入らず「完走」の点になる。100人以上いないと上位1%の区分（100点）には誰も入らない

## DynamoDB の持ち方

| テーブル | キー | 索引 |
|---|---|---|
| Runs | pk = playerId, sk = runId（開始時刻で始まるので時刻順） | — |
| Leaderboard | pk = board（`ピリオドID#言語`）, sk = playerId | byRank（board, rankKey）、byPlayer（playerId, board） |
| Config | pk = 種類（config / period / questions）, sk = ID | — |

`rankKey` は「満点からの差」と「何回目の挑戦か」を桁をそろえて並べた文字列。小さいほど上位なので、byRank を前から10件読むと上位10人になる。

## いま動いているもの（2026-10-16 デプロイ）

| 項目 | 値 |
|---|---|
| スタック名 | q-the-hundred-backend（us-east-2） |
| ApiUrl | https://p9j0z2lfmh.execute-api.us-east-2.amazonaws.com/prod |
| RUNS_TABLE | q-the-hundred-backend-RunsTable-MIXJUVWMPATJ |
| LEADERBOARD_TABLE | q-the-hundred-backend-LeaderboardTable-1VY6S71BJOOO |
| CONFIG_TABLE | q-the-hundred-backend-ConfigTable-GKT3R3IVJ3DZ |

入っている問題セット：
- `2026-P01`（2026-10-19〜10-26 UTC、本番の100問）— 2026-10-16 投入。アプリはこれを読む
- `temp-P00`（2026-10-19〜10-26 UTC、仮データ100問）— 動作確認用に残してある

投入は `trivia-pipeline` ユーザーで行う（`iam/pipeline-seed-policy.json` をインラインポリシー `pipeline-seed` として付けてある）。

```sh
RUNS_TABLE=… LEADERBOARD_TABLE=… CONFIG_TABLE=… \
  npm run backend:seed -- data/questions.2026-P01.json data/period.2026-P01.json
```

動作確認済み（2026-10-16）：走行開始 → 100問を RunEngine で走る → 走行終了 → ランキング → 個人成績 → 週の集計 Lambda の手動実行。確認用データは削除済み。

## デプロイ手順（Mac から）

初回だけ道具を入れる。

```sh
brew install awscli aws-sam-cli
aws configure            # アクセスキー、リージョン us-east-2
```

アクセスキーは IAM ユーザーのもの。**リポジトリには置かない**（`aws configure` が `~/.aws/` に保存する）。

```sh
npm run backend:build                 # dist/ にバンドルを作る
cd backend
sam deploy --guided                   # 初回。以後は sam deploy だけでよい
```

出力に `ApiUrl` と3つのテーブル名が出る。続けて問題セットを入れる。

```sh
cd ..
RUNS_TABLE=… LEADERBOARD_TABLE=… CONFIG_TABLE=… \
  npm run backend:seed -- data/questions.temp.json data/period.temp.json
```

`period.temp.json` の `startsAt` / `endsAt` が今の日時を含んでいないと `PERIOD_CLOSED` になるので注意。

動作確認：

```sh
curl -X POST "$API/runs/start" -H 'content-type: application/json' \
  -d '{"playerId":"test-player-0001","periodId":"temp-P00","locale":"ja"}'
```

## 週の集計

- 毎週月曜 00:10 UTC に `AggregateFunction` が自動で動き、終わったばかりのピリオドに言語別でポイントを付ける
- 手で動かす：Lambda のコンソールから `{ "periodId": "2026-P01" }` を渡してテスト実行。何度動かしても二重には足されない（上書き）

## 不正対策の線引き（設計書 §12）

やること：サーバー時刻で計測、最短時間を下回る記録を順位から除外（生データは `status: rejected` で残す）、出題順・正誤・スコアの計算し直し、生データ保存。
おかしい記録は DynamoDB のコンソールから手で消せる。

**できていないこと**

- 「1端末あたり」の呼び出し上限。HTTP API はステージ全体の上限（`ThrottlingRateLimit`）しか掛けられない。端末ごとに掛けるには REST API＋APIキー、または WAF が必要。ハッカソン時点ではステージ全体の上限で進める
- 答えを覚えて速く押す・AI に聞く行為（設計どおり防がない）
- アプリを入れ直して匿名IDを作り直す行為（設計どおり承知で進める）

## 料金の目安

DynamoDB はオンデマンド、Lambda と API Gateway は呼ばれた分だけ。ハッカソン規模（数百走行）なら無料枠に収まる見込み。テーブルは `DeletionPolicy: Retain` なので、スタックを消しても記録は残る（消すときは手で）。
