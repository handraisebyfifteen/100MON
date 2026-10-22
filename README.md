# 100MON（Q the Hundred）

Fire TV 向けの 4 択速読クイズ。毎週 100 問、リモコンで答える。

| フォルダ | 中身 | くわしくは |
|---|---|---|
| `design.md` | 設計書（ルール・画面・データ・ランキング） | — |
| `core/` | ゲームの進行・採点・検証（OS に依らない TypeScript） | `npm test`（ルートで） |
| `data/` | ピリオドごとの 100 問と期間 | `pipeline/` が作る |
| `pipeline/` | 問題の生成・検証・修正（Bedrock のモデル） | `pipeline/generate_period.py` / `revise_period.py` の冒頭 |
| `backend/` | ランキングのサーバー（API Gateway + Lambda + DynamoDB） | `backend/README.md` |
| `web/` | ブラウザ版（TV での見え方の確認用。仮データのまま） | — |
| `app/` | **Vega OS 版**（Vega OS の Fire TV 向け。画面とゲームの本体はここ） | `vega-port.md` |
| `fos/` | **Fire OS 版**（従来の Fire TV 向け。`app/src` を共有し、入力と音だけ Android 用） | `fos/README.md` |

## よく使うコマンド

```sh
npm test                               # core のテスト
cd app && npm run sim                  # Vega 版をシミュレータで動かす
cd fos && TV=<Fire TV の IP> npm run tv  # Fire OS 版を手元の Fire TV で動かす
```

## ライセンス

[MIT](LICENSE)
