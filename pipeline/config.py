"""Bedrock モデルID設定。

手順1（check_models.py / reports/models.md）で実際に取得し、
疎通確認できたIDだけを載せる。差し替えはこのファイルの1行を書き換える。

経緯:
- オーナーの方針: Claude は 5系以上を使う。激ムズウィークは最新 Opus + GPT-6 Sol/Astra（2026-09-29）。
- ★未解決★ 5系と GPT-6 は、マーケットプレイス契約を受諾済み
  （CreateFoundationModelAgreement 成功、agreement=AVAILABLE / auth=AUTHORIZED /
   entitlement=AVAILABLE / region=AVAILABLE / ユースケース登録済み）にもかかわらず、
  ランタイムが全経路（基盤モデル直・us.・global.）で
  「not available for this account（AWS Sales に連絡）」を返す。
  → 契約とは別の、アカウント単位の提供許可（フロンティアモデル枠）が必要とみられる。
  開放され次第、下の GENERATOR / VERIFIER_1 / HELL_* がそのまま使える。
  2026-09-30 再テストでも同じエラー（契約成立後16時間以上経過）。
- オーナー方針（2026-09-30）: Anthropic は 5系以上、OpenAI は GPT-6 以上が必須。
  LEGACY_ の 4.6 系への差し替えは不可。開放まではパイプラインを動かさない。
- 4.6系での比較結果は reports/archive_claude46/ に保存してある。
- Nova は生成テストで日本語出力が壊れたため生成役から除外（archive の generators.md 参照）。
- Nova Premier は提供終了。Nova の最上位は Nova 2 Lite。

注意: Sonnet 5.5 には us. プロファイルが無く、global.（世界ルーティング）のみ。
"""

REGION = "us-east-2"

# ---- 生成・修正役（手順3の5系再テストで確定させる）----
GENERATOR = "global.anthropic.claude-sonnet-5-5"

# 手順3で比較する生成候補
GENERATOR_CANDIDATES = {
    "sonnet-5-5": "global.anthropic.claude-sonnet-5-5",
    "sonnet-5": "us.anthropic.claude-sonnet-5",
}

# ---- 検証1（設計書: Claude Opus。手順2の5系再テストで確定させる）----
VERIFIER_1 = "us.anthropic.claude-opus-5-5"

# 手順2で比較する検証1候補
VERIFIER_1_CANDIDATES = {
    "claude-opus-5-5": "us.anthropic.claude-opus-5-5",
    "claude-opus-5": "us.anthropic.claude-opus-5",
}

# ---- 検証2（手順2の結果で確定: 4.6時代の結果は fixtures 依存で5系化の影響なし）----
# 欠陥10/10検出・指摘項目完全一致・非Anthropic非Amazon・最速。
# コスト優先なら VERIFIER_2_CANDIDATES["qwen3-235b"] に差し替え（成績はほぼ同等）。
VERIFIER_2 = "mistral.mistral-large-3-675b-instruct"

# ---- 検証2の候補（手順2で比較したもの）----
# 非Anthropicで疎通確認できたモデル。gpt-oss の safeguard 変種は
# 安全分類特化のため除外。
VERIFIER_2_CANDIDATES = {
    "gpt-6-sol": "us.openai.gpt-6-sol",
    "gpt-6-astra": "us.openai.gpt-6-astra",
    "gpt-oss-120b": "openai.gpt-oss-120b-1:0",
    "gpt-oss-20b": "openai.gpt-oss-20b-1:0",
    "qwen3-235b": "qwen.qwen3-235b-a22b-2507-v1:0",
    "mistral-large-3": "mistral.mistral-large-3-675b-instruct",
    "nova-2-lite": "us.amazon.nova-2-lite-v1:0",
    "nova-pro": "us.amazon.nova-pro-v1:0",
}

# ---- 激ムズウィーク用の構成（オーナー希望 2026-09-29: 最新Opus + GPT-6 Sol + Astra）----
# 契約受諾済み。fixtures での検証成績は verifiers.md の再テスト結果を参照。
# 激ムズ相当の「生成」品質テストはまだ行っていない（通常週テストの後の課題）。
# 注意: 検証1・検証2が同じ OpenAI 社になる構成。設計書の「3社分散」からは外れる。
HELL_GENERATOR = "us.anthropic.claude-opus-5-5"
HELL_VERIFIER_1 = "us.openai.gpt-6-sol"
HELL_VERIFIER_2 = "us.openai.gpt-6-astra"

# ---- 旧・4.6系の確定値（アーカイブ用の記録。5系が使えない事態への予備）----
LEGACY_GENERATOR_SONNET_46 = "us.anthropic.claude-sonnet-4-6"
LEGACY_VERIFIER_1_OPUS_46 = "us.anthropic.claude-opus-4-6-v1"
