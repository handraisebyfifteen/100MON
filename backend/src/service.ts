import { LOCALES, resolveSettings, scoreToPoints } from '../../core/src/index';
import type { Locale, Period, Question, RunSettings } from '../../core/src/index';
import { badRequest, conflict, forbidden, notFound, tooMany } from './errors';
import { displayNameFor } from './names';
import { computePoints } from './points';
import { rankKey } from './rank-key';
import type { Store } from './store';
import { DEFAULT_SERVER_CONFIG, boardKey, isRanked } from './types';
import type { LeaderboardItem, PeriodItem, PointsResult, RunItem, ServerConfig } from './types';
import {
  parseBody,
  parseLocale,
  parseOptionalNonNegativeInt,
  parsePeriodId,
  parsePlayerId,
  parseRunId,
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

/** アプリに返すピリオドの項目（questionIds は questions に含まれるので省く） */
export interface PeriodInfo {
  id: string;
  startsAt: string;
  endsAt: string;
  quarter: number;
  isHardWeek: boolean;
  answerWindowSec: number;
  maxAttempts: number | null;
  retryWindowMin: number | null;
}

/** 指定された言語の分だけに絞った問題。answerIndex を返すのはハッカソン時点の割り切り（設計書 §18） */
export interface LocalizedQuestionOut {
  id: string;
  category: string;
  difficulty: string;
  text: string;
  choices: [string, string, string, string];
  decisionPoint: number;
  answerIndex: number;
}

export interface CurrentPeriodResponse {
  period: PeriodInfo;
  locale: Locale;
  settings: RunSettings;
  /** どう決めたか：Config.activePeriodId か、UTC の現在時刻か */
  resolvedVia: 'config' | 'clock';
  serverTime: string;
  questions: LocalizedQuestionOut[];
}

export interface StartRunResponse {
  runId: string;
  attemptNumber: number;
  serverStartedAt: string;
  seed: number;
  displayName: string;
  settings: RunSettings;
  period: PeriodInfo;
  /** 激ムズウィークで2回目が始められる期限。無ければ null */
  retryDeadline: string | null;
}

export interface FinishRunResponse {
  runId: string;
  attemptNumber: number;
  score: number;
  /** 画面表示用（1000点満点） */
  points: number;
  /** タイム＝サーバー時刻の（終了 − 開始） */
  timeMs: number;
  correctCount: number;
  timedOutCount: number;
  /** 理論上の最短時間を下回るなど。true のときは順位に入らない（記録は残す） */
  suspicious: boolean;
  suspiciousReason: string | null;
  isNewBest: boolean;
  bestScore: number | null;
  bestPoints: number | null;
  /** そのピリオド・その言語での現在の順位。順位に載っていなければ null */
  rank: number | null;
  entrants: number;
  /** 同じ runId の finish を2回目以降に呼んだとき true。二重には数えない */
  duplicate: boolean;
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
  bestScore: number | null;
  bestPoints: number | null;
  firstScore: number | null;
  /** 全走行の正解率（時間切れ含む） */
  accuracy: number;
  /** 走り終えた回数 */
  attempts: number;
  weekPoints: PointsResult | null;
}

export interface CurrentWeekSummary extends PeriodSummary {
  rank: number | null;
  entrants: number;
  /** 開始した回数（途中で終わった走行も含む） */
  startedAttempts: number;
}

export interface PlayerStatsResponse {
  playerId: string;
  displayName: string;
  totals: { points: number; runs: number; answered: number; correct: number; accuracy: number };
  /** 全ピリオドを通しての最高スコア */
  best: { periodId: string; locale: Locale; score: number; points: number } | null;
  periods: PeriodSummary[];
  /** 今週（query の periodId か、今のピリオド）の言語別の成績。該当が無ければ null */
  current: { periodId: string; byLocale: Record<Locale, CurrentWeekSummary | null> } | null;
}

export interface AggregateResponse {
  periodId: string;
  isHardWeek: boolean;
  perLocale: Record<Locale, number>;
}

function periodWindow(period: Period): { startsAt: number; endsAt: number } {
  return { startsAt: Date.parse(period.startsAt), endsAt: Date.parse(period.endsAt) };
}

function toPeriodInfo(period: Period, config: ServerConfig): PeriodInfo {
  return {
    id: period.id,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    quarter: period.quarter,
    isHardWeek: period.isHardWeek,
    answerWindowSec: period.answerWindowSec ?? config.answerWindowSec,
    maxAttempts: period.maxAttempts ?? null,
    retryWindowMin: period.retryWindowMin ?? null,
  };
}

function toLocalized(question: Question, locale: Locale): LocalizedQuestionOut {
  const l = question.locales[locale];
  return {
    id: question.id,
    category: question.category,
    difficulty: question.difficulty,
    text: l.text,
    choices: l.choices,
    decisionPoint: l.decisionPoint,
    answerIndex: question.answerIndex,
  };
}

function toRanked(entry: LeaderboardItem, rank: number): RankedEntry | null {
  if (!isRanked(entry)) return null;
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
    bestScore: entry.bestScore ?? null,
    bestPoints: entry.bestScore === undefined ? null : scoreToPoints(entry.bestScore),
    firstScore: entry.firstScore ?? null,
    accuracy: entry.totalAnswered > 0 ? entry.totalCorrect / entry.totalAnswered : 0,
    attempts: entry.attempts,
    weekPoints: entry.points ?? null,
  };
}

/**
 * 公開する5つの API と、週の終わりの集計（設計書 §12「アクセスの境界」）。
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
    return saved ?? DEFAULT_SERVER_CONFIG;
  }

  private async periodItem(periodId: string): Promise<PeriodItem> {
    const item = await this.store.getPeriod(periodId);
    if (!item) throw notFound('PERIOD_NOT_FOUND', 'unknown period');
    if (item.questions.length === 0) throw notFound('QUESTIONS_NOT_FOUND', 'no questions for this period');
    return item;
  }

  /**
   * 今週のピリオド。Config.activePeriodId があればそれ、無ければ UTC の現在時刻が
   * startsAt 以上 endsAt 未満のもの。開始前のピリオドは、どちらの経路でも返さない。
   */
  private async resolveCurrent(
    config: ServerConfig,
    now: Date,
  ): Promise<{ item: PeriodItem; resolvedVia: 'config' | 'clock' }> {
    if (config.activePeriodId) {
      const item = await this.periodItem(config.activePeriodId);
      if (now.getTime() < periodWindow(item.period).startsAt) {
        throw forbidden('PERIOD_NOT_STARTED', 'this period has not started yet');
      }
      return { item, resolvedVia: 'config' };
    }
    const open = (await this.store.listPeriods())
      .filter((p) => {
        const w = periodWindow(p);
        return now.getTime() >= w.startsAt && now.getTime() < w.endsAt;
      })
      .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
    const chosen = open[0];
    if (!chosen) throw notFound('NO_ACTIVE_PERIOD', 'no period is open right now');
    return { item: await this.periodItem(chosen.id), resolvedVia: 'clock' };
  }

  /** 今週のピリオドと、その100問（指定された言語の分だけ） */
  async getCurrentPeriod(query: Record<string, unknown>): Promise<CurrentPeriodResponse> {
    const locale = parseLocale(query.locale);
    const now = this.now();
    const config = await this.config();
    const { item, resolvedVia } = await this.resolveCurrent(config, now);
    return {
      period: toPeriodInfo(item.period, config),
      locale,
      settings: resolveSettings(config, item.period, locale),
      resolvedVia,
      serverTime: now.toISOString(),
      questions: item.questions.map((q) => toLocalized(q, locale)),
    };
  }

  /** 走行開始。開始した時点で1回の挑戦として数える。回数と期限の判定はここ（サーバー）で行う */
  async startRun(rawBody: unknown): Promise<StartRunResponse> {
    const body = parseBody(rawBody);
    const playerId = parsePlayerId(body.playerId);
    const periodId = parsePeriodId(body.periodId);
    const locale = parseLocale(body.locale);
    const requestedSeed = parseSeed(body.seed);

    const now = this.now();
    const { period } = await this.periodItem(periodId);
    const window = periodWindow(period);
    if (now.getTime() < window.startsAt || now.getTime() >= window.endsAt) {
      throw forbidden('PERIOD_CLOSED', 'this period is not open');
    }

    const config = await this.config();

    // 同じ playerId からの開始が短時間に多すぎれば拒否する（ピリオドや言語をまたいで数える）
    const limit = config.startRateLimit;
    const recent = await this.store.listRunsSince(playerId, now.getTime() - limit.windowSec * 1000);
    if (recent.length >= limit.max) {
      throw tooMany('TOO_MANY_STARTS', `at most ${limit.max} runs can be started in ${limit.windowSec} seconds`);
    }

    const runs = await this.store.listRuns(playerId, { periodId, locale });
    const attemptNumber = runs.length + 1;
    const maxAttempts = period.maxAttempts ?? null;
    let retryDeadline: string | null = null;

    if (maxAttempts !== null && runs.length >= maxAttempts) {
      throw forbidden('MAX_ATTEMPTS', `this period allows ${maxAttempts} attempts`);
    }
    if (runs.length > 0 && period.retryWindowMin !== undefined) {
      const first = runs[0] as RunItem;
      // 1回目が途中で終わって終了時刻が無いときは、その開始時刻を基準にする
      const reference = Date.parse(first.serverFinishedAt ?? first.serverStartedAt);
      const deadline = reference + period.retryWindowMin * 60_000;
      if (now.getTime() > deadline) {
        throw forbidden('RETRY_WINDOW_EXPIRED', 'the retry window for this period has expired');
      }
      retryDeadline = new Date(deadline).toISOString();
    }

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
      period: toPeriodInfo(period, config),
      retryDeadline,
    };
  }

  /**
   * 走行終了。回答を検証し、スコアを計算し直し、ランキングを更新する。
   * runId はパス（/runs/{runId}/finish）か本文（/runs/finish）のどちらで渡してもよい。
   */
  async finishRun(rawBody: unknown, runIdFromPath?: string): Promise<FinishRunResponse> {
    const body = parseBody(rawBody);
    const runId = parseRunId(runIdFromPath ?? body.runId);
    const playerId = body.playerId === undefined || body.playerId === null ? undefined : parsePlayerId(body.playerId);
    parseOptionalNonNegativeInt(body.clientTotalMs, 'INVALID_TOTAL', 'clientTotalMs');

    const run = await this.store.getRun(runId, playerId);
    if (!run || (playerId !== undefined && run.playerId !== playerId)) {
      throw notFound('RUN_NOT_FOUND', 'unknown run');
    }
    // 同じ runId の finish を2回呼ばれても、二重に数えず同じ結果を返す
    if (run.status === 'finished') return this.finishedResponse(run, { isNewBest: false, duplicate: true });

    const now = this.now();
    const { period, questions } = await this.periodItem(run.periodId);
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

    // 理論上の最短時間を下回る記録は、生データは残したうえで順位に入れない（設計書 §12）
    const minMs = minimumDurationMs(questions, run.locale, settings, config.minTimeFactor);
    const suspicious = serverDurationMs < minMs;

    const finished: RunItem = {
      ...run,
      status: 'finished',
      serverFinishedAt: now.toISOString(),
      serverDurationMs,
      answers: verified.run.answers,
      score: verified.run.score,
      correctCount: verified.run.correctCount,
      timedOutCount: verified.run.timedOutCount,
      clientTotalMs: verified.run.clientTotalMs,
      ...(suspicious ? { suspicious: true, suspiciousReason: 'TOO_FAST' } : {}),
    };

    const written = await this.store.finishRun(finished);
    if (!written) {
      // 同時に2回終わらせようとした。先に書けたほうの結果を返す
      const again = await this.store.getRun(runId, run.playerId);
      if (again && again.status === 'finished') return this.finishedResponse(again, { isNewBest: false, duplicate: true });
      throw conflict('RUN_CONFLICT', 'this run is being finished, please retry');
    }

    const isNewBest = await this.updateEntry(finished, questions.length);
    return this.finishedResponse(finished, { isNewBest, duplicate: false });
  }

  /** ランキング行を更新する。累計は ADD で足し、best 系はベストを更新したときだけ書く。suspicious は累計のみ */
  private async updateEntry(run: RunItem, questionCount: number): Promise<boolean> {
    const board = boardKey(run.periodId, run.locale);
    const score = run.score as number;
    const correct = run.correctCount as number;
    await this.store.recordRun({
      board,
      playerId: run.playerId,
      displayName: displayNameFor(run.playerId),
      periodId: run.periodId,
      locale: run.locale,
      correct,
      answered: questionCount,
      firstScore: run.suspicious ? null : score,
    });
    if (run.suspicious) return false;
    return this.store.updateBest(board, run.playerId, {
      rankKey: rankKey(score, run.attemptNumber),
      bestScore: score,
      bestRunId: run.runId,
      bestAttemptNumber: run.attemptNumber,
      bestCorrect: correct,
      bestAnswered: questionCount,
    });
  }

  private async finishedResponse(
    run: RunItem,
    flags: { isNewBest: boolean; duplicate: boolean },
  ): Promise<FinishRunResponse> {
    const board = boardKey(run.periodId, run.locale);
    const entry = await this.store.getEntry(board, run.playerId);
    const ranked = entry && isRanked(entry) ? entry : null;
    const [better, entrants] = await Promise.all([
      ranked ? this.store.countBetter(board, ranked.rankKey) : Promise.resolve(-1),
      this.store.countEntries(board),
    ]);
    const score = run.score ?? 0;
    return {
      runId: run.runId,
      attemptNumber: run.attemptNumber,
      score,
      points: scoreToPoints(score),
      timeMs: run.serverDurationMs ?? 0,
      correctCount: run.correctCount ?? 0,
      timedOutCount: run.timedOutCount ?? 0,
      suspicious: run.suspicious === true,
      suspiciousReason: run.suspiciousReason ?? null,
      isNewBest: flags.isNewBest,
      bestScore: ranked ? ranked.bestScore : null,
      bestPoints: ranked ? scoreToPoints(ranked.bestScore) : null,
      rank: ranked ? better + 1 : null,
      entrants,
      duplicate: flags.duplicate,
    };
  }

  /** ランキング：上位10人と自分（設計書 §10）。他人の playerId は返さない */
  async getLeaderboard(query: Record<string, unknown>): Promise<LeaderboardResponse> {
    const periodId = parsePeriodId(query.periodId);
    const locale = parseLocale(query.locale);
    const playerId = query.playerId === undefined || query.playerId === '' ? null : parsePlayerId(query.playerId);

    const { period } = await this.periodItem(periodId);
    const board = boardKey(periodId, locale);
    const [top, entrants] = await Promise.all([
      this.store.listEntriesByRank(board, TOP_COUNT),
      this.store.countEntries(board),
    ]);

    let me: RankedEntry | null = null;
    if (playerId !== null) {
      const entry = await this.store.getEntry(board, playerId);
      if (entry && isRanked(entry)) {
        const rank = (await this.store.countBetter(board, entry.rankKey)) + 1;
        me = toRanked(entry, rank);
      }
    }

    return {
      periodId,
      locale,
      isHardWeek: period.isHardWeek,
      entrants,
      top: top.map((entry, i) => toRanked(entry, i + 1)).filter((e): e is RankedEntry => e !== null),
      me,
    };
  }

  /** 個人成績（設計書 §10「個人」）。連続プレイ日数は端末内で持つので含めない */
  async getPlayerStats(rawPlayerId: unknown, query: Record<string, unknown>): Promise<PlayerStatsResponse> {
    const playerId = parsePlayerId(rawPlayerId);
    const entries = await this.store.listEntriesByPlayer(playerId);

    const totals = { points: 0, runs: 0, answered: 0, correct: 0, accuracy: 0 };
    let best: PlayerStatsResponse['best'] = null;
    for (const entry of entries) {
      totals.points += entry.points?.total ?? 0;
      totals.runs += entry.attempts;
      totals.answered += entry.totalAnswered;
      totals.correct += entry.totalCorrect;
      if (isRanked(entry) && (best === null || entry.bestScore > best.score)) {
        best = { periodId: entry.periodId, locale: entry.locale, score: entry.bestScore, points: scoreToPoints(entry.bestScore) };
      }
    }
    totals.accuracy = totals.answered > 0 ? totals.correct / totals.answered : 0;

    // 今週：query の periodId があればそれ、無ければ今のピリオド（無ければ null）
    let periodId: string | null = null;
    if (query.periodId !== undefined && query.periodId !== '') {
      periodId = parsePeriodId(query.periodId);
    } else {
      try {
        periodId = (await this.resolveCurrent(await this.config(), this.now())).item.period.id;
      } catch {
        periodId = null;
      }
    }

    let current: PlayerStatsResponse['current'] = null;
    if (periodId !== null) {
      const byLocale = { ja: null, en: null } as Record<Locale, CurrentWeekSummary | null>;
      for (const locale of LOCALES) {
        const board = boardKey(periodId, locale);
        const [entry, runs] = await Promise.all([
          this.store.getEntry(board, playerId),
          this.store.listRuns(playerId, { periodId, locale }),
        ]);
        if (!entry && runs.length === 0) continue;
        const ranked = entry && isRanked(entry) ? entry : null;
        const [better, entrants] = await Promise.all([
          ranked ? this.store.countBetter(board, ranked.rankKey) : Promise.resolve(-1),
          this.store.countEntries(board),
        ]);
        byLocale[locale] = {
          ...(entry
            ? toSummary(entry)
            : { periodId, locale, bestScore: null, bestPoints: null, firstScore: null, accuracy: 0, attempts: 0, weekPoints: null }),
          rank: ranked ? better + 1 : null,
          entrants,
          startedAttempts: runs.length,
        };
      }
      current = { periodId, byLocale };
    }

    return {
      playerId,
      displayName: displayNameFor(playerId),
      totals,
      best,
      periods: entries.map(toSummary),
      current,
    };
  }

  /** 週の終わりの集計：3部門の上位何%かを出してポイントを付ける（言語別）。順位に載っている人だけ */
  async aggregatePeriod(periodId: string): Promise<AggregateResponse> {
    const { period } = await this.periodItem(periodId);
    const config = await this.config();
    const now = this.now();
    const perLocale = { ja: 0, en: 0 } as Record<Locale, number>;

    for (const locale of LOCALES) {
      const board = boardKey(periodId, locale);
      const entries = (await this.store.listEntriesByRank(board)).filter(isRanked);
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
