#!/usr/bin/env python3
"""手順2: 検証役モデルの比較テスト。

fixtures の20問（正しい10問・欠陥入り10問）を各候補モデルに1問ずつ判定させ、
7つの検査項目ごとの合否を Structured Outputs（Converse の toolConfig による
JSONスキーマ強制）で返させる。toolChoice に対応しないモデルには段階的に
フォールバックし、使った方式は結果に記録する。

実行: python3 pipeline/test_verifiers.py [--limit N] [--only 候補名]
出力: pipeline/reports/verifiers.md / pipeline/reports/verifiers_raw.json
"""

import argparse
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE / ".pythonlibs"))

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

REPORTS = Path(__file__).resolve().parent / "reports"
FIXTURES = Path(__file__).resolve().parent / "tests" / "verifier_fixtures.json"

# 検証役の候補: 検証1候補（Claude Opus 系）＋ 手順1で呼び出せた非Anthropicモデル全部
CANDIDATES = {
    **getattr(config, "VERIFIER_1_CANDIDATES", {"verifier1": config.VERIFIER_1}),
    **config.VERIFIER_2_CANDIDATES,
}

# 単価（USD / 100万トークン）。2026-09 時点の手元の概算で、None は未確認。
# 実測トークン数は必ず併記するので、単価はあとから差し替えて再計算できる。
PRICING = {
    # Claude 5系・GPT-6系: マーケットプレイス契約のレートカードから判読した
    # standard 区分の値（2026-09-29 取得。バッチ半額・地域係数・長文区分が混在
    # するため gpt-6 は判読に幅がある。公式料金表で要確認）
    "us.anthropic.claude-opus-5-5": (4.00, 20.00),
    "us.anthropic.claude-opus-5": (5.00, 25.00),
    "global.anthropic.claude-sonnet-5-5": (2.00, 10.00),
    "us.anthropic.claude-sonnet-5": (2.00, 10.00),
    "us.openai.gpt-6-sol": (2.00, 15.00),
    "us.openai.gpt-6-astra": (10.00, 50.00),
    "us.anthropic.claude-opus-4-6-v1": (5.00, 25.00),
    "us.anthropic.claude-sonnet-4-6": (3.00, 15.00),
    "openai.gpt-oss-120b-1:0": (0.15, 0.60),
    "openai.gpt-oss-20b-1:0": (0.07, 0.30),
    "qwen.qwen3-235b-a22b-2507-v1:0": (0.22, 0.88),
    "mistral.mistral-large-3-675b-instruct": None,
    "us.amazon.nova-2-lite-v1:0": None,
    "us.amazon.nova-pro-v1:0": (0.80, 3.20),
}

# Structured Outputs の方式。前から順に試し、通った方式をそのモデルで使い続ける
MECHANISMS = ("tool_forced", "tool_any", "tool_auto", "json_prompt")

PRINT_LOCK = threading.Lock()


def log(msg):
    with PRINT_LOCK:
        print(msg, flush=True)


def build_tool(checks):
    props = {}
    for key, desc in checks.items():
        props[key] = {
            "type": "object",
            "properties": {
                "pass": {"type": "boolean", "description": f"{desc} → true=合格 / false=不合格"},
                "reason": {"type": "string", "description": "不合格のときの一言の理由（日本語）。合格なら空文字"},
            },
            "required": ["pass"],
        }
    return {
        "toolSpec": {
            "name": "submit_verification",
            "description": "7つの検査項目の判定結果を提出する",
            "inputSchema": {"json": {
                "type": "object",
                "properties": props,
                "required": list(checks),
            }},
        }
    }


def build_prompt(q, checks, json_mode):
    # モデルに渡すのは問題の中身だけ。fixtures の id / expect / _note 類は渡さない
    payload = {"answerIndex": q["answerIndex"], "ja": q["ja"], "en": q["en"]}
    lines = [
        "あなたは4択クイズ問題の検証者です。次の問題が出題に耐えるかを、7つの検査項目で審査してください。",
        "",
        "## 検査項目",
    ]
    for k, desc in checks.items():
        lines.append(f"- {k}: {desc}")
    lines += [
        "",
        "## 問題データ",
        "answerIndex は 0 始まりで、日英共通の「正解として設定されている選択肢の位置」。",
        "```json",
        json.dumps(payload, ensure_ascii=False, indent=1),
        "```",
        "",
        "## 判定のしかた",
        "- 事実に照らして厳密に判定する。確信を持って合格と言えない項目は不合格に倒す。",
        "- 不合格（pass=false）の項目には日本語で一言の理由（reason）を付ける。合格の項目の reason は空文字でよい。",
    ]
    if json_mode:
        example = {k: {"pass": True, "reason": ""} for k in checks}
        lines += [
            "- 次の形のJSONだけを出力する。前後に説明文やコードフェンスを付けない。",
            json.dumps(example, ensure_ascii=False),
        ]
    else:
        lines.append("- 必ず submit_verification ツールを1回だけ呼んで、全7項目の結果を返す。ツール呼び出し以外の出力はしない。")
    return "\n".join(lines)


def call_model(runtime, model_id, prompt, mechanism, tool):
    kwargs = {
        "modelId": model_id,
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"maxTokens": 1500},
    }
    if mechanism != "json_prompt":
        tool_config = {"tools": [tool]}
        if mechanism == "tool_forced":
            tool_config["toolChoice"] = {"tool": {"name": "submit_verification"}}
        elif mechanism == "tool_any":
            tool_config["toolChoice"] = {"any": {}}
        kwargs["toolConfig"] = tool_config
    return runtime.converse(**kwargs)


def parse_json_loose(text):
    text = re.sub(r"```(?:json)?", "", text).strip()
    i, j = text.find("{"), text.rfind("}")
    if i == -1 or j <= i:
        raise ValueError("応答にJSONが見つからない")
    return json.loads(text[i:j + 1])


def extract_payload(resp, mechanism):
    msg = resp["output"]["message"]
    if mechanism != "json_prompt":
        for b in msg.get("content", []):
            tu = b.get("toolUse")
            if tu and tu.get("name") == "submit_verification":
                return tu["input"]
    text = "".join(b.get("text", "") for b in msg.get("content", []) if "text" in b)
    return parse_json_loose(text)


def coerce_checks(payload, check_keys):
    out = {}
    for k in check_keys:
        v = payload.get(k)
        if isinstance(v, dict):
            p, reason = v.get("pass"), str(v.get("reason") or "")
        else:
            p, reason = v, ""
        if isinstance(p, str):
            p = p.strip().lower() in ("true", "pass", "ok", "yes", "合格")
        if not isinstance(p, bool):
            raise ValueError(f"項目 '{k}' の判定が欠落または不正")
        out[k] = {"pass": p, "reason": reason}
    return out


def judge_one(runtime, model_id, q, mechanism, tool, checks):
    prompt = build_prompt(q, checks, json_mode=(mechanism == "json_prompt"))
    t0 = time.monotonic()
    resp = call_model(runtime, model_id, prompt, mechanism, tool)
    latency = round(time.monotonic() - t0, 2)
    checks_result = coerce_checks(extract_payload(resp, mechanism), list(checks))
    usage = resp.get("usage", {})
    return {
        "mechanism": mechanism,
        "latency_s": latency,
        "input_tokens": usage.get("inputTokens"),
        "output_tokens": usage.get("outputTokens"),
        "stop_reason": resp.get("stopReason"),
        "checks": checks_result,
        "verdict": all(c["pass"] for c in checks_result.values()),
    }


def run_candidate(name, model_id, questions, checks):
    cfg = Config(region_name=config.REGION, connect_timeout=10, read_timeout=180,
                 retries={"max_attempts": 3, "mode": "adaptive"})
    runtime = boto3.client("bedrock-runtime", config=cfg)
    tool = build_tool(checks)
    mechanism = None
    results = []
    log(f"[{name}] start ({len(questions)}問) model={model_id}")
    for i, q in enumerate(questions):
        rec = {"qid": q["id"], "expect": q["expect"],
               "expectedFailures": q["expectedFailures"]}
        last_err = None
        done = False
        for attempt in range(3):
            mech_list = (mechanism,) if mechanism else MECHANISMS
            for m in mech_list:
                try:
                    rec.update(judge_one(runtime, model_id, q, m, tool, checks))
                    mechanism = m
                    done = True
                    break
                except (ClientError, BotoCoreError, ValueError, KeyError) as e:
                    code = ""
                    if isinstance(e, ClientError):
                        code = e.response.get("Error", {}).get("Code", "")
                    last_err = f"[{code or type(e).__name__}] {e}"
                    continue
            if done:
                break
            time.sleep(1.5 * (attempt + 1))
        if not done:
            rec["error"] = last_err
        v = rec.get("verdict")
        mark = "ERROR" if not done else ("pass" if v else "fail")
        log(f"[{name}] {i + 1}/{len(questions)} {q['id']} -> {mark}"
            + (f" ({rec.get('mechanism')})" if i == 0 and done else ""))
        results.append(rec)
    return name, model_id, mechanism, results


def estimate_cost(model_id, tok_in, tok_out):
    price = PRICING.get(model_id)
    if not price:
        return None
    return round(tok_in / 1e6 * price[0] + tok_out / 1e6 * price[1], 4)


def summarize(name, model_id, mechanism, results):
    ok = [r for r in results if r["expect"] == "pass"]
    ng = [r for r in results if r["expect"] == "fail"]
    ok_pass = sum(1 for r in ok if r.get("verdict") is True)
    ng_fail = sum(1 for r in ng if r.get("verdict") is False)
    errors = sum(1 for r in results if "error" in r)
    full_hit = part_hit = extra_ng = false_ok = 0
    for r in ng:
        if "checks" not in r:
            continue
        failed = {k for k, v in r["checks"].items() if not v["pass"]}
        exp = set(r["expectedFailures"])
        if exp and exp <= failed:
            full_hit += 1
        if exp & failed:
            part_hit += 1
        extra_ng += len(failed - exp)
    for r in ok:
        if "checks" in r:
            false_ok += sum(1 for v in r["checks"].values() if not v["pass"])
    tok_in = sum(r.get("input_tokens") or 0 for r in results)
    tok_out = sum(r.get("output_tokens") or 0 for r in results)
    total_time = round(sum(r.get("latency_s") or 0 for r in results), 1)
    cost = estimate_cost(model_id, tok_in, tok_out)
    return {
        "name": name, "model_id": model_id, "mechanism": mechanism,
        "n": len(results), "ok_pass": ok_pass, "ok_n": len(ok),
        "ng_fail": ng_fail, "ng_n": len(ng),
        "expected_full": full_hit, "expected_partial": part_hit,
        "extra_flags_on_ng": extra_ng, "false_flags_on_ok": false_ok,
        "errors": errors, "total_time_s": total_time,
        "avg_latency_s": round(total_time / max(len(results), 1), 2),
        "input_tokens": tok_in, "output_tokens": tok_out,
        "cost_usd_run": cost,
        "cost_usd_per_100q": (round(cost * 100 / max(len(results), 1), 4)
                              if cost is not None else None),
    }


def write_reports(now, checks, questions, all_results, summaries):
    REPORTS.mkdir(parents=True, exist_ok=True)
    raw = {"generated_at": now, "region": config.REGION, "checks": checks,
           "candidates": {
               name: {"model_id": mid, "mechanism": mech, "results": res}
               for name, mid, mech, res in all_results}}
    (REPORTS / "verifiers_raw.json").write_text(
        json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")

    def fmt_cost(v):
        return f"${v}" if v is not None else "単価未確認"

    lines = [
        "# 検証モデルの比較（手順2）", "",
        f"- 実行日時: {now}",
        f"- リージョン: {config.REGION}",
        f"- 出題: fixtures 20問（正しい10問 / 欠陥入り10問）× 候補{len(summaries)}モデル",
        "- 方式: Converse API の toolConfig で JSONスキーマを強制（Structured Outputs）。"
        "toolChoice 非対応モデルは tool_any → tool_auto → JSON指示 の順でフォールバック（使った方式は表に記載）",
        "- 判定: 7項目のうち1つでも不合格なら、その問題は不合格",
        "",
        "## 集計", "",
        "| 候補 | 方式 | 正しい10問を合格 | 欠陥10問を不合格 | 欠陥の指摘が完全一致 | 部分一致 | ok誤検知数 | ng過剰フラグ数 | 判定エラー | 合計時間 | 平均/問 | トークン in/out | 費用(20問) | 100問換算 |",
        "| :-- | :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: | :-- | :-- | :-- |",
    ]
    for s in summaries:
        lines.append(
            f"| {s['name']} | {s['mechanism']} | {s['ok_pass']}/{s['ok_n']} | {s['ng_fail']}/{s['ng_n']} "
            f"| {s['expected_full']}/{s['ng_n']} | {s['expected_partial']}/{s['ng_n']} "
            f"| {s['false_flags_on_ok']} | {s['extra_flags_on_ng']} | {s['errors']} "
            f"| {s['total_time_s']}s | {s['avg_latency_s']}s | {s['input_tokens']}/{s['output_tokens']} "
            f"| {fmt_cost(s['cost_usd_run'])} | {fmt_cost(s['cost_usd_per_100q'])} |")
    lines += [
        "",
        "- 「欠陥の指摘が完全一致」= expectedFailures の項目をすべて不合格にできた欠陥問題の数",
        "- 「ok誤検知数」= 正しい10問に付けた不合格フラグの総数（少ないほどよい）",
        "- 「ng過剰フラグ数」= 欠陥10問で、期待した項目以外に付けた不合格フラグの総数（参考値）",
        "- 単価はコード内の概算表（2026-09時点・要確認）。トークン実測値から再計算できる",
        "",
        "## 問題別の判定",
        "",
        "○=正しく判定 / △=不合格にできたが指摘項目が完全一致でない / ×=判定を誤った / E=エラー",
        "",
    ]
    header = "| 問題 | 種別 | " + " | ".join(s["name"] for s in summaries) + " |"
    lines.append(header)
    lines.append("| :-- | :-- | " + " | ".join(":--:" for _ in summaries) + " |")
    by_name = {name: {r["qid"]: r for r in res} for name, _, _, res in all_results}
    for q in questions:
        row = [q["id"], "正" if q["expect"] == "pass" else "欠陥"]
        for s in summaries:
            r = by_name[s["name"]].get(q["id"], {})
            if "error" in r or "verdict" not in r:
                row.append("E")
            elif q["expect"] == "pass":
                row.append("○" if r["verdict"] else "×")
            else:
                if r["verdict"]:
                    row.append("×")
                else:
                    failed = {k for k, v in r["checks"].items() if not v["pass"]}
                    row.append("○" if set(q["expectedFailures"]) <= failed else "△")
        lines.append("| " + " | ".join(row) + " |")
    lines += ["", "詳細（各項目の合否と理由の生データ）: `verifiers_raw.json`", ""]
    (REPORTS / "verifiers.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="各候補に出す問題数を絞る（動作確認用）")
    ap.add_argument("--only", type=str, default=None, help="候補名をカンマ区切りで絞る（動作確認用）")
    args = ap.parse_args()

    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    checks = fixtures["checks"]
    questions = fixtures["questions"]
    if args.limit:
        questions = questions[:args.limit]
    candidates = dict(CANDIDATES)
    if args.only:
        keep = {x.strip() for x in args.only.split(",")}
        candidates = {k: v for k, v in candidates.items() if k in keep}

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print(f"region={config.REGION} candidates={list(candidates)} questions={len(questions)}")

    with ThreadPoolExecutor(max_workers=len(candidates)) as ex:
        futures = [ex.submit(run_candidate, name, mid, questions, checks)
                   for name, mid in candidates.items()]
        all_results = [f.result() for f in futures]

    summaries = [summarize(name, mid, mech, res) for name, mid, mech, res in all_results]
    # 並び: 欠陥検出数 → 正問合格数 → 完全一致 の順で降順
    summaries.sort(key=lambda s: (s["ng_fail"], s["ok_pass"], s["expected_full"]), reverse=True)
    write_reports(now, checks, questions, all_results, summaries)
    print(f"\nwrote {REPORTS / 'verifiers.md'} and verifiers_raw.json")


if __name__ == "__main__":
    main()
