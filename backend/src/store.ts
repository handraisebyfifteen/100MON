import type { Locale, Period } from '../../core/src/index';
import type { LeaderboardItem, PeriodItem, PointsResult, RunItem, ServerConfig } from './types';

/**
 * 保存先の抽象。本番は DynamoDB、テストはメモリ。
 * 「どう取り出すか」が設計書 §9 の表と1対1になるようにしてある。
 */

/** 走行が終わったときにランキング行へ足す値 */
export interface RunContribution {
  board: string;
  playerId: string;
  displayName: string;
  periodId: string;
  locale: Locale;
  correct: number;
  answered: number;
  /** suspicious でない走行のスコア。1回目のときだけ firstScore として残る（以後は書き換えない） */
  firstScore: number | null;
}

/** ベストを更新するときに書く値 */
export interface BestRecord {
  rankKey: string;
  bestScore: number;
  bestRunId: string;
  bestAttemptNumber: number;
  bestCorrect: number;
  bestAnswered: number;
}

export interface Store {
  // 設定（Config テーブル）
  getConfig(): Promise<ServerConfig | null>;
  /** 無いときだけ書く。あれば false */
  putConfigIfAbsent(config: ServerConfig): Promise<boolean>;

  // ピリオドと問題（Periods テーブル）
  getPeriod(periodId: string): Promise<PeriodItem | null>;
  /** 同じ periodId なら上書き */
  putPeriod(item: PeriodItem): Promise<void>;
  /** 全ピリオド（問題は含まない） */
  listPeriods(): Promise<Period[]>;

  // 走行（Runs テーブル）
  /** 開始時に作る */
  putRun(run: RunItem): Promise<void>;
  /** 終了時に書く。status が started のときだけ成功する（二重の終了を防ぐ）。失敗なら false */
  finishRun(run: RunItem): Promise<boolean>;
  /** playerId が分かっていれば主キーで（強い整合性）、無ければ byRunId で引く */
  getRun(runId: string, playerId?: string): Promise<RunItem | null>;
  /** 自分の走行の履歴。periodId と locale で絞れる。開始時刻の順 */
  listRuns(playerId: string, filter?: { periodId: string; locale: Locale }): Promise<RunItem[]>;
  /** sinceMs（UNIX ミリ秒）以降に始めた自分の走行 */
  listRunsSince(playerId: string, sinceMs: number): Promise<RunItem[]>;

  // ランキング（Leaderboard テーブル）
  getEntry(board: string, playerId: string): Promise<LeaderboardItem | null>;
  /**
   * 走行1回ぶんを足す：attempts・totalCorrect・totalAnswered を加算（ADD）、
   * displayName などは無いときだけ、firstScore は無いときだけ書く。更新後の行を返す
   */
  recordRun(contribution: RunContribution): Promise<LeaderboardItem>;
  /** ベストを書く。まだ無いか、bestScore がそれより低いときだけ成功する。同スコアは先に出したほうが残る */
  updateBest(board: string, playerId: string, best: BestRecord): Promise<boolean>;
  /** 週の終わりのポイントだけを書く。他の項目は触らない */
  setEntryPoints(board: string, playerId: string, points: PointsResult): Promise<void>;
  /** あるピリオド・ある言語の上位（ベストがある人だけ）。limit を省くと全件 */
  listEntriesByRank(board: string, limit?: number): Promise<LeaderboardItem[]>;
  /** rankKey がそれより小さい（上位の）人数 */
  countBetter(board: string, rankKey: string): Promise<number>;
  /** 順位に載っている人数 */
  countEntries(board: string): Promise<number>;
  /** 自分のエントリーを全ピリオドぶん */
  listEntriesByPlayer(playerId: string): Promise<LeaderboardItem[]>;
}
