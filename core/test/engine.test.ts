import { describe, expect, it } from 'vitest';
import { RunEngine } from '../src';
import type { Question } from '../src';
import { makeQuestion, SETTINGS } from './helpers';

/** 1問だけなら並べ替えの影響を受けない。10文字 → 表示に 1000ms、締切は 6000ms */
function single(answerIndex = 2): RunEngine {
  return new RunEngine({
    questions: [makeQuestion('q1', 10, answerIndex)],
    locale: 'ja',
    settings: SETTINGS,
    seed: 1,
    now: 0,
  });
}

function many(count: number, charCount = 10): Question[] {
  return Array.from({ length: count }, (_, i) => makeQuestion(`q${i + 1}`, charCount, i % 4));
}

describe('タイプライターと枠タイマー', () => {
  it('k 文字目は k × msPerChar の時点で出る', () => {
    const engine = single();
    expect(engine.tick(0)?.visibleChars).toBe(0);
    expect(engine.tick(99)?.visibleChars).toBe(0);
    expect(engine.tick(100)?.visibleChars).toBe(1);
    expect(engine.tick(950)?.visibleChars).toBe(9);
    expect(engine.tick(1000)?.visibleChars).toBe(10);
  });

  it('問題文の表示中は枠が減らず、出揃った瞬間から減り始める', () => {
    const engine = single();
    const typing = engine.tick(999);
    expect(typing?.phase).toBe('typing');
    expect(typing?.remainingMs).toBe(5000);

    const complete = engine.tick(1000);
    expect(complete?.phase).toBe('countdown');
    expect(complete?.remainingMs).toBe(5000);
    expect(complete?.countdownStartsAt).toBe(1000);
    expect(complete?.deadlineAt).toBe(6000);

    expect(engine.tick(3500)?.remainingMs).toBe(2500);
  });
});

describe('回答', () => {
  it('問題文の表示中でも回答できる', () => {
    const engine = single(2);
    expect(engine.select(2, 300)).toBe(true);
    expect(engine.confirm(450)).toBe(true);
    expect(engine.finished).toBe(true);

    const result = engine.result();
    expect(result.answers).toEqual([
      { questionId: 'q1', order: 1, chosenIndex: 2, correct: true, timedOut: false, elapsedMs: 450 },
    ]);
    expect(result.totalMs).toBe(450);
    expect(result.correctCount).toBe(1);
  });

  it('どれも選んでいない状態で確定しても何も起きない', () => {
    const engine = single();
    expect(engine.confirm(500)).toBe(false);
    expect(engine.finished).toBe(false);
    expect(engine.tick(500)?.index).toBe(0);
  });

  it('確定するまでは選び直せる', () => {
    const engine = single(2);
    engine.select(0, 300);
    engine.select(2, 400);
    expect(engine.tick(400)?.selected).toBe(2);
    engine.confirm(500);
    expect(engine.result().answers[0]?.correct).toBe(true);
  });

  it('誤答は不正解として記録し、時間切れとは区別する', () => {
    const engine = single(2);
    engine.select(1, 300);
    engine.confirm(400);
    const answer = engine.result().answers[0];
    expect(answer?.correct).toBe(false);
    expect(answer?.timedOut).toBe(false);
    expect(answer?.chosenIndex).toBe(1);
  });

  it('範囲外の選択肢は受け付けない', () => {
    const engine = single();
    expect(engine.select(4, 300)).toBe(false);
    expect(engine.select(-1, 300)).toBe(false);
    expect(engine.select(1.5, 300)).toBe(false);
    expect(engine.tick(300)?.selected).toBeNull();
  });
});

describe('時間切れ', () => {
  it('締切の直前までは回答でき、締切ちょうどで時間切れになる', () => {
    const justInTime = single(2);
    justInTime.select(2, 5000);
    expect(justInTime.confirm(5999)).toBe(true);
    expect(justInTime.result().answers[0]?.timedOut).toBe(false);

    const tooLate = single(2);
    tooLate.select(2, 5000);
    expect(tooLate.confirm(6000)).toBe(false);
    const answer = tooLate.result().answers[0];
    expect(answer).toEqual({
      questionId: 'q1',
      order: 1,
      chosenIndex: null,
      correct: false,
      timedOut: true,
      elapsedMs: 6000,
    });
  });

  it('選んだだけで確定しなければ時間切れ', () => {
    const engine = single(2);
    engine.select(2, 2000);
    expect(engine.tick(6000)).toBeNull();
    expect(engine.result().answers[0]?.timedOut).toBe(true);
    expect(engine.result().correctCount).toBe(0);
  });

  it('次の問題は締切の時刻から始まる（処理が遅れても持ち越さない）', () => {
    const engine = new RunEngine({ questions: many(3), locale: 'ja', settings: SETTINGS, seed: 7, now: 0 });
    // 6000ms の締切を、6480ms になってから処理する
    const view = engine.tick(6480);
    expect(view?.index).toBe(1);
    expect(view?.startedAt).toBe(6000);
    expect(view?.visibleChars).toBe(4);
  });

  it('長く止まっていた場合は、過ぎた締切をまとめて処理する', () => {
    const engine = new RunEngine({ questions: many(5), locale: 'ja', settings: SETTINGS, seed: 7, now: 0 });
    // 1問 6000ms。20000ms 経過 → 3問が時間切れ、4問目の途中
    const view = engine.tick(20_000);
    expect(view?.index).toBe(3);
    expect(view?.startedAt).toBe(18_000);
    expect(view?.lastAnswer?.timedOut).toBe(true);
  });

  it('全問放置すると、タイムは理論上の上限ちょうどになる', () => {
    const engine = new RunEngine({ questions: many(100), locale: 'ja', settings: SETTINGS, seed: 3, now: 1234 });
    expect(engine.tick(1234 + 100 * 6000)).toBeNull();
    const result = engine.result();
    expect(result.totalMs).toBe(600_000);
    expect(result.timedOutCount).toBe(100);
    expect(result.correctCount).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe('確定直後の入力', () => {
  it('確定の直後は、しばらく入力を受け付けない', () => {
    const engine = new RunEngine({ questions: many(3), locale: 'ja', settings: SETTINGS, seed: 7, now: 0 });
    engine.select(0, 500);
    engine.confirm(600);

    // 連打：ロック中（〜800ms）の選択と確定は捨てる
    expect(engine.select(1, 700)).toBe(false);
    expect(engine.confirm(750)).toBe(false);
    expect(engine.tick(750)?.inputLocked).toBe(true);
    expect(engine.tick(750)?.selected).toBeNull();

    expect(engine.tick(800)?.inputLocked).toBe(false);
    expect(engine.select(1, 800)).toBe(true);
    expect(engine.confirm(900)).toBe(true);
    expect(engine.tick(900)?.index).toBe(2);
  });

  it('時間切れの直後も同じように受け付けない', () => {
    const engine = new RunEngine({ questions: many(3), locale: 'ja', settings: SETTINGS, seed: 7, now: 0 });
    // 締切 6000ms の直後に、前の問題のつもりで押した入力
    expect(engine.select(1, 6100)).toBe(false);
    expect(engine.confirm(6150)).toBe(false);
    expect(engine.tick(6150)?.index).toBe(1);
    expect(engine.select(1, 6200)).toBe(true);
  });

  it('次の問題に、前の問題の選択を持ち越さない', () => {
    const engine = new RunEngine({ questions: many(3), locale: 'ja', settings: SETTINGS, seed: 7, now: 0 });
    engine.select(3, 500);
    engine.confirm(600);
    expect(engine.tick(1000)?.selected).toBeNull();
    expect(engine.confirm(1000)).toBe(false);
  });

  it('時刻が前後して届いても、時計は後戻りしない', () => {
    const engine = new RunEngine({ questions: many(3), locale: 'ja', settings: SETTINGS, seed: 7, now: 0 });
    engine.tick(6050); // 1問目は 6000ms で時間切れ
    // 締切より前の時刻の入力が、あとから届いた
    expect(engine.select(0, 5990)).toBe(false);
    expect(engine.tick(5990)?.index).toBe(1);
  });
});

describe('1走行', () => {
  it('100問を通しで走り、スコアを出す', () => {
    const questions = many(100);
    const engine = new RunEngine({ questions, locale: 'ja', settings: SETTINGS, seed: 42, now: 0 });
    let now = 0;
    let view = engine.tick(now);
    while (view) {
      // 偶数番目は正解、奇数番目は誤答を、出題から 1500ms で確定する
      const answer = view.index % 2 === 0 ? view.question.answerIndex : (view.question.answerIndex + 1) % 4;
      now += 1400;
      expect(engine.select(answer, now)).toBe(true);
      now += 100;
      expect(engine.confirm(now)).toBe(true);
      view = engine.tick(now);
    }

    const result = engine.result();
    expect(result.questionCount).toBe(100);
    expect(result.answers).toHaveLength(100);
    expect(result.totalMs).toBe(150_000);
    expect(result.correctCount).toBe(50);
    expect(result.timedOutCount).toBe(0);
    expect(result.accuracy).toBe(0.5);
    // 1問 6000ms のうち 1500ms で正解 → 0.5 + 0.5 × 0.75 = 0.875。それが半分の50問
    expect(result.score).toBeCloseTo(0.4375, 10);
    expect(result.answers.map((a) => a.order)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    // 100問すべてが1回ずつ出題される
    expect(new Set(result.answers.map((a) => a.questionId)).size).toBe(100);
  });

  it('連続正解の数を数え、不正解で 0 に戻す', () => {
    const engine = new RunEngine({ questions: many(10), locale: 'ja', settings: SETTINGS, seed: 1, now: 0 });
    let now = 0;
    const answer = (correct: boolean): number | undefined => {
      const view = engine.tick(now);
      if (!view) return undefined;
      now += 300;
      engine.select(correct ? view.question.answerIndex : (view.question.answerIndex + 1) % 4, now);
      engine.confirm(now);
      return engine.tick(now)?.streak;
    };
    expect(answer(true)).toBe(1);
    expect(answer(true)).toBe(2);
    expect(answer(true)).toBe(3);
    expect(answer(false)).toBe(0);
    expect(answer(true)).toBe(1);
    // 時間切れでも 0 に戻る
    expect(engine.tick(now + 6000)?.streak).toBe(0);
  });

  it('同じ種なら同じ出題順、種が違えば違う出題順になる', () => {
    const questions = many(100);
    const order = (seed: number): string[] => {
      const engine = new RunEngine({ questions, locale: 'ja', settings: SETTINGS, seed, now: 0 });
      engine.tick(100 * 6000);
      return engine.result().answers.map((a) => a.questionId);
    };
    expect(order(1)).toEqual(order(1));
    expect(order(1)).not.toEqual(order(2));
    expect(order(1)).not.toEqual(questions.map((q) => q.id));
  });

  it('言語ごとの問題文で進む', () => {
    const question = makeQuestion('q1', 10);
    const ja = new RunEngine({ questions: [question], locale: 'ja', settings: SETTINGS, seed: 1, now: 0 });
    const en = new RunEngine({ questions: [question], locale: 'en', settings: SETTINGS, seed: 1, now: 0 });
    expect(ja.tick(0)?.typingMs).toBe(1000);
    expect(en.tick(0)?.typingMs).toBe(2000);
  });

  it('開始時刻より前は始まらず、待った時間はタイムに含めない', () => {
    // 開始は 1200ms。それまでの間に画面を出し、入力もあったとする
    const engine = new RunEngine({
      questions: [makeQuestion('q1', 10, 2)],
      locale: 'ja',
      settings: SETTINGS,
      seed: 1,
      now: 1200,
    });
    const before = engine.tick(500);
    expect(before?.visibleChars).toBe(0);
    expect(before?.inputLocked).toBe(true);
    expect(before?.startedAt).toBe(1200);
    expect(engine.select(2, 600)).toBe(false);
    expect(engine.confirm(700)).toBe(false);

    // 開始後は 1200ms を起点に進む
    expect(engine.tick(1300)?.visibleChars).toBe(1);
    expect(engine.select(2, 1500)).toBe(true);
    expect(engine.confirm(1700)).toBe(true);
    expect(engine.result().totalMs).toBe(500);
    expect(engine.result().answers[0]?.elapsedMs).toBe(500);
  });

  it('走り終える前に結果は取れない', () => {
    expect(() => single().result()).toThrow();
  });

  it('問題が0件なら始められない', () => {
    expect(() => new RunEngine({ questions: [], locale: 'ja', settings: SETTINGS, seed: 1, now: 0 })).toThrow();
  });
});
