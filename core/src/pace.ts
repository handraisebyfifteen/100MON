import type { RunSettings } from './settings';
import { splitChars, typingDurationMs } from './text';
import type { Locale, Question } from './types';

/** 設計書 §5 の安全弁：1問あたりの問題文の表示時間は 10 秒以内 */
export const MAX_TYPING_MS = 10_000;

export interface PaceEstimate {
  /** 問題文の表示が一番長い問題 */
  longestTypingMs: number;
  longestQuestionId: string | null;
  /** 表示時間が MAX_TYPING_MS を超える問題 */
  overLimitIds: string[];
  /** 全問時間切れのときのタイム（1走行の理論上の上限） */
  allTimeoutMs: number;
}

/** いまの表示速度で、1走行がどれくらいの長さになるかを見積もる */
export function estimatePace(
  questions: readonly Question[],
  locale: Locale,
  settings: Pick<RunSettings, 'msPerChar' | 'answerWindowMs'>,
): PaceEstimate {
  let longestTypingMs = 0;
  let longestQuestionId: string | null = null;
  let allTimeoutMs = 0;
  const overLimitIds: string[] = [];

  for (const question of questions) {
    const charCount = splitChars(question.locales[locale].text).length;
    const typingMs = typingDurationMs(charCount, settings.msPerChar);
    if (typingMs > longestTypingMs) {
      longestTypingMs = typingMs;
      longestQuestionId = question.id;
    }
    if (typingMs > MAX_TYPING_MS) overLimitIds.push(question.id);
    allTimeoutMs += typingMs + settings.answerWindowMs;
  }
  return { longestTypingMs, longestQuestionId, overLimitIds, allTimeoutMs };
}
