import { describe, expect, it } from 'vitest';
import {
  buildPeriodEntry,
  CHOICE_DIRECTIONS,
  choiceIndexOf,
  computeScore,
  DEFAULT_CONFIG,
  directionOf,
  estimatePace,
  median,
  mulberry32,
  questionScore,
  resolveSettings,
  scoreToPoints,
  shuffled,
  splitChars,
  visibleCharCount,
} from '../src';
import type { Period, RunRecord } from '../src';
import { makeQuestion, SETTINGS } from './helpers';

describe('並べ替え', () => {
  it('元の配列を変えず、全要素を1回ずつ含む', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const copy = items.slice();
    const out = shuffled(items, mulberry32(123));
    expect(items).toEqual(copy);
    expect(out.slice().sort((a, b) => a - b)).toEqual(items);
    expect(out).not.toEqual(items);
  });

  it('先頭に来る要素が偏らない', () => {
    const counts = [0, 0, 0, 0];
    for (let seed = 0; seed < 4000; seed++) {
      const first = shuffled([0, 1, 2, 3], mulberry32(seed))[0] as number;
      counts[first] = (counts[first] as number) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });
});

describe('文字の数え方', () => {
  it('確定位置と同じく、コードポイント単位で数える', () => {
    expect(splitChars('1年の月の数')).toHaveLength(6);
    expect(splitChars('Für Elise')).toHaveLength(9);
    expect(splitChars('−273.15℃')).toHaveLength(8);
    expect(splitChars('𠮷野家')).toHaveLength(3);
  });

  it('速度が 0 以下なら最初から全部出す', () => {
    expect(visibleCharCount(0, 10, 0)).toBe(10);
  });
});

describe('スコア', () => {
  it('1問の点：正解は速いほど高く、締切ちょうどで半分。不正解は 0', () => {
    expect(questionScore(true, 0, 6000)).toBe(1);
    expect(questionScore(true, 3000, 6000)).toBe(0.75);
    expect(questionScore(true, 6000, 6000)).toBe(0.5);
    expect(questionScore(false, 0, 6000)).toBe(0);
  });

  it('走行のスコアは1問の点の平均。全問一瞬で正解して満点', () => {
    expect(computeScore([1, 1, 1, 1], 4)).toBe(1);
    expect(computeScore([1, 0.5, 0, 0], 4)).toBe(0.375);
    expect(computeScore([], 0)).toBe(0);
  });

  it('読まずに連打しても、真面目に答えるより低い', () => {
    // 連打：4問に1問当たり、ほぼ一瞬で答える
    const mash = computeScore(Array.from({ length: 100 }, (_, i) => questionScore(i % 4 === 0, 300, 6000)), 100);
    // 真面目：85問正解、締切の半分で答える
    const honest = computeScore(Array.from({ length: 100 }, (_, i) => questionScore(i < 85, 3000, 6000)), 100);
    expect(mash).toBeLessThan(0.3);
    expect(honest).toBeGreaterThan(0.6);
  });

  it('表示は 1000 倍の整数', () => {
    expect(scoreToPoints(1)).toBe(1000);
    expect(scoreToPoints(0.6914)).toBe(691);
  });
});

describe('設定の決まり方', () => {
  const period: Period = {
    id: 'p',
    startsAt: '2026-10-19T00:00:00Z',
    endsAt: '2026-10-26T00:00:00Z',
    quarter: 1,
    isHardWeek: false,
    questionIds: [],
  };

  it('言語ごとの表示速度を使う', () => {
    expect(resolveSettings(DEFAULT_CONFIG, period, 'ja').msPerChar).toBe(150);
    expect(resolveSettings(DEFAULT_CONFIG, period, 'en').msPerChar).toBe(50);
    expect(resolveSettings({ ...DEFAULT_CONFIG, typewriterMsPerCharByLocale: undefined }, period, 'en').msPerChar).toBe(150);
  });

  it('ピリオドの指定は Config より優先する（激ムズウィーク用）', () => {
    const normal = resolveSettings(DEFAULT_CONFIG, period, 'ja');
    expect(normal.answerWindowMs).toBe(5000);

    const hard = resolveSettings(DEFAULT_CONFIG, { ...period, isHardWeek: true, answerWindowSec: 2.5 }, 'ja');
    expect(hard.answerWindowMs).toBe(2500);
  });

  it('調整用の上書きが最優先', () => {
    const settings = resolveSettings(DEFAULT_CONFIG, { ...period, answerWindowSec: 2.5 }, 'ja', {
      answerWindowMs: 4000,
      msPerChar: 120,
    });
    expect(settings.answerWindowMs).toBe(4000);
    expect(settings.msPerChar).toBe(120);
  });
});

describe('方向と選択肢の対応', () => {
  it('4方向が 0〜3 に1対1で対応する', () => {
    expect(new Set(CHOICE_DIRECTIONS).size).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(choiceIndexOf(directionOf(i))).toBe(i);
    }
    expect(() => directionOf(4)).toThrow();
  });
});

describe('走行の長さの見積もり', () => {
  it('全問時間切れのタイムと、表示が一番長い問題を出す', () => {
    const questions = [makeQuestion('a', 10), makeQuestion('b', 25), makeQuestion('c', 5)];
    const pace = estimatePace(questions, 'ja', SETTINGS);
    expect(pace.longestTypingMs).toBe(2500);
    expect(pace.longestQuestionId).toBe('b');
    expect(pace.allTimeoutMs).toBe(1000 + 2500 + 500 + 3 * 5000);
    expect(pace.overLimitIds).toEqual([]);
  });

  it('表示に 10 秒を超える問題を拾う', () => {
    const questions = [makeQuestion('a', 10), makeQuestion('long', 101)];
    expect(estimatePace(questions, 'ja', SETTINGS).overLimitIds).toEqual(['long']);
    // 英語のテスト用問題は倍の長さ
    expect(estimatePace(questions, 'en', SETTINGS).overLimitIds).toEqual(['long']);
  });
});

describe('ピリオドの集計', () => {
  function run(attemptNumber: number, score: number, correct: number, total = 100): RunRecord {
    return {
      id: `run-${attemptNumber}`,
      playerId: 'player',
      periodId: 'p',
      locale: 'ja',
      attemptNumber,
      startedAt: '2026-10-19T00:00:00Z',
      finishedAt: '2026-10-19T00:05:00Z',
      totalMs: 300_000,
      answers: Array.from({ length: total }, (_, i) => ({
        questionId: `q${i}`,
        order: i + 1,
        chosenIndex: 0,
        correct: i < correct,
        timedOut: false,
        elapsedMs: 3000,
      })),
      score,
      seed: attemptNumber,
      settings: SETTINGS,
    };
  }

  it('走行が無ければ null', () => {
    expect(buildPeriodEntry([])).toBeNull();
  });

  it('ベスト・1回目のスコア・全走行の正解率を出す', () => {
    const entry = buildPeriodEntry([run(3, 1.5, 90), run(1, 0.8, 70), run(2, 1.2, 80)]);
    expect(entry).toMatchObject({
      bestScore: 1.5,
      bestRunId: 'run-3',
      bestAttemptNumber: 3,
      firstScore: 0.8,
      totalCorrect: 240,
      totalAnswered: 300,
      attempts: 3,
    });
  });

  it('同スコアなら、先に出した挑戦をベストとする', () => {
    const entry = buildPeriodEntry([run(1, 1.0, 80), run(2, 1.4, 90), run(3, 1.4, 90)]);
    expect(entry?.bestAttemptNumber).toBe(2);
  });

  it('中央値', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([300, 100, 200])).toBe(200);
    expect(median([400, 100, 200, 300])).toBe(250);
  });
});
