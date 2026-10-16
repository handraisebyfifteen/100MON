import { describe, expect, it } from 'vitest';
import { computeScore, questionScore } from '../../core/src/index';
import { rankKey } from '../src/rank-key';
import { maximumDurationMs, minimumDurationMs } from '../src/verify';
import { QUESTIONS } from './helpers';

/** AWS なしで動く純粋な計算の確認（スコア、同スコアの順位、最短・最長時間） */

const settings = { answerWindowMs: 5_000, msPerChar: 100, inputLockMs: 200 };

describe('スコア（設計書 §5）', () => {
  it('出題の瞬間の正解は満点、締切ちょうどは半分、不正解と時間切れは0', () => {
    expect(questionScore(true, 0, 10_000)).toBe(1);
    expect(questionScore(true, 5_000, 10_000)).toBe(0.75);
    expect(questionScore(true, 10_000, 10_000)).toBe(0.5);
    expect(questionScore(false, 0, 10_000)).toBe(0);
  });

  it('走行のスコアは1問の点の平均。全問時間切れは0、出題数が違っても満点は同じ', () => {
    expect(computeScore([1, 1, 1, 1], 4)).toBe(1);
    expect(computeScore([0, 0, 0, 0, 0], 5)).toBe(0);
    expect(computeScore([1, 0.5], 2)).toBe(0.75);
    expect(computeScore([], 0)).toBe(0);
  });
});

describe('同スコアの順位', () => {
  it('スコアが高いほど小さく、同スコアなら挑戦回数が少ないほど小さい', () => {
    expect(rankKey(0.9, 1) < rankKey(0.8, 1)).toBe(true);
    expect(rankKey(0.9, 1) < rankKey(0.9, 2)).toBe(true);
    expect(rankKey(0.9, 2) < rankKey(0.8999, 1)).toBe(true);
    expect(rankKey(0.9, 1)).toBe(rankKey(0.9, 1));
  });
});

describe('理論上の時間', () => {
  it('最短＝Σ max(入力ロック, 確定位置×表示速度) × 係数', () => {
    // 確定位置 2,3,4,5,6 × 100ms ＝ 2000ms
    expect(minimumDurationMs(QUESTIONS, 'ja', settings, 1)).toBe(2_000);
    expect(minimumDurationMs(QUESTIONS, 'ja', settings, 0.5)).toBe(1_000);
    // 入力ロックより短くはならない
    expect(minimumDurationMs(QUESTIONS, 'ja', { ...settings, msPerChar: 10 }, 1)).toBe(5 * 200);
    // 係数が壊れていれば 1 として扱う
    expect(minimumDurationMs(QUESTIONS, 'ja', settings, Number.NaN)).toBe(2_000);
  });

  it('最長＝Σ（文字数×表示速度＋猶予）', () => {
    // 文字数 4,6,8,10,12 × 100ms ＝ 4000ms ＋ 5問 × 5000ms
    expect(maximumDurationMs(QUESTIONS, 'ja', settings)).toBe(4_000 + 25_000);
  });
});
