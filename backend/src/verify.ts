import {
  CHOICE_COUNT,
  computeScore,
  mulberry32,
  questionScore,
  shuffled,
  splitChars,
  typingDurationMs,
} from '../../core/src/index';
import type { Answer, Locale, Question, RunSettings } from '../../core/src/index';
import { isRecord } from './validate';

/**
 * 走行の検証（設計書 §12）。アプリから送られた回答を信用せず、サーバーで確かめ直す。
 *
 * - 出題順：開始時に決めた種から並べ直し、送られた順と一致するか
 * - 正誤：選んだ番号と正解の番号から判定し直す（アプリの correct は見ない）
 * - 時間：1問ごとの経過時間が「表示時間＋猶予」を超えていないか
 * - スコア：サーバー側の設定値で計算し直す（アプリの score は見ない）
 *
 * ここで弾けるのは「形がおかしい記録」だけ。答えを覚えて速く押すことは防げない（設計どおり）。
 */

/** 1問の経過時間の許容誤差。締切ちょうどの時間切れが丸めで超えるぶん */
export const ELAPSED_TOLERANCE_MS = 50;
/** アプリが測った合計時間が、サーバーが測った時間をどれだけ上回ってよいか */
export const CLIENT_TOTAL_TOLERANCE_MS = 10_000;

export interface VerifiedRun {
  answers: Answer[];
  score: number;
  correctCount: number;
  timedOutCount: number;
  /** 1問ごとの経過時間の合計 */
  clientTotalMs: number;
}

export type VerifyResult =
  | { ok: true; run: VerifiedRun }
  | { ok: false; code: string; message: string };

export interface VerifyInput {
  /** ピリオドの questionIds の順に並んだ問題 */
  questions: readonly Question[];
  locale: Locale;
  settings: RunSettings;
  seed: number;
  answers: unknown;
  serverDurationMs: number;
}

/** 理論上の最短時間。各問とも、出題直後の入力ロックが明けるまでは答えられない */
export function minimumDurationMs(questionCount: number, settings: RunSettings): number {
  return questionCount * Math.max(0, settings.inputLockMs);
}

/** 理論上の最長時間。全問時間切れのときの長さ */
export function maximumDurationMs(
  questions: readonly Question[],
  locale: Locale,
  settings: RunSettings,
): number {
  let total = 0;
  for (const question of questions) {
    const chars = splitChars(question.locales[locale].text).length;
    total += typingDurationMs(chars, settings.msPerChar) + settings.answerWindowMs;
  }
  return total;
}

function fail(code: string, message: string): VerifyResult {
  return { ok: false, code, message };
}

export function verifyRun(input: VerifyInput): VerifyResult {
  const { questions, locale, settings, seed, answers, serverDurationMs } = input;

  if (!Array.isArray(answers)) return fail('INVALID_ANSWERS', 'answers must be an array');
  if (answers.length !== questions.length) {
    return fail('INCOMPLETE_RUN', `answers must have ${questions.length} items`);
  }

  const order = shuffled(questions, mulberry32(seed));
  const normalized: Answer[] = [];
  const scores: number[] = [];
  let correctCount = 0;
  let timedOutCount = 0;
  let clientTotalMs = 0;

  for (let i = 0; i < order.length; i++) {
    const question = order[i] as Question;
    const raw: unknown = answers[i];
    const where = `answers[${i}]`;
    if (!isRecord(raw)) return fail('INVALID_ANSWERS', `${where} must be an object`);
    if (raw.questionId !== question.id) {
      return fail('ORDER_MISMATCH', `${where}.questionId does not match the order for this seed`);
    }
    if (raw.order !== i + 1) return fail('ORDER_MISMATCH', `${where}.order must be ${i + 1}`);

    const chosen = raw.chosenIndex;
    if (chosen !== null && (typeof chosen !== 'number' || !Number.isInteger(chosen) || chosen < 0 || chosen >= CHOICE_COUNT)) {
      return fail('INVALID_ANSWERS', `${where}.chosenIndex must be null or 0-${CHOICE_COUNT - 1}`);
    }
    const elapsedMs = raw.elapsedMs;
    if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return fail('INVALID_ANSWERS', `${where}.elapsedMs must be a non-negative number`);
    }

    const chars = splitChars(question.locales[locale].text).length;
    const limitMs = typingDurationMs(chars, settings.msPerChar) + settings.answerWindowMs;
    if (elapsedMs > limitMs + ELAPSED_TOLERANCE_MS) {
      return fail('ELAPSED_OVER_LIMIT', `${where}.elapsedMs exceeds the time allowed for this question`);
    }
    const chosenIndex = chosen as number | null;
    const timedOut = chosenIndex === null;
    const correct = chosenIndex !== null && chosenIndex === question.answerIndex;
    if (correct) correctCount += 1;
    if (timedOut) timedOutCount += 1;
    clientTotalMs += elapsedMs;
    scores.push(questionScore(correct, elapsedMs, limitMs));
    normalized.push({
      questionId: question.id,
      order: i + 1,
      chosenIndex,
      correct,
      timedOut,
      elapsedMs: Math.round(elapsedMs),
    });
  }

  if (clientTotalMs > serverDurationMs + CLIENT_TOTAL_TOLERANCE_MS) {
    return fail('CLOCK_MISMATCH', 'reported play time is longer than the time measured by the server');
  }

  return {
    ok: true,
    run: {
      answers: normalized,
      score: computeScore(scores, questions.length),
      correctCount,
      timedOutCount,
      clientTotalMs: Math.round(clientTotalMs),
    },
  };
}
