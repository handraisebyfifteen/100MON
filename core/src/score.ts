/**
 * スコア = 基準時間 ÷ 実タイム × 正答率（設計書 §5）
 */
export function computeScore(
  baseTimeMs: number,
  totalMs: number,
  correctCount: number,
  questionCount: number,
): number {
  if (!(totalMs > 0) || !(questionCount > 0)) return 0;
  return (baseTimeMs / totalMs) * (correctCount / questionCount);
}

/** 画面に出すときの倍率。順位の判定には元のスコアを使う */
export const SCORE_DISPLAY_SCALE = 1000;

/** 画面表示用の整数。基準時間ちょうど・全問正解で 1000 */
export function scoreToPoints(score: number): number {
  return Math.round(score * SCORE_DISPLAY_SCALE);
}
