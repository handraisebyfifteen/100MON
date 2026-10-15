#!/usr/bin/env python3
"""本番：1ピリオドぶんの100問を作る（設計書 §8）。

    python3 pipeline/generate_period.py --period-id 2026-P01 \\
        --starts 2026-10-19T00:00:00Z --ends 2026-10-26T00:00:00Z --quarter 1

流れ:  生成 → 形式チェック → 検証1・検証2 → 不合格なら修正（最大3回）→ 再検証
       → 全問合格 → 確定位置を測る → data/questions.<id>.json と data/period.<id>.json を書く

- モデルは config.py の PROD_* を使う（1行で差し替えられる）
- 使用済みの題材（この走行で採用・不採用になったもの、および data/ にある過去ピリオド）を
  生成役に渡して重複を防ぐ
- 判定結果はすべて pipeline/reports/<period-id>/ に残す（どの問題が何回直されたか後から見られる）
- 途中で落ちても accepted.json から --resume で続きから再開できる

--dry-run N を付けると合計 N 問だけ作り、出力先を reports 配下にして data/ は触らない。
"""

import argparse
import json
import random
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE / ".pythonlibs"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

import config
from test_generators import CALIBRATION, DIFF_GUIDE, build_generation_tool, validate_questions
from test_verifiers import PRICING, build_tool as build_verifier_tool, judge_one

DATA_DIR = WORKSPACE / "data"
REPORTS = Path(__file__).resolve().parent / "reports"
FIXTURES = Path(__file__).resolve().parent / "tests" / "verifier_fixtures.json"

DIFF_LABEL = {"beginner0": "最初級", "beginner": "初級", "intermediate": "中級", "advanced": "上級"}
BATCH_SIZE = 10          # 1回の生成で頼む問題数（多すぎると質が落ちる）
MAX_GEN_CALLS = 10       # 難易度ごとの生成呼び出しの上限（暴走防止）
VERIFY_WORKERS = 3       # 検証を並行して回す数（スロットリングに当たらない程度）
JA_TEXT_MAX = 30         # 日本語の問題文の上限文字数（設計書は10〜25文字の目安）
EN_TEXT_MAX = 120


# ---------------------------------------------------------------- Bedrock 共通

def make_runtime(read_timeout=300):
    cfg = Config(region_name=config.REGION, connect_timeout=10, read_timeout=read_timeout,
                 retries={"max_attempts": 3, "mode": "adaptive"})
    return boto3.client("bedrock-runtime", config=cfg)


def with_retry(fn, what, tries=5):
    """スロットリングや一時的なエラーは待って繰り返す。それ以外は上に投げる"""
    for attempt in range(tries):
        try:
            return fn()
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("ThrottlingException", "ServiceUnavailableException", "ModelNotReadyException",
                        "InternalServerException") and attempt < tries - 1:
                wait = 5 * (attempt + 1)
                print(f"    {what}: {code}、{wait}秒待って再試行", flush=True)
                time.sleep(wait)
                continue
            raise
        except BotoCoreError:
            if attempt < tries - 1:
                time.sleep(3 * (attempt + 1))
                continue
            raise


class CostMeter:
    def __init__(self):
        self.tokens = Counter()
        self.calls = Counter()

    def add(self, model_id, usage):
        self.tokens[(model_id, "in")] += usage.get("inputTokens") or 0
        self.tokens[(model_id, "out")] += usage.get("outputTokens") or 0
        self.calls[model_id] += 1

    def rows(self):
        out = []
        for model_id in sorted(self.calls):
            ti, to = self.tokens[(model_id, "in")], self.tokens[(model_id, "out")]
            price = PRICING.get(model_id)
            cost = round(ti / 1e6 * price[0] + to / 1e6 * price[1], 4) if price else None
            out.append((model_id, self.calls[model_id], ti, to, cost))
        return out


# ---------------------------------------------------------------- 生成

STYLE_RULES = [
    "## 書き方",
    "- 日本語の問題文は10〜25文字の目安で、短く素直に。体言止めで、句点や疑問符を付けない（例:「日本で一番高い山」）",
    "- 「〜は何ですか」「〜でしょう」のような疑問文にしない",
    "- 英語版は日本語版と意味と正解が完全に一致するように作る（直訳でなく自然な英語で。疑問符は付けない）",
    "- 選択肢は単語か短い語句。日英で answerIndex（正解の位置、0始まり）は共通。正解の位置は問題ごとにばらけさせる",
    "- 正解以外の3つは、確実に不正解だが同じ種類のもので揃える（例: すべて山の名前）",
    "- 同じカテゴリで揃えた選択肢の問題（最後まで読ませる）と、揃えない問題（早く確定する）を意図的に混ぜる",
    "- category は英語の小文字1語（geography, history, science, math, arts, music, literature, language, sports, daily, nature, animals, body, space, food, tech など）",
]


def build_prompt(difficulty, n, avoid, feedback=None):
    lines = [
        "あなたはTV向け4択速読クイズの問題作成者です。以下の条件で問題を"
        f"{n}問、日本語版と英語版を同時に作ってください。",
        "",
        f"## 難易度（全{n}問共通）",
        DIFF_GUIDE[difficulty],
        "",
        CALIBRATION,
        "",
        "## 問題の条件",
        "- 事実が確定していて、正解が1つに定まる問題にする",
        "- 時期によって答えが変わる題材（現職の人物、最新の記録、現在の統計順位、測り直される数値など）は使わない",
        "- 引っかけ・言葉遊び・紛らわしい書き方で難しくしない。難しさは知識そのものから来るようにする",
        "- 複数の解釈ができる書き方をしない（「大きい」なら何の大きさかが自明であること）",
        "- 法律や公式の定めが無いもの（例: 日本の国花・国鳥）を「定まっている」ように問わない",
        "- 特定の国・地域・人を不当に扱う内容にしない",
        "- 実在のテレビ番組や存命の著名人を題材にしない",
        "",
        *STYLE_RULES,
        "",
        f"- {n}問の分野は偏らないように散らす。同じ題材を2回使わない",
    ]
    if avoid:
        lines += ["", "## 使用済みの題材（これらと同じ題材・同じ正解の問題は作らない）"]
        lines += [f"- {a}" for a in avoid]
    if feedback:
        lines += ["", "## 前回の提出の問題点（直して作り直すこと）", feedback]
    lines += ["", "必ず submit_questions ツールを1回だけ呼んで提出する。ツール呼び出し以外の出力はしない。"]
    return "\n".join(lines)


def build_fix_prompt(q, reasons, avoid):
    payload = {"category": q["category"], "answerIndex": q["answerIndex"], "ja": q["ja"], "en": q["en"]}
    lines = [
        "あなたはTV向け4択速読クイズの問題作成者です。次の問題が検証で不合格になりました。",
        "指摘を踏まえて直した問題を1問提出してください。同じ題材のまま直せないときは、同じ難易度で別の題材に差し替えて構いません。",
        "",
        f"## 難易度", DIFF_GUIDE[q["difficulty"]],
        "",
        "## 元の問題",
        "```json", json.dumps(payload, ensure_ascii=False, indent=1), "```",
        "",
        "## 検証の指摘",
        *[f"- {r}" for r in reasons],
        "",
        *STYLE_RULES,
    ]
    if avoid:
        lines += ["", "## 使用済みの題材（差し替えるときも、これらと同じ題材・正解にしない）"]
        lines += [f"- {a}" for a in avoid[-60:]]
    lines += ["", "必ず submit_questions ツールを1回だけ呼んで1問だけ提出する。ツール呼び出し以外の出力はしない。"]
    return "\n".join(lines)


def call_generator(runtime, meter, prompt, n):
    tool = build_generation_tool(n)
    resp = with_retry(lambda: runtime.converse(
        modelId=config.PROD_GENERATOR,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 4000},
        toolConfig={"tools": [tool], "toolChoice": {"tool": {"name": "submit_questions"}}},
    ), "生成")
    meter.add(config.PROD_GENERATOR, resp.get("usage", {}))
    for b in resp["output"]["message"].get("content", []):
        tu = b.get("toolUse")
        if tu and tu.get("name") == "submit_questions":
            valid, problems = validate_questions(tu["input"])
            return valid, problems
    return [], ["ツール呼び出しが返らなかった"]


# ---------------------------------------------------------------- 形式チェック（モデルを呼ばずに弾く）

def local_check(q, used_answers, used_texts):
    ja, en = q["ja"], q["en"]
    problems = []
    jt = ja["text"]
    if not (4 <= len(jt) <= JA_TEXT_MAX):
        problems.append(f"日本語の問題文が{len(jt)}文字（4〜{JA_TEXT_MAX}文字にする）")
    if re.search(r"[。？?]$", jt) or re.search(r"(ですか|でしょう|ましょう|か|何になる|何)$", jt):
        problems.append("日本語の問題文は体言止めにし、句点・疑問符・疑問文にしない")
    if not (4 <= len(en["text"]) <= EN_TEXT_MAX):
        problems.append(f"英語の問題文が{len(en['text'])}文字（{EN_TEXT_MAX}文字以内にする）")
    if en["text"].rstrip().endswith("?"):
        problems.append("英語の問題文に疑問符を付けない")
    if any(len(c) > 25 for c in ja["choices"]) or any(len(c) > 40 for c in en["choices"]):
        problems.append("選択肢が長すぎる（単語か短い語句にする）")
    answer = ja["choices"][q["answerIndex"]]
    if answer in used_answers:
        problems.append(f"正解「{answer}」は使用済みの題材")
    if jt in used_texts:
        problems.append("同じ問題文が使用済み")
    return problems


# ---------------------------------------------------------------- 検証

def verify(runtime_pool, meter, tool, checks, q):
    """検証1→検証2の順に呼ぶ。両方合格で True。不合格理由の一覧も返す"""
    results = {}
    reasons = []
    for vname, model_id in (("verifier1", config.PROD_VERIFIER_1), ("verifier2", config.PROD_VERIFIER_2)):
        runtime = runtime_pool[vname]
        try:
            rec = with_retry(lambda: judge_one(runtime, model_id, q, "tool_forced", tool, checks), vname)
            meter.add(model_id, {"inputTokens": rec.get("input_tokens"), "outputTokens": rec.get("output_tokens")})
        except (ClientError, BotoCoreError, ValueError, KeyError) as e:
            rec = {"error": f"{type(e).__name__}: {e}"}
        results[vname] = rec
        if rec.get("verdict") is False:
            for k, c in rec["checks"].items():
                if not c["pass"]:
                    reasons.append(f"[{vname}] {k}: {c.get('reason') or '理由なし'}")
        elif "error" in rec:
            reasons.append(f"[{vname}] 検証エラー: {rec['error'][:120]}")
    ok = all(results[v].get("verdict") is True for v in results)
    return ok, results, reasons


# ---------------------------------------------------------------- 確定位置

def build_dp_tool():
    return {"toolSpec": {
        "name": "submit_decision_point",
        "description": "答えが確定する位置を提出する",
        "inputSchema": {"json": {
            "type": "object",
            "properties": {
                "position": {"type": "integer", "minimum": 1,
                             "description": "問題文の先頭から何文字目まで読めば、4つの選択肢から正解を1つに絞れるか（1始まり）"},
                "reason": {"type": "string", "description": "一言の理由"},
            },
            "required": ["position"],
        }},
    }}


def measure_decision_point(runtime, meter, tool, text, choices, answer_index, locale):
    chars = list(text)  # コードポイント単位（core の splitChars と同じ数え方）
    numbered = " ".join(f"{i + 1}:{c}" for i, c in enumerate(chars))
    lang = "日本語" if locale == "ja" else "英語"
    prompt = "\n".join([
        f"4択クイズの{lang}の問題文を、先頭から1文字ずつ表示していきます。",
        "読み手は選択肢を先に見ています。問題文を何文字目まで読んだ時点で、4つの選択肢のうち正解が1つに絞れるかを答えてください。",
        "",
        f"問題文（{len(chars)}文字。番号:文字）: {numbered}",
        f"問題文（通し）: {text}",
        f"選択肢: {json.dumps(choices, ensure_ascii=False)}",
        f"正解: {choices[answer_index]}",
        "",
        "判定のしかた:",
        "- その文字まで読んだ時点で、他の3つの選択肢が除外できるなら、そこが確定位置",
        "- 早とちりは禁物。たとえば「日本で一番高い」では「山」か「ビル」か分からないなら、まだ確定していない",
        "- 最後まで読まないと決まらないなら、文字数そのものを答える",
        f"- position は 1〜{len(chars)} の整数",
        "必ず submit_decision_point ツールを1回だけ呼ぶ。",
    ])
    resp = with_retry(lambda: runtime.converse(
        modelId=config.PROD_DECISION_POINT_MODEL,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 300},
        toolConfig={"tools": [tool], "toolChoice": {"tool": {"name": "submit_decision_point"}}},
    ), "確定位置")
    meter.add(config.PROD_DECISION_POINT_MODEL, resp.get("usage", {}))
    for b in resp["output"]["message"].get("content", []):
        tu = b.get("toolUse")
        if tu and tu.get("name") == "submit_decision_point":
            pos = int(tu["input"].get("position", len(chars)))
            return max(1, min(len(chars), pos))
    return len(chars)


# ---------------------------------------------------------------- 使用済みの題材

def load_used_from_data(exclude_period_id):
    """data/ にある過去ピリオドの問題から、正解と問題文を集める（仮データ *.temp.json は除く）"""
    answers, texts, avoid = set(), set(), []
    for path in sorted(DATA_DIR.glob("questions.*.json")):
        if ".temp." in path.name or path.name == f"questions.{exclude_period_id}.json":
            continue
        try:
            for q in json.loads(path.read_text(encoding="utf-8")):
                ja = q["locales"]["ja"]
                answers.add(ja["choices"][q["answerIndex"]])
                texts.add(ja["text"])
                avoid.append(f"{ja['text']} → {ja['choices'][q['answerIndex']]}")
        except (OSError, ValueError, KeyError):
            continue
    return answers, texts, avoid


# ---------------------------------------------------------------- 本体

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--period-id", required=True)
    ap.add_argument("--starts", required=True, help="UTC、例 2026-10-19T00:00:00Z")
    ap.add_argument("--ends", required=True)
    ap.add_argument("--quarter", type=int, default=1)
    ap.add_argument("--dry-run", type=int, default=0, help="合計 N 問だけ作る（data/ は触らない）")
    ap.add_argument("--resume", action="store_true", help="accepted.json から続きを再開する")
    args = ap.parse_args()

    period_id = args.period_id
    out_dir = REPORTS / period_id
    out_dir.mkdir(parents=True, exist_ok=True)
    accepted_path = out_dir / "accepted.json"
    log_path = out_dir / "log.json"

    allocation = dict(config.PROD_ALLOCATION)
    if args.dry_run:
        total = sum(allocation.values())
        allocation = {k: max(1, round(v * args.dry_run / total)) for k, v in allocation.items()}
    target_total = sum(allocation.values())

    checks = json.loads(FIXTURES.read_text(encoding="utf-8"))["checks"]
    verifier_tool = build_verifier_tool(checks)
    dp_tool = build_dp_tool()
    meter = CostMeter()
    gen_runtime = make_runtime()
    verifier_pool = {"verifier1": make_runtime(180), "verifier2": make_runtime(180)}
    dp_runtime = make_runtime(60)

    used_answers, used_texts, avoid = load_used_from_data(period_id)
    accepted = []
    log = {"period_id": period_id, "started_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "generator": config.PROD_GENERATOR, "verifier1": config.PROD_VERIFIER_1,
           "verifier2": config.PROD_VERIFIER_2, "decision_point_model": config.PROD_DECISION_POINT_MODEL,
           "allocation": allocation, "events": []}
    if args.resume and accepted_path.exists():
        accepted = json.loads(accepted_path.read_text(encoding="utf-8"))
        print(f"再開: 採用済み {len(accepted)} 問を読み込んだ")
    for q in accepted:
        used_answers.add(q["ja"]["choices"][q["answerIndex"]])
        used_texts.add(q["ja"]["text"])
        avoid.append(f"{q['ja']['text']} → {q['ja']['choices'][q['answerIndex']]}")

    def save_progress():
        accepted_path.write_text(json.dumps(accepted, ensure_ascii=False, indent=1), encoding="utf-8")
        log_path.write_text(json.dumps(log, ensure_ascii=False, indent=1), encoding="utf-8")

    def note(kind, **data):
        log["events"].append({"t": datetime.now(timezone.utc).isoformat(timespec="seconds"), "kind": kind, **data})

    def mark_used(q):
        answer = q["ja"]["choices"][q["answerIndex"]]
        used_answers.add(answer)
        used_texts.add(q["ja"]["text"])
        avoid.append(f"{q['ja']['text']} → {answer}")

    def process(q, difficulty):
        """1問を 形式チェック→検証→修正ループ に通す。採用なら問題を返す"""
        q["difficulty"] = difficulty
        history = []
        for round_no in range(config.PROD_FIX_ROUNDS + 1):
            problems = local_check(q, used_answers, used_texts)
            if problems:
                ok, results, reasons = False, {}, [f"[形式] {p}" for p in problems]
            else:
                ok, results, reasons = verify(verifier_pool, meter, verifier_tool, checks, q)
            history.append({"round": round_no, "question": {k: q[k] for k in ("category", "answerIndex", "ja", "en")},
                            "ok": ok, "reasons": reasons, "verification": results})
            if ok:
                note("accepted", difficulty=difficulty, rounds=round_no, history=history)
                mark_used(q)
                return q
            if round_no == config.PROD_FIX_ROUNDS:
                break
            # 不採用の題材も、繰り返し出てこないよう使用済みに入れておく
            avoid.append(f"{q['ja']['text']} → {q['ja']['choices'][q['answerIndex']]}（不採用）")
            fixed, gen_problems = call_generator(gen_runtime, meter, build_fix_prompt(q, reasons, avoid), 1)
            if not fixed:
                history.append({"round": round_no + 1, "error": "修正の提出が無効: " + " / ".join(gen_problems)})
                break
            q = {**fixed[0], "difficulty": difficulty}
        note("discarded", difficulty=difficulty, history=history)
        return None

    for difficulty, target in allocation.items():
        have = sum(1 for q in accepted if q["difficulty"] == difficulty)
        calls = 0
        while have < target and calls < MAX_GEN_CALLS:
            need = min(BATCH_SIZE, target - have)
            calls += 1
            print(f"[{DIFF_LABEL[difficulty]}] {have}/{target} 採用済み。{need}問を生成（{calls}回目）...", flush=True)
            batch, gen_problems = call_generator(gen_runtime, meter, build_prompt(difficulty, need, avoid), need)
            if gen_problems:
                note("generation_problems", difficulty=difficulty, problems=gen_problems)
            # バッチ内の重複は先に落とす
            seen = set()
            uniq = []
            for q in batch:
                key = q["ja"]["text"]
                if key not in seen:
                    seen.add(key)
                    uniq.append(q)
            with ThreadPoolExecutor(max_workers=VERIFY_WORKERS) as ex:
                results = list(ex.map(lambda q: process(q, difficulty), uniq))
            got = [q for q in results if q is not None]
            for q in got:
                accepted.append(q)
            have += len(got)
            print(f"[{DIFF_LABEL[difficulty]}] このバッチ {len(got)}/{len(uniq)} 採用 → {have}/{target}", flush=True)
            save_progress()
        if have < target:
            print(f"[{DIFF_LABEL[difficulty]}] 上限 {MAX_GEN_CALLS} 回でも {have}/{target} 問。足りないまま続行", flush=True)

    # ---- 確定位置 ----
    print(f"確定位置を測る（{len(accepted)}問 × 2言語）...", flush=True)

    def measure(q):
        for loc in ("ja", "en"):
            q[loc]["decisionPoint"] = measure_decision_point(
                dp_runtime, meter, dp_tool, q[loc]["text"], q[loc]["choices"], q["answerIndex"], loc)
        return q

    with ThreadPoolExecutor(max_workers=VERIFY_WORKERS) as ex:
        accepted = list(ex.map(measure, accepted))
    save_progress()

    # ---- 出力 ----
    rng = random.Random(period_id)
    rng.shuffle(accepted)
    questions = []
    for i, q in enumerate(accepted):
        questions.append({
            "id": f"{period_id}_q{i + 1:03d}",
            "answerIndex": q["answerIndex"],
            "category": (q.get("category") or "general").strip().lower(),
            "difficulty": q["difficulty"],
            "locales": {
                "ja": {"text": q["ja"]["text"], "choices": q["ja"]["choices"], "decisionPoint": q["ja"]["decisionPoint"]},
                "en": {"text": q["en"]["text"], "choices": q["en"]["choices"], "decisionPoint": q["en"]["decisionPoint"]},
            },
        })
    period = {
        "id": period_id, "startsAt": args.starts, "endsAt": args.ends, "quarter": args.quarter,
        "isHardWeek": False, "questionIds": [q["id"] for q in questions],
    }
    if args.dry_run:
        q_path, p_path = out_dir / "questions.dryrun.json", out_dir / "period.dryrun.json"
    else:
        q_path, p_path = DATA_DIR / f"questions.{period_id}.json", DATA_DIR / f"period.{period_id}.json"
    q_path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    p_path.write_text(json.dumps(period, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    log["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    log["cost"] = [{"model": m, "calls": c, "in": ti, "out": to, "usd": cost} for m, c, ti, to, cost in meter.rows()]
    save_progress()
    write_report(out_dir, period_id, questions, log, allocation, target_total, q_path, p_path)
    print(f"\n書き出し: {q_path}\n        {p_path}\n報告: {out_dir / 'report.md'}")


def write_report(out_dir, period_id, questions, log, allocation, target_total, q_path, p_path):
    events = log["events"]
    accepted = [e for e in events if e["kind"] == "accepted"]
    discarded = [e for e in events if e["kind"] == "discarded"]
    first_pass = sum(1 for e in accepted if e["rounds"] == 0)
    fixed = sum(1 for e in accepted if e["rounds"] > 0)

    lines = [f"# ピリオド {period_id} の100問（本番生成の記録）", "",
             f"- 生成: `{log['generator']}` / 検証1: `{log['verifier1']}` / 検証2: `{log['verifier2']}` / 確定位置: `{log['decision_point_model']}`",
             f"- 開始 {log['started_at']} → 終了 {log.get('finished_at')}",
             f"- 出力: `{q_path.relative_to(WORKSPACE)}`, `{p_path.relative_to(WORKSPACE)}`", "",
             "## 集計", "",
             f"| 項目 | 数 |", "| :-- | --: |",
             f"| 採用 | {len(questions)}/{target_total} |",
             f"| うち一発合格 | {first_pass} |",
             f"| うち修正して合格 | {fixed} |",
             f"| 不採用（修正しても不合格） | {len(discarded)} |", ""]

    lines += ["## 難易度と分野", ""]
    diff = Counter(q["difficulty"] for q in questions)
    lines.append("| 難易度 | 採用 / 目標 |")
    lines.append("| :-- | --: |")
    for d, n in allocation.items():
        lines.append(f"| {DIFF_LABEL[d]} | {diff.get(d, 0)} / {n} |")
    cat = Counter(q["category"] for q in questions)
    lines += ["", "分野: " + ", ".join(f"{k} {v}" for k, v in cat.most_common()), ""]
    ans = Counter(q["answerIndex"] for q in questions)
    lines += ["正解の位置（0〜3）: " + ", ".join(f"{k}: {ans.get(k, 0)}" for k in range(4)), ""]

    lines += ["## 確定位置の分布（設計書 §8：言語ごとに偏りを見る）", ""]
    for loc in ("ja", "en"):
        pts = [q["locales"][loc]["decisionPoint"] for q in questions]
        lens = [len(q["locales"][loc]["text"]) for q in questions]
        ratio = [p / l for p, l in zip(pts, lens)]
        early = sum(1 for p in pts if p <= 2)
        full = sum(1 for p, l in zip(pts, lens) if p >= l)
        buckets = Counter("〜25%" if r <= 0.25 else "〜50%" if r <= 0.5 else "〜75%" if r <= 0.75 else "〜100%" for r in ratio)
        lines.append(f"- {loc}: 2文字以内で確定 {early} 問、最後まで読む {full} 問、位置の割合 "
                     + ", ".join(f"{k} {buckets.get(k, 0)}" for k in ("〜25%", "〜50%", "〜75%", "〜100%")))
    lines += ["", "- 2文字以内で確定する問題が多すぎる場合は、選択肢の作りが雑という信号（設計書 §8）", ""]

    lines += ["## 不合格理由の内訳（検証で立った不合格フラグの数。修正前の分も含む）", ""]
    flags = Counter()
    for e in accepted + discarded:
        for h in e["history"]:
            for r in h.get("reasons", []):
                m = re.match(r"\[(verifier\d|形式)\] ([a-z_]+)?", r)
                if m:
                    flags[(m.group(1), m.group(2) or "形式")] += 1
    for (who, key), n in sorted(flags.items(), key=lambda kv: -kv[1]):
        lines.append(f"- {who} {key}: {n}")

    lines += ["", "## 不採用になった問題", ""]
    for e in discarded:
        h0 = e["history"][0]["question"]
        last = e["history"][-1]
        lines.append(f"- [{DIFF_LABEL[e['difficulty']]}] {h0['ja']['text']} → {h0['ja']['choices'][h0['answerIndex']]}")
        for r in last.get("reasons", [])[:3]:
            lines.append(f"  - {r[:110]}")

    lines += ["", "## 費用", "", "| モデル | 呼び出し | トークン in/out | 概算 |", "| :-- | --: | :-- | --: |"]
    for row in log["cost"]:
        usd = f"${row['usd']}" if row["usd"] is not None else "単価未確認"
        lines.append(f"| `{row['model']}` | {row['calls']} | {row['in']}/{row['out']} | {usd} |")
    lines += ["", "- 全データ: `log.json`（検証の判定と修正の履歴）、`accepted.json`", ""]
    (out_dir / "report.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
