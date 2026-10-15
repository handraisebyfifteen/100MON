/**
 * スコア（設計書 §5）。1問ごとの点を足し上げ、満点は 1000。
 *
 * - 正解：速く答えたほど高い。出題の瞬間なら満点、締切ちょうどなら半分
 * - 不正解・時間切れ：0
 *
 * 正解しないと点が入らないので、読まずに連打しても得にならない。
 */

/** 正解したときの最低点（1問の満点に対する割合） */
export const CORRECT_FLOOR = 0.5;

/**
 * 1問の点。0〜1。
 * limitMs は、その問題で答えられる時間の合計（問題文の表示時間 ＋ 回答の猶予）。
 */
export function questionScore(correct: boolean, elapsedMs: number, limitMs: number): number {
  if (!correct) return 0;
  if (!(limitMs > 0)) return 1;
  const left = 1 - Math.min(1, Math.max(0, elapsedMs / limitMs));
  return CORRECT_FLOOR + (1 - CORRECT_FLOOR) * left;
}

/** 走行のスコア。1問の点の平均で 0〜1。出題数が違っても満点は同じ */
export function computeScore(questionScores: readonly number[], questionCount: number): number {
  if (!(questionCount > 0)) return 0;
  let sum = 0;
  for (const s of questionScores) sum += s;
  return sum / questionCount;
}

/** 画面に出すときの倍率。順位の判定には元のスコアを使う */
export const SCORE_DISPLAY_SCALE = 1000;

/** 画面表示用の整数。満点で 1000（100問なら1問10点） */
export function scoreToPoints(score: number): number {
  return Math.round(score * SCORE_DISPLAY_SCALE);
}
