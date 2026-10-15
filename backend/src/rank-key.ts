/**
 * 順位の並べ替え用キー（設計書 §9「DynamoDB での持ち方」）。
 * 文字列として小さいほど上位になるように、
 * 「満点からの差」と「何回目の挑戦で出したか」を桁をそろえて並べる。
 *
 * 例：スコア 0.9123、2回目 → "0087700000#0002"
 */

const SCORE_SCALE = 1_000_000_000;
const SCORE_DIGITS = 10;
const ATTEMPT_DIGITS = 4;

export function rankKey(score: number, attemptNumber: number): string {
  const clamped = Math.min(1, Math.max(0, score));
  const gap = Math.round((1 - clamped) * SCORE_SCALE);
  const attempt = Math.min(10 ** ATTEMPT_DIGITS - 1, Math.max(0, Math.floor(attemptNumber)));
  return `${String(gap).padStart(SCORE_DIGITS, '0')}#${String(attempt).padStart(ATTEMPT_DIGITS, '0')}`;
}

/** rankKey の順で並べる比較関数（小さいほど上位） */
export function compareRankKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
