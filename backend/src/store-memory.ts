import type { Locale, Period } from '../../core/src/index';
import { compareRankKey } from './rank-key';
import type { BestRecord, RunContribution, Store } from './store';
import type { LeaderboardItem, PeriodItem, PointsResult, RunItem, ServerConfig } from './types';

/** テスト用。DynamoDB と同じ取り出し方・同じ条件だけを提供する */
export class MemoryStore implements Store {
  private config: ServerConfig | null = null;
  private readonly periods = new Map<string, PeriodItem>();
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

  async putConfigIfAbsent(config: ServerConfig): Promise<boolean> {
    if (this.config) return false;
    this.config = MemoryStore.clone(config);
    return true;
  }

  /** テスト用：設定を差し替える */
  async putConfig(config: ServerConfig): Promise<void> {
    this.config = MemoryStore.clone(config);
  }

  async getPeriod(periodId: string): Promise<PeriodItem | null> {
    const item = this.periods.get(periodId);
    return item ? MemoryStore.clone(item) : null;
  }

  async putPeriod(item: PeriodItem): Promise<void> {
    this.periods.set(item.period.id, MemoryStore.clone(item));
  }

  async listPeriods(): Promise<Period[]> {
    return [...this.periods.values()].map((p) => MemoryStore.clone(p.period));
  }

  async putRun(run: RunItem): Promise<void> {
    this.runs.set(MemoryStore.runKey(run.playerId, run.runId), MemoryStore.clone(run));
  }

  async finishRun(run: RunItem): Promise<boolean> {
    const key = MemoryStore.runKey(run.playerId, run.runId);
    const current = this.runs.get(key);
    if (!current || current.status !== 'started') return false;
    this.runs.set(key, MemoryStore.clone(run));
    return true;
  }

  async getRun(runId: string, playerId?: string): Promise<RunItem | null> {
    const run =
      playerId !== undefined
        ? this.runs.get(MemoryStore.runKey(playerId, runId))
        : [...this.runs.values()].find((r) => r.runId === runId);
    return run ? MemoryStore.clone(run) : null;
  }

  async listRuns(playerId: string, filter?: { periodId: string; locale: Locale }): Promise<RunItem[]> {
    return [...this.runs.values()]
      .filter((r) => r.playerId === playerId)
      .filter((r) => !filter || (r.periodId === filter.periodId && r.locale === filter.locale))
      .sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0))
      .map((r) => MemoryStore.clone(r));
  }

  async listRunsSince(playerId: string, sinceMs: number): Promise<RunItem[]> {
    return (await this.listRuns(playerId)).filter((r) => Date.parse(r.serverStartedAt) >= sinceMs);
  }

  async getEntry(board: string, playerId: string): Promise<LeaderboardItem | null> {
    const entry = this.entries.get(MemoryStore.entryKey(board, playerId));
    return entry ? MemoryStore.clone(entry) : null;
  }

  async recordRun(c: RunContribution): Promise<LeaderboardItem> {
    const key = MemoryStore.entryKey(c.board, c.playerId);
    const current = this.entries.get(key) ?? {
      board: c.board,
      playerId: c.playerId,
      displayName: c.displayName,
      periodId: c.periodId,
      locale: c.locale,
      totalCorrect: 0,
      totalAnswered: 0,
      attempts: 0,
    };
    current.attempts += 1;
    current.totalCorrect += c.correct;
    current.totalAnswered += c.answered;
    if (c.firstScore !== null && current.firstScore === undefined) current.firstScore = c.firstScore;
    this.entries.set(key, current);
    return MemoryStore.clone(current);
  }

  async updateBest(board: string, playerId: string, best: BestRecord): Promise<boolean> {
    const current = this.entries.get(MemoryStore.entryKey(board, playerId));
    if (!current) return false;
    if (current.bestScore !== undefined && !(current.bestScore < best.bestScore)) return false;
    Object.assign(current, best);
    return true;
  }

  async setEntryPoints(board: string, playerId: string, points: PointsResult): Promise<void> {
    const current = this.entries.get(MemoryStore.entryKey(board, playerId));
    if (!current) return;
    current.points = MemoryStore.clone(points);
  }

  private ranked(board: string): LeaderboardItem[] {
    return [...this.entries.values()]
      .filter((e) => e.board === board && e.rankKey !== undefined)
      .sort((a, b) => compareRankKey(a.rankKey as string, b.rankKey as string));
  }

  async listEntriesByRank(board: string, limit?: number): Promise<LeaderboardItem[]> {
    const sorted = this.ranked(board);
    return (limit === undefined ? sorted : sorted.slice(0, limit)).map((e) => MemoryStore.clone(e));
  }

  async countBetter(board: string, rankKey: string): Promise<number> {
    return this.ranked(board).filter((e) => compareRankKey(e.rankKey as string, rankKey) < 0).length;
  }

  async countEntries(board: string): Promise<number> {
    return this.ranked(board).length;
  }

  async listEntriesByPlayer(playerId: string): Promise<LeaderboardItem[]> {
    return [...this.entries.values()]
      .filter((e) => e.playerId === playerId)
      .sort((a, b) => (a.board < b.board ? -1 : a.board > b.board ? 1 : 0))
      .map((e) => MemoryStore.clone(e));
  }
}
