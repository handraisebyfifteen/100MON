import type { RunSettings } from './settings';
import type { Answer, Locale } from './types';

/**
 * 走行1回ぶんの記録（設計書 §9 の Run に対応）。
 * 集計結果ではなく生データを残し、集計はここから作る。
 */
export interface RunRecord {
  id: string;
  /** 端末単位の匿名ID */
  playerId: string;
  periodId: string;
  locale: Locale;
  /** そのピリオド・その言語で何回目の挑戦か */
  attemptNumber: number;
  /** 本番ではサーバー時刻。ブラウザ版プロトタイプでは端末の時計 */
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  answers: Answer[];
  score: number;
  seed: number;
  settings: RunSettings;
}

/** ピリオドのベストと各部門の元データ（設計書 §9 の LeaderboardEntry から表示名を除いたもの） */
export interface PeriodEntry {
  periodId: string;
  locale: Locale;
  bestScore: number;
  bestRunId: string;
  /** 同スコア時の順位判定に使う */
  bestAttemptNumber: number;
  /** 正確率部門：1回目の走行のスコア */
  firstScore: number;
  /** 正解率部門：すべての走行の正解数の合計 */
  totalCorrect: number;
  /** 正解率部門：すべての走行の出題数の合計（時間切れ含む） */
  totalAnswered: number;
  attempts: number;
}

/** 同じピリオド・同じ言語の走行から、ベストと各部門の元データを作る。走行が無ければ null */
export function buildPeriodEntry(runs: readonly RunRecord[]): PeriodEntry | null {
  if (runs.length === 0) return null;
  const ordered = runs.slice().sort((a, b) => a.attemptNumber - b.attemptNumber);
  const first = ordered[0] as RunRecord;

  let best = first;
  let totalCorrect = 0;
  let totalAnswered = 0;
  for (const run of ordered) {
    // 同スコアなら、先に出した挑戦（何回目かが少ない方）を残す
    if (run.score > best.score) best = run;
    totalAnswered += run.answers.length;
    for (const answer of run.answers) {
      if (answer.correct) totalCorrect += 1;
    }
  }

  return {
    periodId: first.periodId,
    locale: first.locale,
    bestScore: best.score,
    bestRunId: best.id,
    bestAttemptNumber: best.attemptNumber,
    firstScore: first.score,
    totalCorrect,
    totalAnswered,
    attempts: ordered.length,
  };
}

/** 中央値。空なら null */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
