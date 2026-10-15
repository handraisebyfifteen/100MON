# ピリオド 2026-P01 の100問（本番生成の記録）

- 生成: `us.anthropic.claude-opus-4-6-v1` / 検証1: `mistral.mistral-large-3-675b-instruct` / 検証2: `qwen.qwen3-235b-a22b-2507-v1:0` / 確定位置: `mistral.mistral-large-3-675b-instruct`
- 開始 2026-10-15T16:21:33+00:00 → 終了 2026-10-15T16:28:46+00:00
- 出力: `data/questions.2026-P01.json`, `data/period.2026-P01.json`

## 集計

| 項目 | 数 |
| :-- | --: |
| 採用 | 100/100 |
| うち一発合格 | 86 |
| うち修正して合格 | 14 |
| 不採用（修正しても不合格） | 0 |

## 難易度と分野

| 難易度 | 採用 / 目標 |
| :-- | --: |
| 最初級 | 25 / 25 |
| 初級 | 30 / 30 |
| 中級 | 20 / 20 |
| 上級 | 25 / 25 |

分野: math 11, geography 11, science 11, music 9, space 9, history 8, literature 6, nature 6, language 6, food 5, body 5, animals 5, sports 5, arts 2, daily 1

正解の位置（0〜3）: 0: 23, 1: 22, 2: 37, 3: 18

## 確定位置の分布（設計書 §8：言語ごとに偏りを見る）

- ja: 2文字以内で確定 0 問、最後まで読む 39 問、位置の割合 〜25% 1, 〜50% 4, 〜75% 32, 〜100% 63
- en: 2文字以内で確定 0 問、最後まで読む 54 問、位置の割合 〜25% 0, 〜50% 2, 〜75% 19, 〜100% 79

- 2文字以内で確定する問題が多すぎる場合は、選択肢の作りが雑という信号（設計書 §8）

## 不合格理由の内訳（検証で立った不合格フラグの数。修正前の分も含む）

- verifier1 answer_correct: 6
- verifier1 single_answer: 6
- verifier1 unambiguous: 5
- verifier2 single_answer: 5
- verifier2 locale_match: 5
- verifier2 answer_correct: 4
- 形式 形式: 4
- verifier1 locale_match: 3
- verifier2 unambiguous: 2
- verifier2 not_trick: 2
- verifier2 not_time_sensitive: 2
- verifier1 not_trick: 1
- verifier1 not_time_sensitive: 1

## 不採用になった問題


## 費用

| モデル | 呼び出し | トークン in/out | 概算 |
| :-- | --: | :-- | --: |
| `mistral.mistral-large-3-675b-instruct` | 315 | 248894/29380 | 単価未確認 |
| `qwen.qwen3-235b-a22b-2507-v1:0` | 115 | 147124/13953 | $0.0446 |
| `us.anthropic.claude-opus-4-6-v1` | 29 | 90245/15596 | $0.8411 |

- 全データ: `log.json`（検証の判定と修正の履歴）、`accepted.json`

## 生成後の手直し（2026-10-16）

- q048「オタマジャクシが成長すると何になる」→「オタマジャクシが成長した姿」、q055「氷が溶けると何になるか」→「氷が溶けてできるもの」。疑問文のまま通ってしまったので体言止めに直した（形式チェックの正規表現も強化済み）。確定位置は文末に置き直した
- 所見: 中級・上級の難しさが設計書の想定より易しめ（「柔道発祥の国」「チーズの主な原料」など）。元素記号の問題が4問、「世界で一番〜」型が9問と、型の繰り返しが目立つ。次のピリオドからは生成の指示に「同じ型は3問まで」を足す
