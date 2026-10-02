#!/usr/bin/env python3
"""手順3: 生成役モデルの比較テスト。

Amazon Nova と Claude Sonnet に、通常週の配分を20問に縮めたセット
（最初級4・初級6・中級5・上級5）を日英同時で生成させ、
手順2で決めた検証1・検証2に通して一発合格率などを比べる。

実行: python3 pipeline/test_generators.py
出力: pipeline/reports/generators.md / pipeline/reports/generated_{候補名}.json

- 生成・検証とも Converse の toolConfig で JSONスキーマを強制（手順2と同方式）
- 検証の判定関数は test_verifiers.py のものをそのまま使う（条件を揃えるため）
- decisionPoint（確定位置）は後工程で実測するため、ここでは生成しない
"""

import json
import sys
import threading
import time
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
from test_verifiers import PRICING, build_tool as build_verifier_tool, judge_one

REPORTS = Path(__file__).resolve().parent / "reports"
FIXTURES = Path(__file__).resolve().parent / "tests" / "verifier_fixtures.json"

# 生成候補は config 側で定義する（5系開放後: sonnet-5-5 vs sonnet-5。
# Nova は4.6時代のテストで日本語出力が壊れ除外済み → reports/archive_claude46/）
GENERATORS = dict(config.GENERATOR_CANDIDATES)

# 通常週の配分（25/30/20/25）を20問に縮めたもの
DIFF_PLAN = [
    ("beginner0", "最初級", 4),
    ("beginner", "初級", 6),
    ("intermediate", "中級", 5),
    ("advanced", "上級", 5),
]

DIFF_GUIDE = {
    "beginner0": "最初級: 日本と世界の常識の中でも、ほぼ誰でも即答できる水準。",
    "beginner": "初級: 学校で習う基礎知識。少し考えれば大半の人が分かる。",
    "intermediate": "中級: 一般常識の範囲だが、即答できない人もそこそこいる。",
    "advanced": "上級: 物知りなら普通に知っている水準。マニアにしか分からない知識にはしない。",
}

# 付録Aの見本と評価（難しさの目安としてプロンプトに入れる）。
# 見本の問題そのものは出力に使わせない。
CALIBRATION = """\
難しさの目安（設計書の付録Aより）:
- 上級は「物知りなら普通に知っている」水準。今回のセットで一番難しいのがこの上級。
- 参考として、今回は作らない最高難度「ヘルモード」の見本を示す。上級はこれより明確に易しくすること。
  - 安定した同位体を持つ元素のうち、原子番号が一番大きいもの → 鉛
  - 『日本書紀』が完成した年 → 720年
  - 6の次に小さい完全数 → 28
  - ヒトの染色体で一番大きいもの → 1番染色体
- ヘルモードは「正解を見れば納得できるが、その場では出てこない」水準。上級はそこまで行かず、
  博識な人なら普通に答えられる範囲に収める。
- 注意: 上の見本の問題そのもの、およびその言い換えを出力に含めてはいけない。"""


def build_generation_tool(n):
    loc = {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
            "choices": {"type": "array", "items": {"type": "string"},
                        "minItems": 4, "maxItems": 4},
        },
        "required": ["text", "choices"],
    }
    return {
        "toolSpec": {
            "name": "submit_questions",
            "description": f"作成した4択クイズ問題 {n}問を提出する",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "minItems": n, "maxItems": n,
                        "items": {
                            "type": "object",
                            "properties": {
                                "category": {"type": "string",
                                             "description": "分野（地理・歴史・科学・文化・スポーツ・ことば など）"},
                                "answerIndex": {"type": "integer", "minimum": 0, "maximum": 3,
                                                "description": "正解の位置（0始まり、日英共通）"},
                                "ja": loc,
                                "en": loc,
                            },
                            "required": ["category", "answerIndex", "ja", "en"],
                        },
                    },
                },
                "required": ["questions"],
            }},
        }
    }


def build_generation_prompt(difficulty, n, feedback=None):
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
        "- 時期によって答えが変わる題材（現職の人物、最新の記録、現在の統計順位など）は使わない",
        "- 引っかけ・言葉遊び・紛らわしい書き方で難しくしない。難しさは知識そのものから来るようにする",
        "- 複数の解釈ができる書き方をしない（「大きい」なら何の大きさかが自明であること）",
        "- 特定の国・地域・人を不当に扱う内容にしない",
        "- 実在のテレビ番組や存命の著名人を題材にしない",
        "- 正解以外の3つの選択肢は、確実に不正解だが同じ種類のもので揃える（例: すべて山の名前）",
        "",
        "## 書き方",
        "- 日本語の問題文は10〜25文字の目安で、短く素直に（体言止め中心、句点なし。例の形式:「日本で一番高い山」）",
        "- 英語版は日本語版と意味と正解が完全に一致するように作る（直訳でなく自然な英語で）",
        "- 選択肢は単語か短い語句。日英で answerIndex（正解の位置、0始まり）は共通",
        f"- {n}問の分野は偏らないように散らす。同じ題材を2回使わない",
        "",
        "必ず submit_questions ツールを1回だけ呼んで提出する。ツール呼び出し以外の出力はしない。",
    ]
    if feedback:
        lines += ["", "## 前回の提出の問題点（直して作り直すこと）", feedback]
    return "\n".join(lines)


def validate_questions(payload):
    """有効な問題のリストと、不備の説明を返す。"""
    qs = payload.get("questions")
    if not isinstance(qs, list):
        return [], ["questions 配列がない"]
    problems = []
    cleaned = []
    for i, q in enumerate(qs):
        try:
            ai = int(q["answerIndex"])
            assert 0 <= ai <= 3, "answerIndex が 0〜3 でない"
            q["answerIndex"] = ai
            for loc in ("ja", "en"):
                t = str(q[loc]["text"]).strip()
                ch = [str(c).strip() for c in q[loc]["choices"]]
                assert t, f"{loc} の問題文が空"
                assert len(ch) == 4 and all(ch), f"{loc} の選択肢が4つ揃っていない"
                assert len(set(ch)) == 4, f"{loc} の選択肢に重複がある"
                q[loc]["text"] = t
                q[loc]["choices"] = ch
            cleaned.append(q)
        except (KeyError, TypeError, ValueError, AssertionError) as e:
            problems.append(f"{i + 1}問目: {e}")
    return cleaned, problems


def generate_batch(runtime, model_id, difficulty, n):
    """1難易度ぶんを生成する。

    モデルが要求数より少なく返したり形式不備を混ぜたりした場合は、
    受け取れた分を確保したうえで不足分だけを追加要求する（最大5回）。
    実運用の「不足したら作り足す」挙動に合わせたもの。
    """
    collected = []
    seen_ja = set()
    attempts = []
    feedback = None
    for _ in range(5):
        want = n - len(collected)
        if want <= 0:
            break
        tool = build_generation_tool(want)
        prompt = build_generation_prompt(difficulty, want, feedback)
        t0 = time.monotonic()
        try:
            resp = runtime.converse(
                modelId=model_id,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                inferenceConfig={"maxTokens": 4000},
                toolConfig={"tools": [tool],
                            "toolChoice": {"tool": {"name": "submit_questions"}}},
            )
        except (ClientError, BotoCoreError) as e:
            attempts.append({"error": str(e), "latency_s": round(time.monotonic() - t0, 2)})
            time.sleep(3)
            continue
        latency = round(time.monotonic() - t0, 2)
        usage = resp.get("usage", {})
        payload = None
        for b in resp["output"]["message"].get("content", []):
            tu = b.get("toolUse")
            if tu and tu.get("name") == "submit_questions":
                payload = tu["input"]
        if payload is None:
            attempts.append({"error": "ツール呼び出しが返らなかった", "latency_s": latency,
                             "input_tokens": usage.get("inputTokens"),
                             "output_tokens": usage.get("outputTokens")})
            feedback = "submit_questions ツールを必ず呼ぶこと。"
            continue
        valid, problems = validate_questions(payload)
        accepted = 0
        for q in valid:
            key = q["ja"]["text"]
            if key in seen_ja:
                continue
            seen_ja.add(key)
            collected.append(q)
            accepted += 1
            if len(collected) >= n:
                break
        attempts.append({
            "latency_s": latency,
            "input_tokens": usage.get("inputTokens"),
            "output_tokens": usage.get("outputTokens"),
            "returned": len(valid) + len(problems),
            "accepted": accepted,
            "error": (" / ".join(problems[:3]) or None),
        })
        if len(collected) < n:
            used = "、".join(sorted(seen_ja)[:15])
            feedback = (f"有効な問題を {len(collected)}/{n} 問しか受け取れていない。"
                        f"今回は不足分の {n - len(collected)} 問だけを提出すること。"
                        + (f" 既に受け取った題材（{used}）と重複しないこと。" if used else ""))
    return collected, attempts


def run_generator(name, model_id):
    cfg = Config(region_name=config.REGION, connect_timeout=10, read_timeout=300,
                 retries={"max_attempts": 3, "mode": "adaptive"})
    runtime = boto3.client("bedrock-runtime", config=cfg)
    questions = []
    gen_log = []
    for difficulty, label, n in DIFF_PLAN:
        print(f"[{name}] 生成 {label} {n}問 ...", flush=True)
        qs, attempts = generate_batch(runtime, model_id, difficulty, n)
        gen_log.append({"difficulty": difficulty, "n": n, "attempts": attempts, "got": len(qs)})
        if len(qs) < n:
            print(f"[{name}] {label}: 追加要求しても {len(qs)}/{n} 問しか確保できず", flush=True)
        for i, q in enumerate(qs):
            questions.append({
                "id": f"{name}_{difficulty}_{i + 1:02d}",
                "difficulty": difficulty,
                "category": q.get("category", ""),
                "answerIndex": int(q["answerIndex"]),
                "ja": q["ja"], "en": q["en"],
            })
    return questions, gen_log


def verify_all(questions, checks):
    """全生成問題を検証1・検証2に通す。判定は手順2と同じ judge_one を使う。

    Opus はモデル単位のスロットリングに当たりやすいため、
    検証モデルごとに直列で回し、2モデルだけを並行させる（手順2と同じ形）。
    """
    verifiers = {"verifier1": config.VERIFIER_1, "verifier2": config.VERIFIER_2}
    tool = build_verifier_tool(checks)
    cfg = Config(region_name=config.REGION, connect_timeout=10, read_timeout=180,
                 retries={"max_attempts": 3, "mode": "adaptive"})

    def run_verifier(vname, vmodel):
        runtime = boto3.client("bedrock-runtime", config=cfg)
        out = {}
        for i, q in enumerate(questions):
            rec = None
            for attempt in range(4):
                try:
                    rec = judge_one(runtime, vmodel, q, "tool_forced", tool, checks)
                    break
                except (ClientError, BotoCoreError, ValueError, KeyError) as e:
                    code = (e.response.get("Error", {}).get("Code", "")
                            if isinstance(e, ClientError) else type(e).__name__)
                    rec = {"error": f"{code}: {e}"}
                    time.sleep(6 * (attempt + 1) if code == "ThrottlingException"
                               else 2 * (attempt + 1))
            out[(vname, q["id"])] = rec
            if (i + 1) % 10 == 0 or i + 1 == len(questions):
                print(f"  [{vname}] 検証 {i + 1}/{len(questions)}", flush=True)
        return out

    results = {}
    with ThreadPoolExecutor(max_workers=len(verifiers)) as ex:
        for f in [ex.submit(run_verifier, vn, vm) for vn, vm in verifiers.items()]:
            results.update(f.result())
    return results


def cost_of(model_id, tok_in, tok_out):
    price = PRICING.get(model_id)
    if not price:
        return None
    return round(tok_in / 1e6 * price[0] + tok_out / 1e6 * price[1], 4)


def main():
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    checks = fixtures["checks"]
    verifier2 = getattr(config, "VERIFIER_2", None)
    if not verifier2:
        sys.exit("config.VERIFIER_2 が未設定。手順2の結果から設定すること。")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print(f"region={config.REGION} generators={list(GENERATORS)} "
          f"verifier1={config.VERIFIER_1} verifier2={verifier2}")

    REPORTS.mkdir(parents=True, exist_ok=True)
    all_data = {}
    for name, model_id in GENERATORS.items():
        questions, gen_log = run_generator(name, model_id)
        print(f"[{name}] 生成完了: {len(questions)}問。検証にかける...", flush=True)
        vres = verify_all(questions, checks)
        for q in questions:
            q["verification"] = {
                vn: vres.get((vn, q["id"])) for vn in ("verifier1", "verifier2")
            }
        all_data[name] = {"model_id": model_id, "questions": questions, "gen_log": gen_log}
        out = REPORTS / f"generated_{name}.json"
        out.write_text(json.dumps({
            "generated_at": now, "generator": model_id,
            "verifier1": config.VERIFIER_1, "verifier2": verifier2,
            "questions": questions, "gen_log": gen_log,
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"[{name}] wrote {out}", flush=True)

    write_report(now, checks, all_data, verifier2)
    print(f"\nwrote {REPORTS / 'generators.md'}")


def write_report(now, checks, all_data, verifier2):
    lines = [
        "# 生成モデルの比較（手順3）", "",
        f"- 実行日時: {now}",
        f"- リージョン: {config.REGION}",
        "- 各生成役に20問（最初級4・初級6・中級5・上級5）を日英同時で生成させ、"
        "検証1・検証2に通した（修正なしの一発判定）",
        f"- 検証1: `{config.VERIFIER_1}` / 検証2: `{verifier2}`",
        "- decisionPoint（確定位置）は後工程で実測するため生成対象外",
        "",
    ]

    lines += ["## 集計", ""]
    lines.append("| 生成役 | 生成できた数 | 追加要求回数 | 一発合格（両検証◯） | 検証1のみ不合格 | 検証2のみ不合格 | 両方不合格 | 検証エラー | 検証の食い違い | 生成時間 | 生成トークン in/out | 生成費用 |")
    lines.append("| :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: | :-- | :-- |")
    for name, d in all_data.items():
        qs = d["questions"]
        n = len(qs)

        def verdict(q, vn):
            v = q["verification"].get(vn) or {}
            return v.get("verdict")

        both = sum(1 for q in qs if verdict(q, "verifier1") is True and verdict(q, "verifier2") is True)
        v1_only_ng = sum(1 for q in qs if verdict(q, "verifier1") is False and verdict(q, "verifier2") is True)
        v2_only_ng = sum(1 for q in qs if verdict(q, "verifier1") is True and verdict(q, "verifier2") is False)
        both_ng = sum(1 for q in qs if verdict(q, "verifier1") is False and verdict(q, "verifier2") is False)
        verr = sum(1 for q in qs if verdict(q, "verifier1") is None or verdict(q, "verifier2") is None)
        disagree = v1_only_ng + v2_only_ng
        tok_in = sum(a.get("input_tokens") or 0 for g in d["gen_log"] for a in g["attempts"])
        tok_out = sum(a.get("output_tokens") or 0 for g in d["gen_log"] for a in g["attempts"])
        gtime = round(sum(a.get("latency_s") or 0 for g in d["gen_log"] for a in g["attempts"]), 1)
        cost = cost_of(d["model_id"], tok_in, tok_out)
        cost_s = f"${cost}" if cost is not None else "単価未確認"
        rate = f"{both}/{n} ({both * 100 // n if n else 0}%)"
        extra_calls = sum(len(g["attempts"]) for g in d["gen_log"]) - len(d["gen_log"])
        lines.append(f"| {name} | {n}/20 | {extra_calls} | {rate} | {v1_only_ng} | {v2_only_ng} | {both_ng} "
                     f"| {verr} | {disagree} | {gtime}s | {tok_in}/{tok_out} | {cost_s} |")
    lines += ["", "- 「検証の食い違い」= 片方だけが不合格にした問題数（設計では修正または人の確認に回す）", ""]

    lines += ["## 難易度ごとの一発合格率（両検証◯）", ""]
    diff_labels = dict((d, l) for d, l, _ in DIFF_PLAN)
    header = "| 生成役 | " + " | ".join(l for _, l, _ in DIFF_PLAN) + " |"
    lines.append(header)
    lines.append("| :-- | " + " | ".join("--:" for _ in DIFF_PLAN) + " |")
    for name, d in all_data.items():
        row = [name]
        for diff, _, _ in DIFF_PLAN:
            qs = [q for q in d["questions"] if q["difficulty"] == diff]
            both = sum(1 for q in qs
                       if (q["verification"].get("verifier1") or {}).get("verdict") is True
                       and (q["verification"].get("verifier2") or {}).get("verdict") is True)
            row.append(f"{both}/{len(qs)}" if qs else "—")
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    lines += ["## 不合格理由の内訳（検査項目ごとの不合格フラグ数）", ""]
    header = "| 検査項目 | " + " | ".join(
        f"{name} (検証1 / 検証2)" for name in all_data) + " |"
    lines.append(header)
    lines.append("| :-- | " + " | ".join(":--:" for _ in all_data) + " |")
    for key in checks:
        row = [key]
        for name, d in all_data.items():
            c1 = c2 = 0
            for q in d["questions"]:
                for vn, ctr in (("verifier1", 1), ("verifier2", 2)):
                    v = q["verification"].get(vn) or {}
                    ch = v.get("checks") or {}
                    if ch.get(key, {}).get("pass") is False:
                        if ctr == 1:
                            c1 += 1
                        else:
                            c2 += 1
            row.append(f"{c1} / {c2}")
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    lines += ["## 検証にかかった時間とトークン（参考）", ""]
    lines.append("| 生成役 | 検証 | 合計時間(直列換算) | トークン in/out | 費用 |")
    lines.append("| :-- | :-- | --: | :-- | :-- |")
    vmodels = {"verifier1": config.VERIFIER_1, "verifier2": verifier2}
    for name, d in all_data.items():
        for vn, vm in vmodels.items():
            recs = [(q["verification"].get(vn) or {}) for q in d["questions"]]
            t = round(sum(r.get("latency_s") or 0 for r in recs), 1)
            ti = sum(r.get("input_tokens") or 0 for r in recs)
            to = sum(r.get("output_tokens") or 0 for r in recs)
            c = cost_of(vm, ti, to)
            cs = f"${c}" if c is not None else "単価未確認"
            lines.append(f"| {name} | {vn} `{vm}` | {t}s | {ti}/{to} | {cs} |")
    lines += [
        "",
        "- 単価はコード内の概算表（2026-09時点・要確認）",
        "- 生成された問題と判定の全データ: `generated_{生成役}.json`",
        "",
    ]
    (REPORTS / "generators.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
