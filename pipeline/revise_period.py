#!/usr/bin/env python3
"""人の確認で見つかった問題を直す（100問を作ったあと、サーバーに入れる前）。

    python3 pipeline/revise_period.py --period-id 2026-P01
    python3 pipeline/revise_period.py --period-id 2026-P01 --check-only   # モデルを呼ばず形式チェックだけ

入力: pipeline/revisions/<period-id>.json
  {"id", "note"（直す理由）, "was"（いまの日本語の問題文）, "ja"/"en"（変える項目だけ）}  … 書き換え
  {"id", "note", "was", "replace": true}                                             … 同じ難易度・分野で生成役が差し替え
  {"id", "note", "was", "replace": true, "answerIndex", "category", "ja", "en"}       … 人が書いた問題に差し替え（検証だけ）
  "was" がいまの問題文と違えば、書き換えは済んでいるとみなして飛ばす（何度流しても同じ結果になる）

流れ: 書き換え → 形式チェック・検証1・検証2。1問でも不合格なら何も書き出さず、理由を出して止まる
      （両方に通った内容は reports/<id>/revision_passed.json に残し、流し直したときは検証を省く）
      差し替え → generate_period と同じ 生成 → 形式チェック → 検証 → 修正（最大3回）
      → 変えた問題の確定位置を測り直す
      → data/questions.<id>.json を書き換える（ID と並びはそのまま）
      → reports/<id>/revisions.md（直した記録）と questions.md（人の確認用）を書き直す
"""

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config
from generate_period import (DATA_DIR, DIFF_LABEL, FIXTURES, REPORTS, VERIFY_WORKERS, WORKSPACE, CostMeter,
                             build_dp_tool, build_fix_prompt, build_prompt, build_verifier_tool, call_generator,
                             load_used_from_data, local_check, make_runtime, measure_decision_point, text_keys,
                             verify)

REVISIONS = Path(__file__).resolve().parent / "revisions"
MAX_REPLACE_TRIES = 3  # 差し替えの生成をやり直す上限（1回ごとに修正ループが最大3回つく）


def to_work(q):
    """data/ の形 → パイプラインの中の形"""
    return {"category": q["category"], "answerIndex": q["answerIndex"], "difficulty": q["difficulty"],
            "ja": dict(q["locales"]["ja"]), "en": dict(q["locales"]["en"])}


def to_data(qid, w):
    return {
        "id": qid,
        "answerIndex": w["answerIndex"],
        "category": (w.get("category") or "general").strip().lower(),
        "difficulty": w["difficulty"],
        "locales": {loc: {"text": w[loc]["text"], "choices": w[loc]["choices"],
                          "decisionPoint": w[loc]["decisionPoint"]} for loc in ("ja", "en")},
    }


def summary(w):
    return f"{w['ja']['text']} → {w['ja']['choices'][w['answerIndex']]}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--period-id", required=True)
    ap.add_argument("--check-only", action="store_true", help="モデルを呼ばず、書き換えの形式チェックだけ")
    args = ap.parse_args()

    period_id = args.period_id
    q_path = DATA_DIR / f"questions.{period_id}.json"
    out_dir = REPORTS / period_id
    revisions = json.loads((REVISIONS / f"{period_id}.json").read_text(encoding="utf-8"))
    questions = json.loads(q_path.read_text(encoding="utf-8"))
    work = {q["id"]: to_work(q) for q in questions}
    before = {qid: json.loads(json.dumps(w)) for qid, w in work.items()}
    past_answers, past_texts, past_avoid = load_used_from_data(period_id)

    def used_except(skip):
        """skip 以外の問題（このピリオドのいまの状態＋過去ピリオド）の正解・問題文・題材"""
        answers, texts, avoid = set(past_answers), set(past_texts), list(past_avoid)
        for qid, w in work.items():
            if qid in skip:
                continue
            answers.add(w["ja"]["choices"][w["answerIndex"]])
            texts |= text_keys(w)
            avoid.append(summary(w))
        return answers, texts, avoid

    edits, replaces = [], []
    for rev in revisions:
        # 使い回した問題（ID が別のピリオドのもの）は、ここでは直さない。同じ ID で中身の違う問題ができてしまう。
        # 中身がおかしければ元のピリオドで直す。このピリオドから外したいときは generate_period.py で作り直す
        if not rev["id"].startswith(f"{period_id}_"):
            sys.exit(f"{rev['id']} は別のピリオドから使い回した問題なので、{period_id} では直さない（元のピリオドで直す）")
        w = work[rev["id"]]
        if w["ja"]["text"] != rev["was"]:
            print(f"飛ばす（済み）: {rev['id']} {w['ja']['text']}")
            continue
        # 中身の無い差し替えは生成役に作らせる。中身があれば（人が書いた差し替え）書き換えと同じく検証だけ
        if rev.get("replace") and "ja" not in rev:
            replaces.append(rev)
            continue
        for key in ("answerIndex", "category"):
            if key in rev:
                w[key] = rev[key]
        for loc in ("ja", "en"):
            w[loc].update(rev.get(loc, {}))
        edits.append(rev)
    replace_ids = {r["id"] for r in replaces}

    # ---- 書き換えの形式チェック（差し替える問題は相手にしない）----
    failed = {}
    for rev in edits:
        answers, texts, _ = used_except({rev["id"]} | replace_ids)
        problems = local_check(work[rev["id"]], answers, texts)
        if problems:
            failed[rev["id"]] = [f"[形式] {p}" for p in problems]
    if failed or args.check_only:
        for qid, reasons in failed.items():
            print(f"不合格: {qid} {work[qid]['ja']['text']}")
            for r in reasons:
                print(f"  - {r}")
        print(f"形式チェック: 書き換え {len(edits)} 問中 {len(edits) - len(failed)} 問が合格、差し替え {len(replaces)} 問")
        sys.exit(1 if failed else 0)

    checks = json.loads(FIXTURES.read_text(encoding="utf-8"))["checks"]
    verifier_tool = build_verifier_tool(checks)
    dp_tool = build_dp_tool()
    meter = CostMeter()
    gen_runtime = make_runtime()
    verifier_pool = {"verifier1": make_runtime(180), "verifier2": make_runtime(180)}
    dp_runtime = make_runtime(60)
    record = {"period_id": period_id, "started_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "edits": {}, "replaces": {}}

    # ---- 書き換えの検証 ----
    # 確定位置は古い値なので渡さない（日英で違うのを「食い違い」と判定されてしまう。測り直すのは後）
    def without_dp(w):
        return {**w, **{loc: {k: v for k, v in w[loc].items() if k != "decisionPoint"} for loc in ("ja", "en")}}

    # 一度両方に通った内容は、流し直しても検証し直さない（検証役の判定は毎回少しぶれるので、
    # 全部を検証し直すと毎回どこかの1問が落ちて先に進めない）
    passed_path = out_dir / "revision_passed.json"
    passed = json.loads(passed_path.read_text(encoding="utf-8")) if passed_path.exists() else {}

    def content_key(w):
        return json.dumps(without_dp(w), ensure_ascii=False, sort_keys=True)

    todo = [rev for rev in edits if content_key(work[rev["id"]]) not in passed]
    print(f"書き換え {len(edits)} 問のうち {len(todo)} 問を検証（{len(edits) - len(todo)} 問は前回までに合格）...", flush=True)
    with ThreadPoolExecutor(max_workers=VERIFY_WORKERS) as ex:
        results = list(ex.map(
            lambda rev: verify(verifier_pool, meter, verifier_tool, checks, without_dp(work[rev["id"]])), todo))
    fresh = {rev["id"]: r for rev, r in zip(todo, results)}
    for rev in edits:
        key = content_key(work[rev["id"]])
        ok, res, reasons = fresh.get(rev["id"]) or (True, passed[key], [])
        record["edits"][rev["id"]] = {"note": rev["note"], "ok": ok, "reasons": reasons, "verification": res}
        if ok:
            passed[key] = res
        else:
            failed[rev["id"]] = reasons
    passed_path.write_text(json.dumps(passed, ensure_ascii=False, indent=1), encoding="utf-8")
    if failed:
        for qid, reasons in failed.items():
            print(f"不合格: {qid} {work[qid]['ja']['text']}")
            for r in reasons:
                print(f"  - {r[:200]}")
        print("書き換えに不合格があるので、何も書き出さずに止める。revisions を直して流し直す")
        print_cost(meter)
        sys.exit(1)

    # ---- 差し替え（1問ずつ。採用したものは次の差し替えの使用済みに入る）----
    for rev in replaces:
        qid = rev["id"]
        difficulty = work[qid]["difficulty"]
        # 分野を指定しないと、差し替えが同じ分野に寄る（初回は4問とも science の光の話になった）
        category = work[qid]["category"]
        print(f"差し替え: {qid}（{DIFF_LABEL[difficulty]}・{category}）{rev['was']}", flush=True)
        answers, texts, avoid = used_except({qid} | {r["id"] for r in replaces if r["id"] not in record["replaces"]})
        avoid.append(f"{summary(work[qid])}（差し替える問題。これと同じ題材にしない）")
        new_q, history = None, []
        for _ in range(MAX_REPLACE_TRIES):
            batch, gen_problems = call_generator(gen_runtime, meter, build_prompt(difficulty, 1, avoid, category=category), 1)
            if not batch:
                history.append({"error": "生成の提出が無効: " + " / ".join(gen_problems)})
                continue
            q = {**batch[0], "difficulty": difficulty}
            for round_no in range(config.PROD_FIX_ROUNDS + 1):
                problems = local_check(q, answers, texts)
                if problems:
                    ok, res, reasons = False, {}, [f"[形式] {p}" for p in problems]
                else:
                    ok, res, reasons = verify(verifier_pool, meter, verifier_tool, checks, q)
                history.append({"round": round_no, "question": {k: q[k] for k in ("category", "answerIndex", "ja", "en")},
                                "ok": ok, "reasons": reasons, "verification": res})
                if ok:
                    new_q = q
                    break
                if round_no == config.PROD_FIX_ROUNDS:
                    break
                avoid.append(f"{summary(q)}（不採用）")
                fixed, gen_problems = call_generator(gen_runtime, meter, build_fix_prompt(q, reasons, avoid), 1)
                if not fixed:
                    history.append({"round": round_no + 1, "error": "修正の提出が無効: " + " / ".join(gen_problems)})
                    break
                q = {**fixed[0], "difficulty": difficulty}
            if new_q:
                break
        record["replaces"][qid] = {"note": rev["note"], "ok": new_q is not None, "history": history}
        if new_q is None:
            print(f"  採用できなかった（{MAX_REPLACE_TRIES}回）。この問題は元のまま", flush=True)
            continue
        work[qid] = new_q
        print(f"  採用: {summary(new_q)}", flush=True)

    # ---- 確定位置（変えた問題だけ、両言語とも測り直す）----
    changed = [rev["id"] for rev in edits] + [qid for qid, r in record["replaces"].items() if r["ok"]]
    print(f"確定位置を測る（{len(changed)}問 × 2言語）...", flush=True)

    def measure(qid):
        w = work[qid]
        for loc in ("ja", "en"):
            w[loc]["decisionPoint"] = measure_decision_point(
                dp_runtime, meter, dp_tool, w[loc]["text"], w[loc]["choices"], w["answerIndex"], loc)

    with ThreadPoolExecutor(max_workers=VERIFY_WORKERS) as ex:
        list(ex.map(measure, changed))

    # ---- 書き出し ----
    out = [to_data(q["id"], work[q["id"]]) for q in questions]
    q_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    record["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    record["cost"] = [{"model": m, "calls": c, "in": ti, "out": to, "usd": cost} for m, c, ti, to, cost in meter.rows()]
    (out_dir / "revisions.json").write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    write_revisions_md(out_dir, period_id, revisions, before, work, record)
    replaced = {qid for qid, r in record["replaces"].items() if r["ok"]}
    replaced |= {rev["id"] for rev in edits if rev.get("replace")}
    write_questions_md(out_dir, period_id, out, {r["id"] for r in revisions}, replaced)
    print_cost(meter)
    print(f"\n書き出し: {q_path.relative_to(WORKSPACE)}\n記録: {(out_dir / 'revisions.md').relative_to(WORKSPACE)}")


def print_cost(meter):
    for model_id, calls, ti, to, cost in meter.rows():
        print(f"  {model_id}: {calls}回 in {ti} / out {to} 概算 ${cost}")


def line_pair(w, mark="", tail=""):
    ja, en, a = w["ja"], w["en"], w["answerIndex"]
    return [
        f"- {mark}**{ja['text']}** → {ja['choices'][a]}　［{' / '.join(ja['choices'])}］ "
        f"確定 {ja['decisionPoint']}/{len(ja['text'])}{tail}",
        f"  - {en['text']} → {en['choices'][a]}　[{' / '.join(en['choices'])}] "
        f"確定 {en['decisionPoint']}/{len(en['text'])}",
    ]


def write_revisions_md(out_dir, period_id, revisions, before, work, record):
    lines = [f"# ピリオド {period_id} の人の確認による修正", "",
             f"- 入力: `pipeline/revisions/{period_id}.json`（直す理由と内容）",
             f"- 実行 {record['started_at']} → {record['finished_at']}", ""]
    for rev in revisions:
        qid = rev["id"]
        r = record["edits"].get(qid) or record["replaces"].get(qid)
        if r is None:
            continue
        kind = "差し替え" if rev.get("replace") else "書き換え"
        result = "" if r["ok"] else "（採用できず、元のまま）"
        lines += [f"## {qid}　{kind}{result}", "", f"理由: {rev['note']}", "", "前:"]
        lines += line_pair(before[qid])
        lines += ["", "後:"]
        lines += line_pair(work[qid])
        if rev.get("replace") and "ja" not in rev and r["ok"]:
            rounds = sum(1 for h in r["history"] if "round" in h and "question" in h)
            lines += ["", f"検証に通るまでの提出: {rounds} 回"]
        lines.append("")
    lines += ["## 費用", "", "| モデル | 呼び出し | トークン in/out | 概算 |", "| :-- | --: | :-- | --: |"]
    for row in record["cost"]:
        usd = f"${row['usd']}" if row["usd"] is not None else "単価未確認"
        lines.append(f"| `{row['model']}` | {row['calls']} | {row['in']}/{row['out']} | {usd} |")
    lines += ["", "- 全データ: `revisions.json`（検証の判定と差し替えの履歴）", ""]
    (out_dir / "revisions.md").write_text("\n".join(lines), encoding="utf-8")


def write_questions_md(out_dir, period_id, questions, revised_ids, replaced_ids):
    """人の確認用の一覧。★（生成時の検証で直したもの）は前の版から引き継ぎ、差し替えた問題からは外す"""
    md_path = out_dir / "questions.md"
    starred = set()
    if md_path.exists():
        for m in re.finditer(r"^- ★.*\((\S+?), ", md_path.read_text(encoding="utf-8"), re.M):
            starred.add(m.group(1))
    starred -= replaced_ids
    lines = [f"# ピリオド {period_id} の100問（人の確認用）", "",
             "凡例: ★＝検証で一度落ちて修正したもの（重点的に見る）。✎＝人の確認で直したもの（理由は revisions.md）。"
             "確定位置＝何文字目で答えが分かるか（文字数）", ""]
    for difficulty, label in DIFF_LABEL.items():
        group = sorted((q for q in questions if q["difficulty"] == difficulty), key=lambda q: q["id"])
        if not group:
            continue
        lines += [f"## {label}", ""]
        for q in group:
            mark = ("★" if q["id"] in starred else "") + ("✎" if q["id"] in revised_ids else "")
            w = {"answerIndex": q["answerIndex"], **q["locales"]}
            lines += line_pair(w, mark, f"  ({q['id']}, {q['category']})")
        lines.append("")
    md_path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
