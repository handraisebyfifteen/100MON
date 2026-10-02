#!/usr/bin/env python3
"""手順1: us-east-2 で使える Bedrock モデルの一覧化と、候補モデルの疎通確認。

実行: python3 pipeline/check_models.py
出力: pipeline/reports/models.md / pipeline/reports/models_raw.json

モデルIDはハードコードせず、ListFoundationModels / ListInferenceProfiles の
結果からパターンで選ぶ。確定したIDは人が pipeline/config.py に転記する。
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE / ".pythonlibs"))

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-2")
REPORTS = Path(__file__).resolve().parent / "reports"

# 疎通確認用の短い日本語プロンプト（日本語が返るかの最低限の確認を兼ねる）
TEST_PROMPT = "日本の首都はどこですか。一語で答えてください。"

# テキスト用途でない・疎通対象にしないモデル名の断片
EXCLUDE_FRAGMENTS = ("embed", "canvas", "reel", "sonic", "image", "video", "rerank", "guardian")


def list_foundation_models(bedrock):
    return bedrock.list_foundation_models()["modelSummaries"]


def list_inference_profiles(bedrock):
    out = []
    for type_ in ("SYSTEM_DEFINED", "APPLICATION"):
        token = None
        while True:
            kwargs = {"typeEquals": type_, "maxResults": 1000}
            if token:
                kwargs["nextToken"] = token
            try:
                resp = bedrock.list_inference_profiles(**kwargs)
            except ClientError:
                break
            out.extend(resp.get("inferenceProfileSummaries", []))
            token = resp.get("nextToken")
            if not token:
                break
    return out


def provider_of(base_id):
    return base_id.split(".", 1)[0]


def build_pool(models, profiles):
    """基盤モデル一覧と推論プロファイルを、ベースモデルID単位に統合する。

    us-east-2 の基盤モデル一覧に無くても、この地域から使える
    クロスリージョンプロファイル（us. / global.）があれば候補になる。
    """
    pool = {}
    for m in models:
        mid = m["modelId"]
        if "TEXT" not in m.get("outputModalities", []):
            continue
        if "TEXT" not in m.get("inputModalities", []):
            continue
        if m.get("modelLifecycle", {}).get("status") not in (None, "ACTIVE"):
            continue
        types = m.get("inferenceTypesSupported", [])
        if not types or types == ["PROVISIONED"]:
            continue
        e = pool.setdefault(mid, {
            "base_id": mid, "name": m.get("modelName", ""),
            "provider": m.get("providerName", ""),
            "on_demand": False, "profiles": [], "in_region_list": True,
        })
        if "ON_DEMAND" in types:
            e["on_demand"] = True
    for p in profiles:
        if p.get("status") not in (None, "ACTIVE"):
            continue
        models_in = p.get("models") or []
        if not models_in:
            continue
        base = models_in[0]["modelArn"].split("/")[-1]
        if any(f in base for f in EXCLUDE_FRAGMENTS):
            continue
        e = pool.setdefault(base, {
            "base_id": base, "name": p.get("inferenceProfileName", ""),
            "provider": provider_of(base), "on_demand": False,
            "profiles": [], "in_region_list": False,
        })
        e["profiles"].append(p["inferenceProfileId"])
    return pool


def invoke_id(entry):
    """呼び出しに使うID。us. プロファイル > global. プロファイル > オンデマンドID。"""
    for pid in entry["profiles"]:
        if pid.startswith("us."):
            return pid
    for pid in entry["profiles"]:
        if pid.startswith("global."):
            return pid
    if entry["on_demand"]:
        return entry["base_id"]
    return None


def usable(pool):
    return [e for e in pool.values()
            if invoke_id(e) and not any(f in e["base_id"] for f in EXCLUDE_FRAGMENTS)]


def nova_rank(base_id):
    m = re.match(r"amazon\.nova(?:-(\d+))?-(premier|pro|lite|micro)", base_id)
    if not m:
        return None
    tier = {"premier": 4, "pro": 3, "lite": 2, "micro": 1}[m.group(2)]
    return (int(m.group(1) or 1), tier)


def claude_version(base_id):
    """claude-3-5-sonnet / claude-sonnet-4-5 / claude-sonnet-5 のどの形式でも比較できるようにする。"""
    name = base_id.split(".", 1)[1]
    toks = name.split("-")
    fam = next((f for f in ("sonnet", "opus", "haiku") if f in toks), None)
    if fam is None:
        return None, None
    i = toks.index(fam)
    after = []
    for t in toks[i + 1:i + 3]:
        if t.isdigit() and len(t) < 4:
            after.append(int(t))
        else:
            break
    before = [int(t) for t in toks[max(0, i - 2):i] if t.isdigit()]
    nums = after or before or [0]
    major, minor = nums[0], (nums[1] if len(nums) > 1 else 0)
    date = next((t for t in toks if len(t) == 8 and t.isdigit()), "0")
    return fam, (major, minor, date)


def pick_candidates(pool):
    """テストする候補を (区分ラベル, entry) のリストで返す。"""
    cands = []
    pool_usable = usable(pool)

    # --- Amazon Nova: テキスト系を全部テストし、使えた中の最上位を候補とする
    novas = [(nova_rank(e["base_id"]), e) for e in pool_usable]
    novas = sorted([x for x in novas if x[0]], key=lambda x: x[0], reverse=True)
    for _, e in novas:
        cands.append(("Amazon Nova", e))

    # --- Claude Sonnet / Opus: 全バージョンを新しい順にテスト
    #     （最新がアカウント未開放だったため、どの版まで使えるかを診断で示す。
    #       拒否のエラー文はそのまま報告に載せる）
    for fam_target in ("sonnet", "opus"):
        vers = []
        for e in pool_usable:
            if not e["base_id"].startswith("anthropic."):
                continue
            fam, ver = claude_version(e["base_id"])
            if fam == fam_target:
                vers.append((ver, e))
        vers.sort(key=lambda x: x[0], reverse=True)
        for rank, (_, e) in enumerate(vers):
            suffix = "最新" if rank == 0 else "診断用"
            cands.append((f"Claude {fam_target.capitalize()}（{suffix}）", e))

    # --- OpenAI: gpt-6 系（最上位世代）と gpt-oss 系を候補にする
    #     （gpt-5.x 系は一覧には載るが候補テストからは省く）
    openai_models = sorted(
        [e for e in pool_usable if e["base_id"].startswith("openai.")
         and ("gpt-6" in e["base_id"] or "gpt-oss" in e["base_id"])],
        key=lambda e: e["base_id"], reverse=True)
    for e in openai_models:
        cands.append(("OpenAI", e))

    # --- その他: Amazon / Anthropic / OpenAI 以外で日本語が扱えそうなもの上位2社
    #     検証役に使う可能性があるため、日本語力に加えてツール呼び出し
    #     （Structured Outputs の土台）が使えそうなものを優先する。
    PREFS = [
        ("qwen.qwen3", 100), ("qwen.", 95),
        ("mistral.mistral-large", 90), ("mistral.pixtral-large", 88), ("mistral.", 80),
        ("deepseek.", 78),
        ("meta.llama4", 74), ("meta.llama3-3", 72), ("meta.", 60),
        ("cohere.command-r-plus", 66), ("cohere.", 58),
        ("ai21.", 50), ("writer.", 45),
    ]

    def score(base_id):
        s = 0
        for pat, v in PREFS:
            if base_id.startswith(pat):
                s = max(s, v)
        if "235b" in base_id:
            s += 3
        if "coder" in base_id:
            s -= 8
        return s

    by_provider = {}
    for e in pool_usable:
        prov = provider_of(e["base_id"])
        if prov in ("amazon", "anthropic", "openai"):
            continue
        s = score(e["base_id"])
        if s <= 0:
            continue
        cur = by_provider.get(prov)
        if cur is None or s > cur[0]:
            by_provider[prov] = (s, e)
    others = sorted(by_provider.values(), key=lambda x: x[0], reverse=True)[:2]
    for _, e in others:
        cands.append(("その他（非Anthropic・非Amazon）", e))

    return cands


def test_invoke(runtime, model_id):
    t0 = time.monotonic()
    try:
        resp = runtime.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": [{"text": TEST_PROMPT}]}],
            inferenceConfig={"maxTokens": 256},
        )
        dt = time.monotonic() - t0
        msg = resp.get("output", {}).get("message", {})
        text = "".join(b.get("text", "") for b in msg.get("content", []) if "text" in b).strip()
        usage = resp.get("usage", {})
        return {
            "ok": True, "latency_s": round(dt, 2),
            "text": text[:160].replace("\n", " "),
            "input_tokens": usage.get("inputTokens"),
            "output_tokens": usage.get("outputTokens"),
            "stop_reason": resp.get("stopReason"),
        }
    except (ClientError, BotoCoreError) as e:
        dt = time.monotonic() - t0
        code = type(e).__name__
        if isinstance(e, ClientError):
            code = e.response.get("Error", {}).get("Code", code)
        return {"ok": False, "latency_s": round(dt, 2), "error_code": code, "error": str(e)}


def md_escape(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


def pick_summary(results):
    """テスト結果から、役割ごとの確定候補（呼び出せた中での最上位）を選ぶ。"""

    def first_ok(pred):
        for r in results:
            if r["result"]["ok"] and pred(r):
                return r
        return None

    rows = []
    novas_ok = [r for r in results if r["label"] == "Amazon Nova" and r["result"]["ok"]]
    rows.append(("生成候補: Amazon Nova（最上位）", novas_ok[0] if novas_ok else None))
    if len(novas_ok) > 1:
        rows.append(("生成候補の代替: Amazon Nova（次点）", novas_ok[1]))
    rows.append(("生成候補: Claude Sonnet（使えた最新）",
                 first_ok(lambda r: r["label"].startswith("Claude Sonnet"))))
    rows.append(("検証1: Claude Opus（使えた最新）",
                 first_ok(lambda r: r["label"].startswith("Claude Opus"))))
    # OpenAI: gpt-6 系は個別に、gpt-oss 系は safeguard 変種を除いた最大のもの
    openai_ok = [r for r in results if r["label"] == "OpenAI" and r["result"]["ok"]]
    for r in openai_ok:
        if "gpt-6" in r["base_id"]:
            rows.append((f"検証2候補/激ムズ用: {r['base_id'].split('.')[-1]}", r))
    oss = [r for r in openai_ok
           if "gpt-oss" in r["base_id"] and "safeguard" not in r["base_id"]]
    oss.sort(key=lambda r: int(re.search(r"(\d+)b", r["base_id"]).group(1)), reverse=True)
    rows.append(("検証2候補: OpenAI gpt-oss", oss[0] if oss else None))
    for r in results:
        if r["label"].startswith("その他") and r["result"]["ok"]:
            rows.append((f"検証2候補: {provider_of(r['base_id'])}", r))
    return rows


def write_reports(now, models, profiles, pool, results):
    REPORTS.mkdir(parents=True, exist_ok=True)

    raw = {
        "generated_at": now, "region": REGION,
        "foundation_models": models, "inference_profiles": profiles,
        "tests": results,
    }
    (REPORTS / "models_raw.json").write_text(
        json.dumps(raw, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    lines = []
    lines.append("# Bedrock モデル調査（手順1）")
    lines.append("")
    lines.append(f"- 実行日時: {now}")
    lines.append(f"- リージョン: {REGION}")
    lines.append(f"- 基盤モデル数（テキスト入出力・ACTIVE）: {sum(1 for e in pool.values() if e['in_region_list'])}")
    lines.append(f"- 推論プロファイル数: {len(profiles)}")
    lines.append("")

    lines.append("## 候補の確定（テスト結果からの自動判定）")
    lines.append("")
    lines.append("各役割について「呼び出せた中で最上位」のモデル。gpt-oss の safeguard 変種は安全分類特化のため候補から除外。")
    lines.append("")
    lines.append("| 役割 | モデル名 | 呼び出しID |")
    lines.append("| :-- | :-- | :-- |")
    for role, r in pick_summary(results):
        if r is None:
            lines.append(f"| {role} | （該当なし） | — |")
        else:
            lines.append(f"| {role} | {md_escape(r['name'])} | `{r['invoke_id']}` |")
    lines.append("")

    lines.append("## 候補モデルの疎通テスト結果")
    lines.append("")
    lines.append(f"送信文: 「{TEST_PROMPT}」（1回・maxTokens 256）")
    lines.append("")
    lines.append("| 区分 | モデル名 | ベースモデルID | 呼び出しに使ったID | 呼び出せたか | 応答時間 | 出力 or エラー内容 |")
    lines.append("| :-- | :-- | :-- | :-- | :-- | --: | :-- |")
    for r in results:
        if r["result"]["ok"]:
            ok = "○"
            detail = r["result"]["text"] or f"(空文字 / stopReason={r['result'].get('stop_reason')})"
        else:
            ok = "×"
            detail = f"[{r['result']['error_code']}] {r['result']['error']}"
        lines.append(
            f"| {md_escape(r['label'])} | {md_escape(r['name'])} | `{r['base_id']}` "
            f"| `{r['invoke_id']}` | {ok} | {r['result']['latency_s']}s | {md_escape(detail)} |")
    lines.append("")

    lines.append("## 利用可能なモデル一覧（テキスト入出力）")
    lines.append("")
    lines.append("基盤モデル一覧と、この地域から呼べるクロスリージョンプロファイルを統合したもの。")
    lines.append("")
    lines.append("| プロバイダ | ベースモデルID | オンデマンド | プロファイル |")
    lines.append("| :-- | :-- | :-- | :-- |")
    for e in sorted(pool.values(), key=lambda x: (provider_of(x["base_id"]), x["base_id"])):
        profs = ", ".join(f"`{p}`" for p in e["profiles"]) or "—"
        od = "○" if e["on_demand"] else "—"
        lines.append(f"| {md_escape(e['provider'] or provider_of(e['base_id']))} | `{e['base_id']}` | {od} | {profs} |")
    lines.append("")

    lines.append("## 推論プロファイル一覧")
    lines.append("")
    lines.append("| プロファイルID | 名前 | 種別 |")
    lines.append("| :-- | :-- | :-- |")
    for p in sorted(profiles, key=lambda x: x.get("inferenceProfileId", "")):
        lines.append(f"| `{p.get('inferenceProfileId')}` | {md_escape(p.get('inferenceProfileName', ''))} | {p.get('type', '')} |")
    lines.append("")

    (REPORTS / "models.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    cfg = Config(region_name=REGION, connect_timeout=10, read_timeout=90,
                 retries={"max_attempts": 2})
    bedrock = boto3.client("bedrock", config=cfg)
    runtime = boto3.client("bedrock-runtime", config=cfg)

    print(f"region={REGION}")
    models = list_foundation_models(bedrock)
    profiles = list_inference_profiles(bedrock)
    print(f"foundation models: {len(models)} / inference profiles: {len(profiles)}")

    pool = build_pool(models, profiles)
    candidates = pick_candidates(pool)
    print(f"candidates to test: {len(candidates)}")

    results = []
    for label, entry in candidates:
        iid = invoke_id(entry)
        print(f"  testing [{label}] {entry['base_id']} via {iid} ...", flush=True)
        r = test_invoke(runtime, iid)
        status = "OK" if r["ok"] else f"NG ({r['error_code']})"
        print(f"    -> {status} {r['latency_s']}s")
        results.append({
            "label": label, "name": entry["name"], "base_id": entry["base_id"],
            "invoke_id": iid, "result": r,
        })

    write_reports(now, models, profiles, pool, results)
    print(f"\nwrote {REPORTS / 'models.md'} and models_raw.json")


if __name__ == "__main__":
    main()
