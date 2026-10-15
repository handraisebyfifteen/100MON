import { CHOICE_COUNT, mulberry32 } from '@core';
import type { Locale, QuestionView, RunEngine } from '@core';

/** 自動再生の操作役。毎フレーム呼ぶと、決めておいた時刻に選択と確定を行う */
export type DemoBot = (engine: RunEngine, view: QuestionView, now: number) => void;

interface Plan {
  index: number;
  choice: number;
  /** 出題からの経過時間。時間切れを見せる問題では null */
  selectAfterMs: number | null;
  confirmAfterMs: number | null;
}

/**
 * 自動再生モード（?demo=1）の操作役を作る。
 *
 * TV で見え方を確かめるためのものなので、画面に出る状態がひととおり現れるようにする。
 *   - 問題文の途中で答える（早押し）
 *   - 出揃ってから枠が減るのを待って答える
 *   - 何もせず時間切れになる
 */
export function createDemoBot(seed: number): DemoBot {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let plan: Plan | null = null;

  const makePlan = (view: QuestionView, locale: Locale): Plan => {
    const windowMs = view.deadlineAt - view.countdownStartsAt;
    const answer = view.question.answerIndex;
    const choice = rng() < 0.8 ? answer : (answer + 1 + Math.floor(rng() * (CHOICE_COUNT - 1))) % CHOICE_COUNT;
    const kind = rng();

    if (kind < 0.15) {
      return { index: view.index, choice, selectAfterMs: null, confirmAfterMs: null };
    }

    let selectAfterMs: number;
    if (kind < 0.55) {
      // 確定位置の文字が出た少しあとに押す
      const msPerChar = view.chars.length > 0 ? view.typingMs / view.chars.length : 0;
      selectAfterMs = view.question.locales[locale].decisionPoint * msPerChar + 150 + rng() * 300;
    } else {
      selectAfterMs = view.typingMs + windowMs * (0.25 + rng() * 0.6);
    }
    let confirmAfterMs = selectAfterMs + 350 + rng() * 250;

    // 締切に間に合わせる
    const limit = view.typingMs + windowMs - 100;
    if (confirmAfterMs > limit) {
      confirmAfterMs = limit;
      selectAfterMs = Math.min(selectAfterMs, Math.max(0, limit - 400));
    }
    return { index: view.index, choice, selectAfterMs, confirmAfterMs };
  };

  return (engine, view, now) => {
    if (plan === null || plan.index !== view.index) {
      plan = makePlan(view, engine.locale);
    }
    if (plan.selectAfterMs === null || plan.confirmAfterMs === null) return;

    const elapsed = now - view.startedAt;
    if (elapsed >= plan.selectAfterMs && view.selected !== plan.choice) {
      engine.select(plan.choice, now);
    }
    if (elapsed >= plan.confirmAfterMs) {
      engine.confirm(now);
    }
  };
}
