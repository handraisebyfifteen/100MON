/**
 * 問題文を「1文字ずつ」に分ける。
 * 確定位置（decisionPoint）と同じ数え方になるよう、コードポイント単位で数える。
 */
export function splitChars(text: string): string[] {
  return Array.from(text);
}

/** 問題文が全部出揃うまでの時間 */
export function typingDurationMs(charCount: number, msPerChar: number): number {
  return charCount * Math.max(0, msPerChar);
}

/**
 * 経過時間から、表示済みの文字数を求める。
 * k 文字目は k × msPerChar の時点で出る。最後の文字が出た瞬間が「出揃った瞬間」。
 */
export function visibleCharCount(elapsedMs: number, charCount: number, msPerChar: number): number {
  if (msPerChar <= 0) return charCount;
  if (elapsedMs <= 0) return 0;
  return Math.min(charCount, Math.floor(elapsedMs / msPerChar));
}
