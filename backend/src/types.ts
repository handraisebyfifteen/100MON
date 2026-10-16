import type { Answer, Config, Locale, Period, Question } from '../../core/src/index';

/**
 * サーバーが保存する形（設計書 §9）。
 * ピリオド（Periods）・走行（Runs）・ランキング（Leaderboard）・設定（Config）でテーブルを分ける。
 */

/** Periods テーブルの1件：ピリオドと、その100問をまとめて持つ */
export interface PeriodItem {
  period: Period;
  questions: Question[];
}

export type RunStatus = 'started' | 'finished';

/** 走行1回。開始時に status: started で作り、終了時に残りを埋める */
export interface RunItem {
  runId: string;
  playerId: string;
  periodId: string;
  locale: Locale;
  /** そのピリオド・その言語で何回目の挑戦か（開始した時点で数える。途中で終わった走行も含む） */
  attemptNumber: number;
  status: RunStatus;
  /** サーバー時刻（ISO 8601） */
  serverStartedAt: string;
  serverFinishedAt?: string;
  /** 出題順を決めた種。あとから同じ順を再現できる */
  seed: number;
  answers?: Answer[];
  score?: number;
  correctCount?: number;
  timedOutCount?: number;
  /** アプリが測った走行時間（1問ごとの elapsedMs の合計） */
  clientTotalMs?: number;
  /** サーバーが測った走行時間（開始と終了のサーバー時刻の差）＝タイム */
  serverDurationMs?: number;
  /** 理論上の最短時間を下回ったなど、ランキングに載せない記録。生データは残す（設計書 §12） */
  suspicious?: boolean;
  suspiciousReason?: string;
}

/** 3部門それぞれの、その週の成績 */
export interface DivisionResult {
  /** 1 始まり */
  rank: number;
  /** その週・その言語の参加人数 */
  count: number;
  /** 部門の値（ベスト：スコア、正確率：1回目のスコア、正解率：割り引き後の正解率） */
  value: number;
  /** 重みを掛ける前の点 */
  basePoints: number;
  /** 重みを掛けたあとの点 */
  points: number;
}

export interface PointsResult {
  best: DivisionResult;
  first: DivisionResult;
  accuracy: DivisionResult;
  multiplier: number;
  /** 3部門の合計 × 倍率（四捨五入した整数） */
  total: number;
  aggregatedAt: string;
}

/**
 * ピリオドのベスト（設計書 §9 の Leaderboard Entry）。
 * best 系と firstScore は suspicious でない走行が1つ出るまで無い。無い間は rankKey も無く、順位には載らない。
 */
export interface LeaderboardItem {
  /** `ピリオドID#言語` */
  board: string;
  playerId: string;
  displayName: string;
  periodId: string;
  locale: Locale;
  /** 高い順に並べるためのキー。小さいほど上位。ベストが無ければ無い */
  rankKey?: string;
  bestScore?: number;
  bestRunId?: string;
  /** 同スコア時の順位判定に使う */
  bestAttemptNumber?: number;
  /** 激ムズウィークの正解率部門用：ベスト走行の正解数と出題数 */
  bestCorrect?: number;
  bestAnswered?: number;
  /** 正確率部門：1回目の走行のスコア（以後は書き換えない） */
  firstScore?: number;
  /** 正解率部門：すべての走行の正解数の合計 */
  totalCorrect: number;
  /** 正解率部門：すべての走行の出題数の合計（時間切れ含む） */
  totalAnswered: number;
  /** その週の走り終えた回数（suspicious も含む） */
  attempts: number;
  /** 週の終わりに1回だけ付ける。付く前は無い */
  points?: PointsResult;
}

/** 順位に載っている（ベストがある）エントリー */
export type RankedLeaderboardItem = LeaderboardItem & {
  rankKey: string;
  bestScore: number;
  bestRunId: string;
  bestAttemptNumber: number;
  bestCorrect: number;
  bestAnswered: number;
  firstScore: number;
};

export function isRanked(entry: LeaderboardItem): entry is RankedLeaderboardItem {
  return typeof entry.rankKey === 'string' && typeof entry.bestScore === 'number';
}

/** ポイントの設定値（設計書 §6「ポイント制」） */
export interface PointsConfig {
  /** [上位の割合, 点] を上から順に。割合以下なら、その点 */
  tiers: Array<[number, number]>;
  /** どの区分にも入らなかった人（完走）の点 */
  finishPoints: number;
  weights: { best: number; first: number; accuracy: number };
  hardMultiplier: number;
  /** 正解率部門の割り引き（1回あたり） */
  accuracyDiscountPerAttempt: number;
}

/** サーバー設定値。core の Config に、サーバーだけが使う値を足したもの */
export interface ServerConfig extends Config {
  /** 指定があれば「今週のピリオド」をこれに固定する（開発・デモ用）。無ければ UTC の現在時刻で決める */
  activePeriodId?: string;
  /** 同じ playerId からの走行開始の上限：windowSec 秒の間に max 回まで */
  startRateLimit: { windowSec: number; max: number };
  /** 理論上の最短時間に掛ける係数（0〜1）。暫定。verify.ts の minimumDurationMs を参照 */
  minTimeFactor: number;
  points: PointsConfig;
}

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  tiers: [
    [0.01, 100],
    [0.05, 80],
    [0.1, 65],
    [0.25, 50],
    [0.5, 35],
  ],
  finishPoints: 20,
  weights: { best: 1, first: 0.5, accuracy: 0.5 },
  hardMultiplier: 3,
  accuracyDiscountPerAttempt: 0.02,
};

export const boardKey = (periodId: string, locale: Locale): string => `${periodId}#${locale}`;

/**
 * Config テーブルに最初に入れる値（scripts/seed.ts が、無いときだけ入れる）。
 * typewriterMsPerChar は暫定（設計書 §5 で言語別に 150 / 50 と確定しているので byLocale が実際に使われる）。
 */
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  answerWindowSec: 5,
  typewriterMsPerChar: 150,
  typewriterMsPerCharByLocale: { ja: 150, en: 50 },
  inputLockMs: 200,
  startRateLimit: { windowSec: 600, max: 10 },
  minTimeFactor: 0.5,
  points: DEFAULT_POINTS_CONFIG,
};
