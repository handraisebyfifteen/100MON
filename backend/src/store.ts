import type { Locale, Period, Question } from '../../core/src/index';
import type { LeaderboardItem, PointsResult, RunItem, ServerConfig } from './types';

/**
 * 保存先の抽象。本番は DynamoDB、テストはメモリ。
 * 「どう取り出すか」が設計書 §9 の表と1対1になるようにしてある。
 */
export interface Store {
  // 設定（Config テーブル）
  getConfig(): Promise<ServerConfig | null>;
  putConfig(config: ServerConfig): Promise<void>;
  getPeriod(periodId: string): Promise<Period | null>;
  putPeriod(period: Period): Promise<void>;
  listPeriods(): Promise<Period[]>;
  getQuestions(periodId: string): Promise<Question[] | null>;
  putQuestions(periodId: string, questions: Question[]): Promise<void>;

  // 走行（Runs テーブル）
  putRun(run: RunItem): Promise<void>;
  getRun(playerId: string, runId: string): Promise<RunItem | null>;
  /** 自分の走行の履歴。periodId と locale で絞れる。開始時刻の順 */
  listRuns(playerId: string, filter?: { periodId: string; locale: Locale }): Promise<RunItem[]>;

  // ランキング（Leaderboard テーブル）
  getEntry(board: string, playerId: string): Promise<LeaderboardItem | null>;
  /**
   * エントリーを書く。expectedAttempts が null なら「まだ無いこと」、
   * 数なら「attempts がその値のままであること」を条件にする（同時更新の取りこぼし防止）。
   * 条件に合わなければ false。
   */
  putEntry(entry: LeaderboardItem, expectedAttempts: number | null): Promise<boolean>;
  /** 週の終わりのポイントだけを書く。他の項目は触らない */
  setEntryPoints(board: string, playerId: string, points: PointsResult): Promise<void>;
  /** あるピリオド・ある言語の上位。limit を省くと全件 */
  listEntriesByRank(board: string, limit?: number): Promise<LeaderboardItem[]>;
  /** rankKey がそれより小さい（上位の）人数 */
  countBetter(board: string, rankKey: string): Promise<number>;
  countEntries(board: string): Promise<number>;
  /** 自分のエントリーを全ピリオドぶん */
  listEntriesByPlayer(playerId: string): Promise<LeaderboardItem[]>;
}
