import type { Locale, Period, Question } from '../../core/src/index';
import { compareRankKey } from './rank-key';
import type { Store } from './store';
import type { LeaderboardItem, PointsResult, RunItem, ServerConfig } from './types';

/** テスト用。DynamoDB と同じ取り出し方だけを提供する */
export class MemoryStore implements Store {
  private config: ServerConfig | null = null;
  private readonly periods = new Map<string, Period>();
  private readonly questions = new Map<string, Question[]>();
  private readonly runs = new Map<string, RunItem>();
  private readonly entries = new Map<string, LeaderboardItem>();

  private static runKey(playerId: string, runId: string): string {
    return `${playerId}/${runId}`;
  }

  private static entryKey(board: string, playerId: string): string {
    return `${board}/${playerId}`;
  }

  private static clone<T>(value: T): T {
    return structuredClone(value);
  }

  async getConfig(): Promise<ServerConfig | null> {
    return this.config ? MemoryStore.clone(this.config) : null;
  }

  async putConfig(config: ServerConfig): Promise<void> {
    this.config = MemoryStore.clone(config);
  }

  async getPeriod(periodId: string): Promise<Period | null> {
    const period = this.periods.get(periodId);
    return period ? MemoryStore.clone(period) : null;
  }

  async putPeriod(period: Period): Promise<void> {
    this.periods.set(period.id, MemoryStore.clone(period));
  }

  async listPeriods(): Promise<Period[]> {
    return [...this.periods.values()].map((p) => MemoryStore.clone(p));
  }

  async getQuestions(periodId: string): Promise<Question[] | null> {
    const questions = this.questions.get(periodId);
    return questions ? MemoryStore.clone(questions) : null;
  }

  async putQuestions(periodId: string, questions: Question[]): Promise<void> {
    this.questions.set(periodId, MemoryStore.clone(questions));
  }

  async putRun(run: RunItem): Promise<void> {
    this.runs.set(MemoryStore.runKey(run.playerId, run.runId), MemoryStore.clone(run));
  }

  async getRun(playerId: string, runId: string): Promise<RunItem | null> {
    const run = this.runs.get(MemoryStore.runKey(playerId, runId));
    return run ? MemoryStore.clone(run) : null;
  }

  async listRuns(playerId: string, filter?: { periodId: string; locale: Locale }): Promise<RunItem[]> {
    return [...this.runs.values()]
      .filter((r) => r.playerId === playerId)
      .filter((r) => !filter || (r.periodId === filter.periodId && r.locale === filter.locale))
      .sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0))
      .map((r) => MemoryStore.clone(r));
  }

  async getEntry(board: string, playerId: string): Promise<LeaderboardItem | null> {
    const entry = this.entries.get(MemoryStore.entryKey(board, playerId));
    return entry ? MemoryStore.clone(entry) : null;
  }

  async putEntry(entry: LeaderboardItem, expectedAttempts: number | null): Promise<boolean> {
    const key = MemoryStore.entryKey(entry.board, entry.playerId);
    const current = this.entries.get(key);
    if (expectedAttempts === null ? current !== undefined : current?.attempts !== expectedAttempts) {
      return false;
    }
    this.entries.set(key, MemoryStore.clone(entry));
    return true;
  }

  async setEntryPoints(board: string, playerId: string, points: PointsResult): Promise<void> {
    const key = MemoryStore.entryKey(board, playerId);
    const current = this.entries.get(key);
    if (!current) return;
    current.points = MemoryStore.clone(points);
  }

  async listEntriesByRank(board: string, limit?: number): Promise<LeaderboardItem[]> {
    const sorted = [...this.entries.values()]
      .filter((e) => e.board === board)
      .sort((a, b) => compareRankKey(a.rankKey, b.rankKey));
    return (limit === undefined ? sorted : sorted.slice(0, limit)).map((e) => MemoryStore.clone(e));
  }

  async countBetter(board: string, rankKey: string): Promise<number> {
    return [...this.entries.values()].filter((e) => e.board === board && compareRankKey(e.rankKey, rankKey) < 0)
      .length;
  }

  async countEntries(board: string): Promise<number> {
    return [...this.entries.values()].filter((e) => e.board === board).length;
  }

  async listEntriesByPlayer(playerId: string): Promise<LeaderboardItem[]> {
    return [...this.entries.values()]
      .filter((e) => e.playerId === playerId)
      .sort((a, b) => (a.board < b.board ? -1 : a.board > b.board ? 1 : 0))
      .map((e) => MemoryStore.clone(e));
  }
}
