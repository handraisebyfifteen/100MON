import type { DivisionResult, PointsConfig, PointsResult, RankedLeaderboardItem } from './types';

/**
 * 週のポイント（設計書 §6「ポイント制」）。
 * 3部門それぞれで「上位何%か」を出し、区分の点に重みを掛けて合計する。激ムズウィークは倍率を掛ける。
 * 週の終わりに1回だけ動かす前提で、純粋な計算だけにしてある。
 */

interface Contender {
  playerId: string;
  /** 大きいほど上位 */
  value: number;
  /** 同じ値なら小さいほど上位 */
  tie: number;
}

/** 上位の割合から区分の点を決める。どの区分にも入らなければ完走の点 */
export function tierPoints(rank: number, count: number, config: PointsConfig): number {
  if (count <= 0) return 0;
  const fraction = rank / count;
  for (const [limit, points] of config.tiers) {
    if (fraction <= limit) return points;
  }
  return config.finishPoints;
}

/** 順位を付ける。同じ値・同じ補助キーなら同じ順位（1, 2, 2, 4 のように） */
export function rankContenders(contenders: readonly Contender[]): Map<string, number> {
  const sorted = contenders
    .slice()
    .sort((a, b) => (b.value - a.value) || (a.tie - b.tie) || (a.playerId < b.playerId ? -1 : 1));
  const ranks = new Map<string, number>();
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i] as Contender;
    const previous = i > 0 ? (sorted[i - 1] as Contender) : null;
    if (previous === null || previous.value !== current.value || previous.tie !== current.tie) {
      rank = i + 1;
    }
    ranks.set(current.playerId, rank);
  }
  return ranks;
}

/** 正解率部門の値。回数で割り引く（設計書「正解率部門の割り引き」） */
export function discountedAccuracy(
  totalCorrect: number,
  totalAnswered: number,
  attempts: number,
  discountPerAttempt: number,
): number {
  if (totalAnswered <= 0) return 0;
  const accuracy = totalCorrect / totalAnswered;
  return accuracy * (1 - discountPerAttempt) ** Math.max(0, attempts - 1);
}

function division(
  contenders: readonly Contender[],
  weight: number,
  multiplier: number,
  config: PointsConfig,
): Map<string, DivisionResult> {
  const ranks = rankContenders(contenders);
  const out = new Map<string, DivisionResult>();
  for (const c of contenders) {
    const rank = ranks.get(c.playerId) as number;
    const basePoints = tierPoints(rank, contenders.length, config);
    out.set(c.playerId, {
      rank,
      count: contenders.length,
      value: c.value,
      basePoints,
      points: basePoints * weight * multiplier,
    });
  }
  return out;
}

/**
 * ある週・ある言語の全エントリーからポイントを計算する。
 * 通常週：ベスト＝ベストスコア、正確率＝1回目のスコア、正解率＝全走行の正解率を回数で割り引き。
 * 激ムズ：3部門ともベスト走行の値で判定し、割り引きなし。
 */
export function computePoints(
  entries: readonly RankedLeaderboardItem[],
  isHardWeek: boolean,
  config: PointsConfig,
  now: Date,
): Map<string, PointsResult> {
  const multiplier = isHardWeek ? config.hardMultiplier : 1;

  const best: Contender[] = entries.map((e) => ({
    playerId: e.playerId,
    value: e.bestScore,
    tie: e.bestAttemptNumber,
  }));
  const first: Contender[] = entries.map((e) =>
    isHardWeek
      ? { playerId: e.playerId, value: e.bestScore, tie: e.bestAttemptNumber }
      : { playerId: e.playerId, value: e.firstScore, tie: 0 },
  );
  const accuracy: Contender[] = entries.map((e) =>
    isHardWeek
      ? {
          playerId: e.playerId,
          value: e.bestAnswered > 0 ? e.bestCorrect / e.bestAnswered : 0,
          tie: e.bestAttemptNumber,
        }
      : {
          playerId: e.playerId,
          value: discountedAccuracy(e.totalCorrect, e.totalAnswered, e.attempts, config.accuracyDiscountPerAttempt),
          tie: e.attempts,
        },
  );

  const bestResults = division(best, config.weights.best, multiplier, config);
  const firstResults = division(first, config.weights.first, multiplier, config);
  const accuracyResults = division(accuracy, config.weights.accuracy, multiplier, config);

  const aggregatedAt = now.toISOString();
  const out = new Map<string, PointsResult>();
  for (const e of entries) {
    const b = bestResults.get(e.playerId) as DivisionResult;
    const f = firstResults.get(e.playerId) as DivisionResult;
    const a = accuracyResults.get(e.playerId) as DivisionResult;
    out.set(e.playerId, {
      best: b,
      first: f,
      accuracy: a,
      multiplier,
      total: Math.round(b.points + f.points + a.points),
      aggregatedAt,
    });
  }
  return out;
}
