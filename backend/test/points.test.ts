import { describe, expect, it } from 'vitest';
import { displayNameFor } from '../src/names';
import { computePoints, discountedAccuracy, rankContenders, tierPoints } from '../src/points';
import { compareRankKey, rankKey } from '../src/rank-key';
import { DEFAULT_POINTS_CONFIG } from '../src/types';
import type { LeaderboardItem } from '../src/types';

const config = DEFAULT_POINTS_CONFIG;

describe('区分の点', () => {
  it('上位の割合で決まり、どこにも入らなければ完走の点', () => {
    expect(tierPoints(1, 100, config)).toBe(100);
    expect(tierPoints(5, 100, config)).toBe(80);
    expect(tierPoints(10, 100, config)).toBe(65);
    expect(tierPoints(25, 100, config)).toBe(50);
    expect(tierPoints(50, 100, config)).toBe(35);
    expect(tierPoints(51, 100, config)).toBe(20);
    // 1人だけなら 1/1 ＝ 100% なので、どの区分にも入らず完走の点になる（上位の割合で見るため）
    expect(tierPoints(1, 1, config)).toBe(20);
  });
});

describe('正解率部門の割り引き（設計書の例）', () => {
  it('同じ88%なら1回が2回より上。3回で99%なら上に来る', () => {
    const d = config.accuracyDiscountPerAttempt;
    expect(discountedAccuracy(88, 100, 1, d) * 100).toBeCloseTo(88.0, 1);
    expect(discountedAccuracy(88, 100, 2, d) * 100).toBeCloseTo(86.2, 1);
    expect(discountedAccuracy(90, 100, 3, d) * 100).toBeCloseTo(86.4, 1);
    expect(discountedAccuracy(99, 100, 3, d) * 100).toBeCloseTo(95.1, 1);
  });
});

describe('順位', () => {
  it('値が高い順、同じなら補助キーが小さい順。同じなら同順位', () => {
    const ranks = rankContenders([
      { playerId: 'a', value: 0.8, tie: 2 },
      { playerId: 'b', value: 0.8, tie: 1 },
      { playerId: 'c', value: 0.9, tie: 5 },
      { playerId: 'd', value: 0.8, tie: 1 },
    ]);
    expect([ranks.get('c'), ranks.get('b'), ranks.get('d'), ranks.get('a')]).toEqual([1, 2, 2, 4]);
  });

  it('rankKey は文字列の順で上位が先に来る', () => {
    const keys = [rankKey(0.5, 1), rankKey(0.9, 3), rankKey(0.9, 1), rankKey(1, 1)].sort(compareRankKey);
    expect(keys).toEqual([rankKey(1, 1), rankKey(0.9, 1), rankKey(0.9, 3), rankKey(0.5, 1)]);
  });
});

function entry(playerId: string, overrides: Partial<LeaderboardItem>): LeaderboardItem {
  return {
    board: 'P#ja',
    playerId,
    displayName: playerId,
    periodId: 'P',
    locale: 'ja',
    rankKey: rankKey(overrides.bestScore ?? 0, overrides.bestAttemptNumber ?? 1),
    bestScore: 0,
    bestRunId: 'r',
    bestAttemptNumber: 1,
    bestCorrect: 0,
    bestAnswered: 100,
    firstScore: 0,
    totalCorrect: 0,
    totalAnswered: 100,
    attempts: 1,
    ...overrides,
  };
}

describe('週のポイント', () => {
  const now = new Date('2026-10-26T00:10:00Z');

  it('通常週：3部門の点に重みを掛けて足す', () => {
    const entries = [
      entry('a', { bestScore: 0.9, firstScore: 0.9, totalCorrect: 90 }),
      entry('b', { bestScore: 0.8, firstScore: 0.5, totalCorrect: 95, totalAnswered: 200, attempts: 2 }),
    ];
    const points = computePoints(entries, false, config, now);
    // a：ベスト1位(35)、正確率1位(35)、正解率 90% vs 47.5%×0.98 → 1位(35)
    expect(points.get('a')?.total).toBe(Math.round(35 + 17.5 + 17.5));
    expect(points.get('b')?.total).toBe(Math.round(20 + 10 + 10));
    expect(points.get('a')?.multiplier).toBe(1);
  });

  it('激ムズ：ベスト走行だけで判定し、3倍にする', () => {
    const entries = [
      // 1回目は散々、2回目で巻き返した人。激ムズでは1回目の点を見ない
      entry('a', { bestScore: 0.9, bestAttemptNumber: 2, bestCorrect: 95, firstScore: 0.1, totalCorrect: 100, totalAnswered: 200, attempts: 2 }),
      entry('b', { bestScore: 0.8, bestCorrect: 80, firstScore: 0.8, totalCorrect: 80 }),
    ];
    const points = computePoints(entries, true, config, now);
    expect(points.get('a')?.first.rank).toBe(1);
    expect(points.get('a')?.accuracy.rank).toBe(1);
    expect(points.get('a')?.total).toBe(Math.round((35 + 17.5 + 17.5) * 3));
    expect(points.get('b')?.total).toBe(Math.round((20 + 10 + 10) * 3));
  });
});

describe('表示名', () => {
  it('同じIDなら同じ名前。形は Adjective + Animal + 4桁', () => {
    const name = displayNameFor('player-aaaa-0001');
    expect(name).toBe(displayNameFor('player-aaaa-0001'));
    expect(name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+-\d{4}$/);
    expect(name).not.toBe(displayNameFor('player-bbbb-0002'));
  });
});
