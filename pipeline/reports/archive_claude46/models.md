# Bedrock モデル調査（手順1）

- 実行日時: 2026-09-29T07:29:33+00:00
- リージョン: us-east-2
- 基盤モデル数（テキスト入出力・ACTIVE）: 74
- 推論プロファイル数: 88

## 候補の確定（テスト結果からの自動判定）

各役割について「呼び出せた中で最上位」のモデル。gpt-oss の safeguard 変種は安全分類特化のため候補から除外。

| 役割 | モデル名 | 呼び出しID |
| :-- | :-- | :-- |
| 生成候補: Amazon Nova（最上位） | Nova 2 Lite | `us.amazon.nova-2-lite-v1:0` |
| 生成候補の代替: Amazon Nova（次点） | Nova Pro | `us.amazon.nova-pro-v1:0` |
| 生成候補: Claude Sonnet（使えた最新） | Claude Sonnet 4.6 | `us.anthropic.claude-sonnet-4-6` |
| 検証1: Claude Opus（使えた最新） | Claude Opus 4.6 | `us.anthropic.claude-opus-4-6-v1` |
| 検証2候補: OpenAI gpt-oss | gpt-oss-120b | `openai.gpt-oss-120b-1:0` |
| 検証2候補: qwen | Qwen3 235B A22B 2507 | `qwen.qwen3-235b-a22b-2507-v1:0` |
| 検証2候補: mistral | Mistral Large 3 | `mistral.mistral-large-3-675b-instruct` |

## 候補モデルの疎通テスト結果

送信文: 「日本の首都はどこですか。一語で答えてください。」（1回・maxTokens 256）

| 区分 | モデル名 | ベースモデルID | 呼び出しに使ったID | 呼び出せたか | 応答時間 | 出力 or エラー内容 |
| :-- | :-- | :-- | :-- | :-- | --: | :-- |
| Amazon Nova | Nova 2 Lite | `amazon.nova-2-lite-v1:0` | `us.amazon.nova-2-lite-v1:0` | ○ | 1.17s | 東京。 |
| Amazon Nova | US Nova Premier | `amazon.nova-premier-v1:0` | `us.amazon.nova-premier-v1:0` | × | 0.28s | [ResourceNotFoundException] An error occurred (ResourceNotFoundException) when calling the Converse operation: This model version has reached the end of its life. Please refer to the AWS documentation for more details. |
| Amazon Nova | Nova Pro | `amazon.nova-pro-v1:0` | `us.amazon.nova-pro-v1:0` | ○ | 0.55s | 東京 |
| Amazon Nova | Nova Lite | `amazon.nova-lite-v1:0` | `us.amazon.nova-lite-v1:0` | ○ | 0.56s | 東京 |
| Amazon Nova | Nova Micro | `amazon.nova-micro-v1:0` | `us.amazon.nova-micro-v1:0` | ○ | 0.5s | 東京です。 |
| Claude Sonnet（最新） | Claude Sonnet 5.5 | `anthropic.claude-sonnet-5-5` | `global.anthropic.claude-sonnet-5-5` | × | 0.29s | [AccessDeniedException] An error occurred (AccessDeniedException) when calling the Converse operation: anthropic.claude-sonnet-5-5 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales at https://aws.amazon.com/contact-us/sales-support/ |
| Claude Sonnet（診断用） | Claude Sonnet 5 | `anthropic.claude-sonnet-5` | `us.anthropic.claude-sonnet-5` | × | 0.24s | [AccessDeniedException] An error occurred (AccessDeniedException) when calling the Converse operation: anthropic.claude-sonnet-5 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales at https://aws.amazon.com/contact-us/sales-support/ |
| Claude Sonnet（診断用） | Claude Sonnet 4.6 | `anthropic.claude-sonnet-4-6` | `us.anthropic.claude-sonnet-4-6` | ○ | 0.86s | 東京 |
| Claude Sonnet（診断用） | Claude Sonnet 4.5 | `anthropic.claude-sonnet-4-5-20250929-v1:0` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | ○ | 1.52s | 東京 |
| Claude Sonnet（診断用） | US Claude Sonnet 4 | `anthropic.claude-sonnet-4-20250514-v1:0` | `us.anthropic.claude-sonnet-4-20250514-v1:0` | × | 0.32s | [ResourceNotFoundException] An error occurred (ResourceNotFoundException) when calling the Converse operation: Access denied. This Model is marked by provider as Legacy and you have not been actively using the model in the last 30 days. Please upgrade to an active model on Amazon Bedrock |
| Claude Opus（最新） | Claude Opus 5.5 | `anthropic.claude-opus-5-5` | `us.anthropic.claude-opus-5-5` | × | 0.29s | [AccessDeniedException] An error occurred (AccessDeniedException) when calling the Converse operation: anthropic.claude-opus-5-5 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales at https://aws.amazon.com/contact-us/sales-support/ |
| Claude Opus（診断用） | Claude Opus 5 | `anthropic.claude-opus-5` | `us.anthropic.claude-opus-5` | × | 0.28s | [AccessDeniedException] An error occurred (AccessDeniedException) when calling the Converse operation: anthropic.claude-opus-5 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales at https://aws.amazon.com/contact-us/sales-support/ |
| Claude Opus（診断用） | Claude Opus 4.8 | `anthropic.claude-opus-4-8` | `us.anthropic.claude-opus-4-8` | × | 0.27s | [AccessDeniedException] An error occurred (AccessDeniedException) when calling the Converse operation: anthropic.claude-opus-4-8 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales at https://aws.amazon.com/contact-us/sales-support/ |
| Claude Opus（診断用） | Claude Opus 4.7 | `anthropic.claude-opus-4-7` | `us.anthropic.claude-opus-4-7` | × | 0.31s | [AccessDeniedException] An error occurred (AccessDeniedException) when calling the Converse operation: anthropic.claude-opus-4-7 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales at https://aws.amazon.com/contact-us/sales-support/ |
| Claude Opus（診断用） | Claude Opus 4.6 | `anthropic.claude-opus-4-6-v1` | `us.anthropic.claude-opus-4-6-v1` | ○ | 1.5s | 東京 |
| Claude Opus（診断用） | Claude Opus 4.5 | `anthropic.claude-opus-4-5-20251101-v1:0` | `us.anthropic.claude-opus-4-5-20251101-v1:0` | ○ | 1.62s | 東京 |
| Claude Opus（診断用） | US Claude Opus 4.1 | `anthropic.claude-opus-4-1-20250805-v1:0` | `us.anthropic.claude-opus-4-1-20250805-v1:0` | × | 0.32s | [ResourceNotFoundException] An error occurred (ResourceNotFoundException) when calling the Converse operation: Access denied. This Model is marked by provider as Legacy and you have not been actively using the model in the last 30 days. Please upgrade to an active model on Amazon Bedrock |
| OpenAI gpt-oss | GPT OSS Safeguard 20B | `openai.gpt-oss-safeguard-20b` | `openai.gpt-oss-safeguard-20b` | ○ | 0.54s | 東京 |
| OpenAI gpt-oss | GPT OSS Safeguard 120B | `openai.gpt-oss-safeguard-120b` | `openai.gpt-oss-safeguard-120b` | ○ | 1.07s | 東京 |
| OpenAI gpt-oss | gpt-oss-20b | `openai.gpt-oss-20b-1:0` | `openai.gpt-oss-20b-1:0` | ○ | 0.53s | 東京 |
| OpenAI gpt-oss | gpt-oss-120b | `openai.gpt-oss-120b-1:0` | `openai.gpt-oss-120b-1:0` | ○ | 0.72s | 東京 |
| その他（非Anthropic・非Amazon） | Qwen3 235B A22B 2507 | `qwen.qwen3-235b-a22b-2507-v1:0` | `qwen.qwen3-235b-a22b-2507-v1:0` | ○ | 0.42s | 東京 |
| その他（非Anthropic・非Amazon） | Mistral Large 3 | `mistral.mistral-large-3-675b-instruct` | `mistral.mistral-large-3-675b-instruct` | ○ | 0.39s | 東京 |

## 利用可能なモデル一覧（テキスト入出力）

基盤モデル一覧と、この地域から呼べるクロスリージョンプロファイルを統合したもの。

| プロバイダ | ベースモデルID | オンデマンド | プロファイル |
| :-- | :-- | :-- | :-- |
| Amazon | `amazon.nova-2-lite-v1:0` | — | `global.amazon.nova-2-lite-v1:0`, `us.amazon.nova-2-lite-v1:0` |
| Amazon | `amazon.nova-lite-v1:0` | ○ | `us.amazon.nova-lite-v1:0` |
| Amazon | `amazon.nova-micro-v1:0` | — | `us.amazon.nova-micro-v1:0` |
| amazon | `amazon.nova-premier-v1:0` | — | `us.amazon.nova-premier-v1:0` |
| Amazon | `amazon.nova-pro-v1:0` | — | `us.amazon.nova-pro-v1:0` |
| anthropic | `anthropic.claude-3-haiku-20240307-v1:0` | — | `us.anthropic.claude-3-haiku-20240307-v1:0` |
| Anthropic | `anthropic.claude-fable-5` | — | `us.anthropic.claude-fable-5`, `global.anthropic.claude-fable-5` |
| Anthropic | `anthropic.claude-fable-5-1` | — | `us.anthropic.claude-fable-5-1`, `global.anthropic.claude-fable-5-1` |
| Anthropic | `anthropic.claude-haiku-4-5-20251001-v1:0` | — | `us.anthropic.claude-haiku-4-5-20251001-v1:0`, `global.anthropic.claude-haiku-4-5-20251001-v1:0` |
| anthropic | `anthropic.claude-opus-4-1-20250805-v1:0` | — | `us.anthropic.claude-opus-4-1-20250805-v1:0` |
| Anthropic | `anthropic.claude-opus-4-5-20251101-v1:0` | — | `us.anthropic.claude-opus-4-5-20251101-v1:0`, `global.anthropic.claude-opus-4-5-20251101-v1:0` |
| Anthropic | `anthropic.claude-opus-4-6-v1` | — | `global.anthropic.claude-opus-4-6-v1`, `us.anthropic.claude-opus-4-6-v1` |
| Anthropic | `anthropic.claude-opus-4-7` | — | `us.anthropic.claude-opus-4-7`, `global.anthropic.claude-opus-4-7` |
| Anthropic | `anthropic.claude-opus-4-8` | — | `us.anthropic.claude-opus-4-8`, `global.anthropic.claude-opus-4-8` |
| Anthropic | `anthropic.claude-opus-5` | — | `us.anthropic.claude-opus-5`, `global.anthropic.claude-opus-5` |
| Anthropic | `anthropic.claude-opus-5-5` | — | `us.anthropic.claude-opus-5-5`, `global.anthropic.claude-opus-5-5` |
| anthropic | `anthropic.claude-sonnet-4-20250514-v1:0` | — | `us.anthropic.claude-sonnet-4-20250514-v1:0`, `global.anthropic.claude-sonnet-4-20250514-v1:0` |
| Anthropic | `anthropic.claude-sonnet-4-5-20250929-v1:0` | — | `global.anthropic.claude-sonnet-4-5-20250929-v1:0`, `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Anthropic | `anthropic.claude-sonnet-4-6` | — | `global.anthropic.claude-sonnet-4-6`, `us.anthropic.claude-sonnet-4-6` |
| Anthropic | `anthropic.claude-sonnet-5` | — | `us.anthropic.claude-sonnet-5`, `global.anthropic.claude-sonnet-5` |
| Anthropic | `anthropic.claude-sonnet-5-5` | — | `global.anthropic.claude-sonnet-5-5` |
| DeepSeek | `deepseek.r1-v1:0` | — | `us.deepseek.r1-v1:0` |
| DeepSeek | `deepseek.v3-v1:0` | ○ | — |
| DeepSeek | `deepseek.v3.2` | ○ | — |
| Google | `google.gemma-3-12b-it` | ○ | — |
| Google | `google.gemma-3-27b-it` | ○ | — |
| Google | `google.gemma-3-4b-it` | ○ | — |
| meta | `meta.llama3-1-405b-instruct-v1:0` | — | `us.meta.llama3-1-405b-instruct-v1:0` |
| Meta | `meta.llama3-1-70b-instruct-v1:0` | — | `us.meta.llama3-1-70b-instruct-v1:0` |
| Meta | `meta.llama3-1-8b-instruct-v1:0` | — | `us.meta.llama3-1-8b-instruct-v1:0` |
| meta | `meta.llama3-2-11b-instruct-v1:0` | — | `us.meta.llama3-2-11b-instruct-v1:0` |
| meta | `meta.llama3-2-1b-instruct-v1:0` | — | `us.meta.llama3-2-1b-instruct-v1:0` |
| meta | `meta.llama3-2-3b-instruct-v1:0` | — | `us.meta.llama3-2-3b-instruct-v1:0` |
| meta | `meta.llama3-2-90b-instruct-v1:0` | — | `us.meta.llama3-2-90b-instruct-v1:0` |
| Meta | `meta.llama3-3-70b-instruct-v1:0` | ○ | `us.meta.llama3-3-70b-instruct-v1:0` |
| Meta | `meta.llama4-maverick-17b-instruct-v1:0` | — | `us.meta.llama4-maverick-17b-instruct-v1:0` |
| Meta | `meta.llama4-scout-17b-instruct-v1:0` | — | `us.meta.llama4-scout-17b-instruct-v1:0` |
| MiniMax | `minimax.minimax-m2` | ○ | — |
| MiniMax | `minimax.minimax-m2.1` | ○ | — |
| MiniMax | `minimax.minimax-m2.5` | ○ | — |
| Mistral AI | `mistral.devstral-2-123b` | ○ | — |
| Mistral AI | `mistral.magistral-small-2509` | ○ | — |
| Mistral AI | `mistral.ministral-3-14b-instruct` | ○ | — |
| Mistral AI | `mistral.ministral-3-3b-instruct` | ○ | — |
| Mistral AI | `mistral.ministral-3-8b-instruct` | ○ | — |
| Mistral AI | `mistral.mistral-large-3-675b-instruct` | ○ | — |
| Mistral AI | `mistral.pixtral-large-2502-v1:0` | — | `us.mistral.pixtral-large-2502-v1:0` |
| Mistral AI | `mistral.voxtral-mini-3b-2507` | ○ | — |
| Mistral AI | `mistral.voxtral-small-24b-2507` | ○ | — |
| Moonshot AI | `moonshot.kimi-k2-thinking` | ○ | — |
| Moonshot AI | `moonshotai.kimi-k2.5` | ○ | — |
| Moonshot AI | `moonshotai.kimi-k3` | — | `global.moonshotai.kimi-k3`, `us.moonshotai.kimi-k3` |
| NVIDIA | `nvidia.nemotron-nano-12b-v2` | ○ | — |
| NVIDIA | `nvidia.nemotron-nano-3-30b` | ○ | — |
| NVIDIA | `nvidia.nemotron-nano-9b-v2` | ○ | — |
| NVIDIA | `nvidia.nemotron-super-3-120b` | ○ | — |
| OpenAI | `openai.gpt-5.4` | — | `us.openai.gpt-5.4`, `global.openai.gpt-5.4` |
| OpenAI | `openai.gpt-5.5` | — | `us.openai.gpt-5.5`, `global.openai.gpt-5.5` |
| OpenAI | `openai.gpt-5.6-luna` | — | `us.openai.gpt-5.6-luna`, `global.openai.gpt-5.6-luna` |
| OpenAI | `openai.gpt-5.6-sol` | — | `us.openai.gpt-5.6-sol`, `global.openai.gpt-5.6-sol` |
| OpenAI | `openai.gpt-5.6-terra` | — | `us.openai.gpt-5.6-terra`, `global.openai.gpt-5.6-terra` |
| OpenAI | `openai.gpt-6-astra` | — | `global.openai.gpt-6-astra`, `us.openai.gpt-6-astra` |
| OpenAI | `openai.gpt-6-luna` | — | `global.openai.gpt-6-luna`, `us.openai.gpt-6-luna` |
| OpenAI | `openai.gpt-6-sol` | — | `global.openai.gpt-6-sol`, `us.openai.gpt-6-sol` |
| OpenAI | `openai.gpt-oss-120b-1:0` | ○ | — |
| OpenAI | `openai.gpt-oss-20b-1:0` | ○ | — |
| OpenAI | `openai.gpt-oss-safeguard-120b` | ○ | — |
| OpenAI | `openai.gpt-oss-safeguard-20b` | ○ | — |
| Qwen | `qwen.qwen3-235b-a22b-2507-v1:0` | ○ | — |
| Qwen | `qwen.qwen3-32b-v1:0` | ○ | — |
| Qwen | `qwen.qwen3-coder-30b-a3b-v1:0` | ○ | — |
| Qwen | `qwen.qwen3-coder-480b-a35b-v1:0` | ○ | — |
| Qwen | `qwen.qwen3-next-80b-a3b` | ○ | — |
| Qwen | `qwen.qwen3-vl-235b-a22b` | ○ | — |
| stability | `stability.stable-conservative-upscale-v1:0` | — | `us.stability.stable-conservative-upscale-v1:0` |
| stability | `stability.stable-creative-upscale-v1:0` | — | `us.stability.stable-creative-upscale-v1:0` |
| stability | `stability.stable-fast-upscale-v1:0` | — | `us.stability.stable-fast-upscale-v1:0` |
| stability | `stability.stable-outpaint-v1:0` | — | `us.stability.stable-outpaint-v1:0` |
| stability | `stability.stable-style-transfer-v1:0` | — | `us.stability.stable-style-transfer-v1:0` |
| TwelveLabs | `twelvelabs.pegasus-1-2-v1:0` | — | `us.twelvelabs.pegasus-1-2-v1:0`, `global.twelvelabs.pegasus-1-2-v1:0` |
| Writer | `writer.palmyra-vision-7b` | ○ | — |
| Writer | `writer.palmyra-x4-v1:0` | — | `us.writer.palmyra-x4-v1:0` |
| Writer | `writer.palmyra-x5-v1:0` | — | `us.writer.palmyra-x5-v1:0` |
| xAI | `xai.grok-4.6` | — | `us.xai.grok-4.6`, `global.xai.grok-4.6` |
| xAI | `xai.grok-4.7` | — | `us.xai.grok-4.7`, `global.xai.grok-4.7` |
| Z.AI | `zai.glm-4.7` | ○ | — |
| Z.AI | `zai.glm-4.7-flash` | ○ | — |
| Z.AI | `zai.glm-5` | ○ | — |

## 推論プロファイル一覧

| プロファイルID | 名前 | 種別 |
| :-- | :-- | :-- |
| `global.amazon.nova-2-lite-v1:0` | GLOBAL Amazon Nova 2 Lite | SYSTEM_DEFINED |
| `global.anthropic.claude-fable-5` | Global Anthropic Claude Fable 5 | SYSTEM_DEFINED |
| `global.anthropic.claude-fable-5-1` | Global Anthropic Claude Fable 5.1 | SYSTEM_DEFINED |
| `global.anthropic.claude-haiku-4-5-20251001-v1:0` | Global Anthropic Claude Haiku 4.5 | SYSTEM_DEFINED |
| `global.anthropic.claude-opus-4-5-20251101-v1:0` | GLOBAL Anthropic Claude Opus 4.5 | SYSTEM_DEFINED |
| `global.anthropic.claude-opus-4-6-v1` | Global Anthropic Claude Opus 4.6 | SYSTEM_DEFINED |
| `global.anthropic.claude-opus-4-7` | Global Anthropic Claude Opus 4.7 | SYSTEM_DEFINED |
| `global.anthropic.claude-opus-4-8` | Global Anthropic Claude Opus 4.8 | SYSTEM_DEFINED |
| `global.anthropic.claude-opus-5` | Global Anthropic Claude Opus 5 | SYSTEM_DEFINED |
| `global.anthropic.claude-opus-5-5` | Global Anthropic Claude Opus 5.5 | SYSTEM_DEFINED |
| `global.anthropic.claude-sonnet-4-20250514-v1:0` | Global Claude Sonnet 4 | SYSTEM_DEFINED |
| `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | Global Claude Sonnet 4.5 | SYSTEM_DEFINED |
| `global.anthropic.claude-sonnet-4-6` | Global Anthropic Claude Sonnet 4.6 | SYSTEM_DEFINED |
| `global.anthropic.claude-sonnet-5` | Global Anthropic Claude Sonnet 5 | SYSTEM_DEFINED |
| `global.anthropic.claude-sonnet-5-5` | Global Anthropic Claude Sonnet 5.5 | SYSTEM_DEFINED |
| `global.cohere.embed-v4:0` | Global Cohere Embed v4 | SYSTEM_DEFINED |
| `global.moonshotai.kimi-k3` | Global Moonshot AI Kimi K3 | SYSTEM_DEFINED |
| `global.openai.gpt-5.4` | Global OpenAI GPT 5.4 | SYSTEM_DEFINED |
| `global.openai.gpt-5.5` | Global OpenAI GPT 5.5 | SYSTEM_DEFINED |
| `global.openai.gpt-5.6-luna` | Global OpenAI GPT-5.6 Luna | SYSTEM_DEFINED |
| `global.openai.gpt-5.6-sol` | Global OpenAI GPT-5.6 Sol | SYSTEM_DEFINED |
| `global.openai.gpt-5.6-terra` | Global OpenAI GPT-5.6 Terra | SYSTEM_DEFINED |
| `global.openai.gpt-6-astra` | Global OpenAI GPT-6 Astra | SYSTEM_DEFINED |
| `global.openai.gpt-6-luna` | Global OpenAI GPT-6 Luna | SYSTEM_DEFINED |
| `global.openai.gpt-6-sol` | Global OpenAI GPT-6 Sol | SYSTEM_DEFINED |
| `global.twelvelabs.pegasus-1-2-v1:0` | GLOBAL TwelveLabs Pegasus v1.2 | SYSTEM_DEFINED |
| `global.xai.grok-4.6` | Global xAI Grok 4.6 | SYSTEM_DEFINED |
| `global.xai.grok-4.7` | Global xAI Grok 4.7 | SYSTEM_DEFINED |
| `us.amazon.nova-2-lite-v1:0` | US Amazon Nova 2 Lite | SYSTEM_DEFINED |
| `us.amazon.nova-lite-v1:0` | US Nova Lite | SYSTEM_DEFINED |
| `us.amazon.nova-micro-v1:0` | US Nova Micro | SYSTEM_DEFINED |
| `us.amazon.nova-premier-v1:0` | US Nova Premier | SYSTEM_DEFINED |
| `us.amazon.nova-pro-v1:0` | US Nova Pro | SYSTEM_DEFINED |
| `us.anthropic.claude-3-haiku-20240307-v1:0` | US Anthropic Claude 3 Haiku | SYSTEM_DEFINED |
| `us.anthropic.claude-fable-5` | US Anthropic Claude Fable 5 | SYSTEM_DEFINED |
| `us.anthropic.claude-fable-5-1` | US Anthropic Claude Fable 5.1 | SYSTEM_DEFINED |
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | US Anthropic Claude Haiku 4.5 | SYSTEM_DEFINED |
| `us.anthropic.claude-opus-4-1-20250805-v1:0` | US Claude Opus 4.1 | SYSTEM_DEFINED |
| `us.anthropic.claude-opus-4-5-20251101-v1:0` | US Anthropic Claude Opus 4.5 | SYSTEM_DEFINED |
| `us.anthropic.claude-opus-4-6-v1` | US Anthropic Claude Opus 4.6 | SYSTEM_DEFINED |
| `us.anthropic.claude-opus-4-7` | US Anthropic Claude Opus 4.7 | SYSTEM_DEFINED |
| `us.anthropic.claude-opus-4-8` | US Anthropic Claude Opus 4.8 | SYSTEM_DEFINED |
| `us.anthropic.claude-opus-5` | US Anthropic Claude Opus 5 | SYSTEM_DEFINED |
| `us.anthropic.claude-opus-5-5` | US Anthropic Claude Opus 5.5 | SYSTEM_DEFINED |
| `us.anthropic.claude-sonnet-4-20250514-v1:0` | US Claude Sonnet 4 | SYSTEM_DEFINED |
| `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | US Anthropic Claude Sonnet 4.5 | SYSTEM_DEFINED |
| `us.anthropic.claude-sonnet-4-6` | US Anthropic Claude Sonnet 4.6 | SYSTEM_DEFINED |
| `us.anthropic.claude-sonnet-5` | US Anthropic Claude Sonnet 5 | SYSTEM_DEFINED |
| `us.cohere.embed-v4:0` | US Cohere Embed v4 | SYSTEM_DEFINED |
| `us.deepseek.r1-v1:0` | US DeepSeek-R1 | SYSTEM_DEFINED |
| `us.meta.llama3-1-405b-instruct-v1:0` | US Meta Llama 3.1 Instruct 405B | SYSTEM_DEFINED |
| `us.meta.llama3-1-70b-instruct-v1:0` | US Meta Llama 3.1 70B Instruct | SYSTEM_DEFINED |
| `us.meta.llama3-1-8b-instruct-v1:0` | US Meta Llama 3.1 8B Instruct | SYSTEM_DEFINED |
| `us.meta.llama3-2-11b-instruct-v1:0` | US Meta Llama 3.2 11B Instruct | SYSTEM_DEFINED |
| `us.meta.llama3-2-1b-instruct-v1:0` | US Meta Llama 3.2 1B Instruct | SYSTEM_DEFINED |
| `us.meta.llama3-2-3b-instruct-v1:0` | US Meta Llama 3.2 3B Instruct | SYSTEM_DEFINED |
| `us.meta.llama3-2-90b-instruct-v1:0` | US Meta Llama 3.2 90B Instruct | SYSTEM_DEFINED |
| `us.meta.llama3-3-70b-instruct-v1:0` | US Meta Llama 3.3 70B Instruct | SYSTEM_DEFINED |
| `us.meta.llama4-maverick-17b-instruct-v1:0` | US Llama 4 Maverick 17B Instruct | SYSTEM_DEFINED |
| `us.meta.llama4-scout-17b-instruct-v1:0` | US Llama 4 Scout 17B Instruct | SYSTEM_DEFINED |
| `us.mistral.pixtral-large-2502-v1:0` | US Mistral Pixtral Large 25.02 | SYSTEM_DEFINED |
| `us.moonshotai.kimi-k3` | US Moonshot AI Kimi K3 | SYSTEM_DEFINED |
| `us.openai.gpt-5.4` | US OpenAI GPT 5.4 | SYSTEM_DEFINED |
| `us.openai.gpt-5.5` | US OpenAI GPT 5.5 | SYSTEM_DEFINED |
| `us.openai.gpt-5.6-luna` | US OpenAI GPT-5.6 Luna | SYSTEM_DEFINED |
| `us.openai.gpt-5.6-sol` | US OpenAI GPT-5.6 Sol | SYSTEM_DEFINED |
| `us.openai.gpt-5.6-terra` | US OpenAI GPT-5.6 Terra | SYSTEM_DEFINED |
| `us.openai.gpt-6-astra` | US OpenAI GPT-6 Astra | SYSTEM_DEFINED |
| `us.openai.gpt-6-luna` | US OpenAI GPT-6 Luna | SYSTEM_DEFINED |
| `us.openai.gpt-6-sol` | US OpenAI GPT-6 Sol | SYSTEM_DEFINED |
| `us.stability.stable-conservative-upscale-v1:0` | US Stable Image Conservative Upscale | SYSTEM_DEFINED |
| `us.stability.stable-creative-upscale-v1:0` | US Stable Image Creative Upscale | SYSTEM_DEFINED |
| `us.stability.stable-fast-upscale-v1:0` | US Stable Image Fast Upscale | SYSTEM_DEFINED |
| `us.stability.stable-image-control-sketch-v1:0` | US Stable Image Control Sketch | SYSTEM_DEFINED |
| `us.stability.stable-image-control-structure-v1:0` | US Stable Image Control Structure | SYSTEM_DEFINED |
| `us.stability.stable-image-erase-object-v1:0` | US Stable Image Erase Object | SYSTEM_DEFINED |
| `us.stability.stable-image-inpaint-v1:0` | US Stable Image Inpaint | SYSTEM_DEFINED |
| `us.stability.stable-image-remove-background-v1:0` | US Stable Image Remove Background | SYSTEM_DEFINED |
| `us.stability.stable-image-search-recolor-v1:0` | US Stable Image Search and Recolor | SYSTEM_DEFINED |
| `us.stability.stable-image-search-replace-v1:0` | US Stable Image Search and Replace | SYSTEM_DEFINED |
| `us.stability.stable-image-style-guide-v1:0` | US Stable Image Style Guide | SYSTEM_DEFINED |
| `us.stability.stable-outpaint-v1:0` | US Stable Image Outpaint | SYSTEM_DEFINED |
| `us.stability.stable-style-transfer-v1:0` | US Stable Image Style Transfer | SYSTEM_DEFINED |
| `us.twelvelabs.pegasus-1-2-v1:0` | US TwelveLabs Pegasus v1.2 | SYSTEM_DEFINED |
| `us.writer.palmyra-x4-v1:0` | US Writer Palmyra X4 | SYSTEM_DEFINED |
| `us.writer.palmyra-x5-v1:0` | US Writer Palmyra X5 | SYSTEM_DEFINED |
| `us.xai.grok-4.6` | US xAI Grok 4.6 | SYSTEM_DEFINED |
| `us.xai.grok-4.7` | US xAI Grok 4.7 | SYSTEM_DEFINED |
