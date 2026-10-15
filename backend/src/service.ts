import { DEFAULT_CONFIG, LOCALES, resolveSettings, scoreToPoints } from '../../core/src/index';
import type { Locale, Period, Question, RunSettings } from '../../core/src/index';
import { badRequest, conflict, forbidden, notFound } from './errors';
import { displayNameFor } from './names';
import { computePoints } from './points';
import { rankKey } from './rank-key';
import type { Store } from './store';
import { DEFAULT_POINTS_CONFIG, boardKey } from './types';
import type { LeaderboardItem, PointsResult, RunItem, ServerConfig } from './types';
import {
  parseBody,
  parseLocale,
  parseOptionalNonNegativeInt,
  parsePeriodId,
  parsePlayerId,
  parseSeed,
} from './validate';
import { maximumDurationMs, minimumDurationMs, verifyRun } from './verify';

/** 走行終了を受け付ける猶予。理論上の最長時間にこれを足した時刻まで */
export const FINISH_GRACE_MS = 5 * 60_000;
/** 週の集計で、終わってからこの日数以内のピリオドを対象にする */
export const AGGREGATE_LOOKBACK_DAYS = 8;
/** ランキング画面に出す人数（設計書 §10：上位10人＋自分） */
export const TOP_COUNT = 10;

export interface ServiceDeps {
  store: Store;
  now: () => Date;
  newId: () => string;
}

export interface StartRunResponse {
  runId: string;
  attemptNumber: number;
  serverStartedAt: string;
  seed: number;
  displayName: string;
  settings: RunSettings;
  period: { id: string; isHardWeek: boolean; endsAt: string; maxAttempts: number | null };
  /** 激ムズウィークで2回目が始められる期限。無ければ null */
  retryDeadline: string | null;
}

export interface FinishRunResponse {
  runId: string;
  attemptNumber: number;
  score: number;
  /** 画面表示用（1000点満点） */
  points: number;
  correctCount: number;
  timedOutCount: number;
  serverDurationMs: number;
  isNewBest: boolean;
  bestScore: number;
  rank: number;
  entrants: number;
}

export interface RankedEntry {
  rank: number;
  displayName: string;
  bestScore: number;
  bestPoints: number;
  bestAttemptNumber: number;
  attempts: number;
  weekPoints: number | null;
}

export interface LeaderboardResponse {
  periodId: string;
  locale: Locale;
  isHardWeek: boolean;
  entrants: number;
  top: RankedEntry[];
  me: RankedEntry | null;
}

export interface PeriodSummary {
  periodId: string;
  locale: Locale;
  bestScore: number;
  bestPoints: number;
  firstScore: number;
  accuracy: number;
  attempts: number;
  weekPoints: PointsResult | null;
}

export interface PlayerStatsResponse {
  playerId: string;
  displayName: string;
  totals: { points: number; runs: number; answered: number; correct: number };
  periods: PeriodSummary[];
  current: (PeriodSummary & { rank: number; entrants: number }) | null;
}

export interface AggregateResponse {
  periodId: string;
  isHardWeek: boolean;
  perLocale: Record<Locale, number>;
}

function periodWindow(period: Period): { startsAt: number; endsAt: number } {
  return { startsAt: Date.parse(period.startsAt), endsAt: Date.parse(period.endsAt) };
}

function toRanked(entry: LeaderboardItem, rank: number): RankedEntry {
  return {
    rank,
    displayName: entry.displayName,
    bestScore: entry.bestScore,
    bestPoints: scoreToPoints(entry.bestScore),
    bestAttemptNumber: entry.bestAttemptNumber,
    attempts: entry.attempts,
    weekPoints: entry.points?.total ?? null,
  };
}

function toSummary(entry: LeaderboardItem): PeriodSummary {
  return {
    periodId: entry.periodId,
    locale: entry.locale,
    bestScore: entry.bestScore,
    bestPoints: scoreToPoints(entry.bestScore),
    firstScore: entry.firstScore,
    accuracy: entry.totalAnswered > 0 ? entry.totalCorrect / entry.totalAnswered : 0,
    attempts: entry.attempts,
    weekPoints: entry.points ?? null,
  };
}

/**
 * 公開する4つの API と、週の終わりの集計（設計書 §12「アクセスの境界」）。
 * 時計と保存先は外から渡すので、テストでは時刻を固定して動かせる。
 */
export class GameService {
  private readonly store: Store;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(deps: ServiceDeps) {
    this.store = deps.store;
    this.now = deps.now;
    this.newId = deps.newId;
  }

  private async config(): Promise<ServerConfig> {
    const saved = await this.store.getConfig();
    return saved ?? { ...DEFAULT_CONFIG, points: DEFAULT_POINTS_CONFIG };
  }

  private async period(periodId: string): Promise<Period> {
    const period = await this.store.getPeriod(periodId);
    if (!period) throw notFound('PERIOD_NOT_FOUND', 'unknown period');
    return period;
  }

  private async questions(period: Period): Promise<Question[]> {
    const questions = await this.store.getQuestions(period.id);
    if (!questions || questions.length === 0) throw notFound('QUESTIONS_NOT_FOUND', 'no questions for this period');
    return questions;
  }

  /** 走行開始。回数と期限の判定はここ（サーバー）で行う */
  async startRun(rawBody: unknown): Promise<StartRunResponse> {
    const body = parseBody(rawBody);
    const playerId = parsePlayerId(body.playerId);
    const periodId = parsePeriodId(body.periodId);
    const locale = parseLocale(body.locale);
    const requestedSeed = parseSeed(body.seed);

    const now = this.now();
    const period = await this.period(periodId);
    const window = periodWindow(period);
    if (now.getTime() < window.startsAt || now.getTime() >= window.endsAt) {
      throw forbidden('PERIOD_CLOSED', 'this period is not open');
    }

    const runs = await this.store.listRuns(playerId, { periodId, locale });
    const attemptNumber = runs.length + 1;
    const maxAttempts = period.maxAttempts ?? null;
    let retryDeadline: string | null = null;

    if (maxAttempts !== null) {
      if (runs.length >= maxAttempts) {
        throw forbidden('ATTEMPTS_EXHAUSTED', 'no attempts left for this period');
      }
      if (runs.length > 0 && period.retryWindowMin !== undefined) {
        const first = runs[0] as RunItem;
        // 途中で終わった走行は、その開始時刻を基準にする（終了時刻が無いため）
        const reference = Date.parse(first.serverFinishedAt ?? first.serverStartedAt);
        const deadline = reference + period.retryWindowMin * 60_000;
        if (now.getTime() > deadline) {
          throw forbidden('RETRY_WINDOW_CLOSED', 'the retry window for this period has closed');
        }
        retryDeadline = new Date(deadline).toISOString();
      }
    }

    const config = await this.config();
    const settings = resolveSettings(config, period, locale);
    const seed = requestedSeed ?? Math.floor(Math.random() * 0x100000000);
    const serverStartedAt = now.toISOString();
    // 開始時刻を先頭に置いて、履歴が時刻順に並ぶようにする
    const runId = `${String(now.getTime()).padStart(13, '0')}-${this.newId()}`;

    await this.store.putRun({
      runId,
      playerId,
      periodId,
      locale,
      attemptNumber,
      status: 'started',
      serverStartedAt,
      seed,
    });

    return {
      runId,
      attemptNumber,
      serverStartedAt,
      seed,
      displayName: displayNameFor(playerId),
      settings,
      period: { id: period.id, isHardWeek: period.isHardWeek, endsAt: period.endsAt, maxAttempts },
      retryDeadline,
    };
  }

  /** 走行終了。回答を検証し、スコアを計算し直し、ランキングを更新する */
  async finishRun(runId: string, rawBody: unknown): Promise<FinishRunResponse> {
    const body = parseBody(rawBody);
    const playerId = parsePlayerId(body.playerId);
    parseOptionalNonNegativeInt(body.clientTotalMs, 'INVALID_TOTAL', 'clientTotalMs');

    const run = await this.store.getRun(playerId, runId);
    if (!run) throw notFound('RUN_NOT_FOUND', 'unknown run');
    if (run.status !== 'started') throw conflict('RUN_ALREADY_FINISHED', 'this run has already been finished');
    if (run.seed === undefined) throw conflict('RUN_WITHOUT_SEED', 'this run has no seed');

    const now = this.now();
    const period = await this.period(run.periodId);
    const questions = await this.questions(period);
    const config = await this.config();
    const settings = resolveSettings(config, period, run.locale);

    const serverDurationMs = now.getTime() - Date.parse(run.serverStartedAt);
    const maxMs = maximumDurationMs(questions, run.locale, settings) + FINISH_GRACE_MS;
    if (serverDurationMs > maxMs) throw forbidden('RUN_EXPIRED', 'this run took too long to finish');

    const verified = verifyRun({
      questions,
      locale: run.locale,
      settings,
      seed: run.seed,
      answers: body.answers,
      serverDurationMs,
    });
    if (!verified.ok) throw badRequest(verified.code, verified.message);

    const serverFinishedAt = now.toISOString();
    const finished: RunItem = {
      ...run,
      status: 'finished',
      serverFinishedAt,
      serverDurationMs,
      answers: verified.run.answers,
      score: verified.run.score,
      correctCount: verified.run.correctCount,
      timedOutCount: verified.run.timedOutCount,
      clientTotalMs: verified.run.clientTotalMs,
    };

    // 理論上の最短時間を下回る記録は、生データは残したうえで順位に入れない（設計書 §12）
    const minMs = minimumDurationMs(questions.length, settings);
    if (serverDurationMs < minMs) {
      await this.store.putRun({ ...finished, status: 'rejected', rejectReason: 'TOO_FAST' });
      throw forbidden('RUN_TOO_FAST', 'this run was faster than is physically possible');
    }

    await this.store.putRun(finished);
    const { entry, isNewBest } = await this.updateEntry(finished, questions.length);
    const rank = (await this.store.countBetter(entry.board, entry.rankKey)) + 1;
    const entrants = await this.store.countEntries(entry.board);

    return {
      runId,
      attemptNumber: run.attemptNumber,
      score: verified.run.score,
      points: scoreToPoints(verified.run.score),
      correctCount: verified.run.correctCount,
      timedOutCount: verified.run.timedOutCount,
      serverDurationMs,
      isNewBest,
      bestScore: entry.bestScore,
      rank,
      entrants,
    };
  }

  /** ランキング行を更新する。同時に2つ終わっても取りこぼさないよう、条件付きで書いて失敗したらやり直す */
  private async updateEntry(
    run: RunItem,
    questionCount: number,
  ): Promise<{ entry: LeaderboardItem; isNewBest: boolean }> {
    const board = boardKey(run.periodId, run.locale);
    const score = run.score as number;
    const correct = run.correctCount as number;

    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.store.getEntry(board, run.playerId);
      let next: LeaderboardItem;
      let isNewBest: boolean;
      if (current === null) {
        isNewBest = true;
        next = {
          board,
          playerId: run.playerId,
          displayName: displayNameFor(run.playerId),
          periodId: run.periodId,
          locale: run.locale,
          rankKey: rankKey(score, run.attemptNumber),
          bestScore: score,
          bestRunId: run.runId,
          bestAttemptNumber: run.attemptNumber,
          bestCorrect: correct,
          bestAnswered: questionCount,
          firstScore: score,
          totalCorrect: correct,
          totalAnswered: questionCount,
          attempts: 1,
        };
      } else {
        // 同スコアならベストは書き換えない（先に出した挑戦が上）
        isNewBest = score > current.bestScore;
        next = {
          ...current,
          totalCorrect: current.totalCorrect + correct,
          totalAnswered: current.totalAnswered + questionCount,
          attempts: current.attempts + 1,
        };
        if (isNewBest) {
          next.rankKey = rankKey(score, run.attemptNumber);
          next.bestScore = score;
          next.bestRunId = run.runId;
          next.bestAttemptNumber = run.attemptNumber;
          next.bestCorrect = correct;
          next.bestAnswered = questionCount;
        }
      }
      const written = await this.store.putEntry(next, current === null ? null : current.attempts);
      if (written) return { entry: next, isNewBest };
    }
    throw conflict('ENTRY_CONFLICT', 'could not update the leaderboard, please retry');
  }

  /** ランキング：上位10人と自分（設計書 §10） */
  async getLeaderboard(query: Record<string, unknown>): Promise<LeaderboardResponse> {
    const periodId = parsePeriodId(query.periodId);
    const locale = parseLocale(query.locale);
    const playerId = query.playerId === undefined || query.playerId === '' ? null : parsePlayerId(query.playerId);

    const period = await this.period(periodId);
    const board = boardKey(periodId, locale);
    const [top, entrants] = await Promise.all([
      this.store.listEntriesByRank(board, TOP_COUNT),
      this.store.countEntries(board),
    ]);

    let me: RankedEntry | null = null;
    if (playerId !== null) {
      const entry = await this.store.getEntry(board, playerId);
      if (entry) {
        const rank = (await this.store.countBetter(board, entry.rankKey)) + 1;
        me = toRanked(entry, rank);
      }
    }

    return {
      periodId,
      locale,
      isHardWeek: period.isHardWeek,
      entrants,
      top: top.map((entry, i) => toRanked(entry, i + 1)),
      me,
    };
  }

  /** 個人成績（設計書 §10「個人」）。連続プレイ日数は端末内で持つので含めない */
  async getPlayerStats(rawPlayerId: unknown, query: Record<string, unknown>): Promise<PlayerStatsResponse> {
    const playerId = parsePlayerId(rawPlayerId);
    const entries = await this.store.listEntriesByPlayer(playerId);

    const totals = { points: 0, runs: 0, answered: 0, correct: 0 };
    for (const entry of entries) {
      totals.points += entry.points?.total ?? 0;
      totals.runs += entry.attempts;
      totals.answered += entry.totalAnswered;
      totals.correct += entry.totalCorrect;
    }

    let current: PlayerStatsResponse['current'] = null;
    if (query.periodId !== undefined && query.periodId !== '') {
      const periodId = parsePeriodId(query.periodId);
      const locale = parseLocale(query.locale);
      const board = boardKey(periodId, locale);
      const entry = await this.store.getEntry(board, playerId);
      if (entry) {
        const [better, entrants] = await Promise.all([
          this.store.countBetter(board, entry.rankKey),
          this.store.countEntries(board),
        ]);
        current = { ...toSummary(entry), rank: better + 1, entrants };
      }
    }

    return {
      playerId,
      displayName: displayNameFor(playerId),
      totals,
      periods: entries.map(toSummary),
      current,
    };
  }

  /** 週の終わりの集計：3部門の上位何%かを出してポイントを付ける（言語別） */
  async aggregatePeriod(periodId: string): Promise<AggregateResponse> {
    const period = await this.period(periodId);
    const config = await this.config();
    const now = this.now();
    const perLocale = { ja: 0, en: 0 } as Record<Locale, number>;

    for (const locale of LOCALES) {
      const board = boardKey(periodId, locale);
      const entries = await this.store.listEntriesByRank(board);
      const results = computePoints(entries, period.isHardWeek, config.points, now);
      for (const [playerId, points] of results) {
        await this.store.setEntryPoints(board, playerId, points);
      }
      perLocale[locale] = entries.length;
    }
    return { periodId, isHardWeek: period.isHardWeek, perLocale };
  }

  /** 定期実行用：最近終わったピリオドをまとめて集計する */
  async aggregateEnded(): Promise<AggregateResponse[]> {
    const now = this.now().getTime();
    const since = now - AGGREGATE_LOOKBACK_DAYS * 86_400_000;
    const periods = await this.store.listPeriods();
    const ended = periods
      .filter((p) => {
        const endsAt = Date.parse(p.endsAt);
        return endsAt <= now && endsAt > since;
      })
      .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
    const out: AggregateResponse[] = [];
    for (const period of ended) out.push(await this.aggregatePeriod(period.id));
    return out;
  }
}
