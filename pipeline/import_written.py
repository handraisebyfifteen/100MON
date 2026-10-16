#!/usr/bin/env python3
"""人（または Claude Code の Claude）が書いた問題を、生成役の問題と同じ検証に通して data/ に書き出す。

    python3 pipeline/import_written.py --set-id exhibition-2026-10-hell
    python3 pipeline/import_written.py --set-id exhibition-2026-10-hell --check-only   # モデルを呼ばず形式チェックだけ

使いどころ: 激ムズ（ヘルモード）の問題。Bedrock の生成役は激ムズに向かないので、最初の激ムズウィーク
（第12・第24ピリオド）とエキシビジョンの激ムズは Claude が書く（設計書 §6、.claude/skills/hyakumon-quiz）。

入力: pipeline/written/<set-id>.json
  [{"category", "difficulty", "answerIndex", "ja": {"text", "choices"}, "en": {"text", "choices"}}, ...]

流れ: 形式チェック（過去の data/ と、この入力の中での重複も見る）→ 検証1・検証2
      （激ムズは設計書のとおりチェック項目を1つ足す）→ 合格した問題だけ確定位置を測る
      → data/questions.<set-id>.json と reports/<set-id>/written.md（不合格の理由）を書く
- ID は入力の並び順で決まる（<set-id>_q001 から）。不合格の問題を直して流し直しても、ほかの ID は変わらない
- 一度両方に通った内容は reports/<set-id>/written_passed.json に残し、流し直したときは検証も確定位置も測り直さない
- ピリオドのファイルは書かない。激ムズウィークに使うときは、period.<id>.json を別に書く
"""

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_period import (DATA_DIR, FIXTURES, REPORTS, VERIFY_WORKERS, WORKSPACE, CostMeter, build_dp_tool,
                             build_verifier_tool, load_used_from_data, local_check, make_runtime,
                             measure_decision_point, text_keys, verify)

WRITTEN = Path(__file__).resolve().parent / "written"

# 設計書 §6「激ムズウィークの検証には、次のチェック項目を追加する」。
# 1つ目（引っかけ・言葉遊びでないか）は通常の検証にもう入っている（not_trick）ので、2つ目だけ足す
HELL_EXTRA_CHECKS = {
    "verifiable": "上級の知識として、信頼できる資料で正解を確かめられる事実か（諸説ある話・出典のはっきりしない話でないか）",
}


def content_key(q):
    return json.dumps({k: q[k] for k in ("category", "difficulty", "answerIndex", "ja", "en")},
                      ensure_ascii=False, sort_keys=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set-id", required=True)
    ap.add_argument("--check-only", action="store_true", help="モデルを呼ばず、形式チェックだけ")
    args = ap.parse_args()

    set_id = args.set_id
    written = json.loads((WRITTEN / f"{set_id}.json").read_text(encoding="utf-8"))
    out_dir = REPORTS / set_id
    out_dir.mkdir(parents=True, exist_ok=True)
    q_path = DATA_DIR / f"questions.{set_id}.json"

    # ---- 形式チェック（入力の並び順に、前の問題も使用済みとして見る）----
    answers, texts, _ = load_used_from_data(set_id)
    problems = {}
    for i, q in enumerate(written):
        found = local_check(q, answers, texts)
        if found:
            problems[i] = [f"[形式] {p}" for p in found]
        answers.add(q["ja"]["choices"][q["answerIndex"]])
        texts |= text_keys(q)
    print(f"形式チェック: {len(written)} 問中 {len(written) - len(problems)} 問が合格")
    if args.check_only:
        for i, reasons in problems.items():
            print(f"  不合格 {i + 1:03d} {written[i]['ja']['text']}")
            for r in reasons:
                print(f"    - {r}")
        sys.exit(1 if problems else 0)

    checks = json.loads(FIXTURES.read_text(encoding="utf-8"))["checks"]
    hell_checks = {**checks, **HELL_EXTRA_CHECKS}
    tools = {"normal": build_verifier_tool(checks), "hell": build_verifier_tool(hell_checks)}
    meter = CostMeter()
    verifier_pool = {"verifier1": make_runtime(180), "verifier2": make_runtime(180)}
    dp_runtime = make_runtime(60)
    dp_tool = build_dp_tool()

    passed_path = out_dir / "written_passed.json"
    passed = json.loads(passed_path.read_text(encoding="utf-8")) if passed_path.exists() else {}

    # ---- 検証（形式チェックに通ったもので、前回までに通っていないものだけ）----
    todo = [i for i in range(len(written)) if i not in problems and content_key(written[i]) not in passed]
    print(f"検証 {len(todo)} 問（{len(written) - len(problems) - len(todo)} 問は前回までに合格）...", flush=True)

    def check_one(i):
        q = written[i]
        hell = q["difficulty"] == "hell"
        return verify(verifier_pool, meter, tools["hell" if hell else "normal"], hell_checks if hell else checks, q)

    with ThreadPoolExecutor(max_workers=VERIFY_WORKERS) as ex:
        results = list(ex.map(check_one, todo))
    fresh_ok = []
    for i, (ok, res, reasons) in zip(todo, results):
        if ok:
            fresh_ok.append(i)
            passed[content_key(written[i])] = {"verification": res}
        else:
            problems[i] = reasons

    # ---- 確定位置（新しく通った問題だけ測り、合格の記録に入れておく）----
    print(f"確定位置を測る（{len(fresh_ok)}問 × 2言語）...", flush=True)

    def measure(i):
        q = written[i]
        return {loc: measure_decision_point(dp_runtime, meter, dp_tool, q[loc]["text"], q[loc]["choices"],
                                            q["answerIndex"], loc) for loc in ("ja", "en")}

    with ThreadPoolExecutor(max_workers=VERIFY_WORKERS) as ex:
        dps = list(ex.map(measure, fresh_ok))
    for i, dp in zip(fresh_ok, dps):
        passed[content_key(written[i])]["decisionPoint"] = dp
    passed_path.write_text(json.dumps(passed, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- 書き出し（合格した問題だけ。ID は入力の並び順）----
    out = []
    for i, q in enumerate(written):
        rec = passed.get(content_key(q))
        if i in problems or rec is None:
            continue
        out.append({
            "id": f"{set_id}_q{i + 1:03d}",
            "answerIndex": q["answerIndex"],
            "category": q["category"].strip().lower(),
            "difficulty": q["difficulty"],
            "locales": {loc: {"text": q[loc]["text"], "choices": q[loc]["choices"],
                              "decisionPoint": rec["decisionPoint"][loc]} for loc in ("ja", "en")},
        })
    q_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [f"# {set_id}（書いた問題の検証）", "",
             f"- 入力: `pipeline/written/{set_id}.json`（{len(written)} 問）",
             f"- 合格: {len(out)} 問 → `{q_path.relative_to(WORKSPACE)}`",
             f"- 実行: {datetime.now(timezone.utc).isoformat(timespec='seconds')}", ""]
    if problems:
        lines += ["## 不合格（直して流し直す）", ""]
        for i in sorted(problems):
            q = written[i]
            lines.append(f"- {i + 1:03d} **{q['ja']['text']}** → {q['ja']['choices'][q['answerIndex']]}"
                         f"　/ {q['en']['text']} → {q['en']['choices'][q['answerIndex']]}")
            lines += [f"  - {r[:300]}" for r in problems[i]]
        lines.append("")
    lines += ["## 費用", "", "| モデル | 呼び出し | トークン in/out | 概算 |", "| :-- | --: | :-- | --: |"]
    for model_id, calls, ti, to, cost in meter.rows():
        lines.append(f"| `{model_id}` | {calls} | {ti}/{to} | {'$' + str(cost) if cost is not None else '単価未確認'} |")
    (out_dir / "written.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"合格 {len(out)} / {len(written)} 問 → {q_path.relative_to(WORKSPACE)}")
    print(f"不合格の理由: {(out_dir / 'written.md').relative_to(WORKSPACE)}")
    for model_id, calls, ti, to, cost in meter.rows():
        print(f"  {model_id}: {calls}回 in {ti} / out {to} 概算 ${cost}")


if __name__ == "__main__":
    main()
