import { describe, expect, it } from 'vitest';
import { resolveSettings, scoreToPoints } from '../../core/src/index';
import { ApiError } from '../src/errors';
import { minimumDurationMs } from '../src/verify';
import {
  CONFIG,
  PLAYER_A,
  PLAYER_B,
  PERIOD_END,
  PERIOD_START,
  QUESTIONS,
  answerAllCorrect,
  answerAllWrong,
  leaveAll,
  makePeriod,
  makeWorld,
  playRun,
  startAndFinish,
} from './helpers';

async function expectApiError(promise: Promise<unknown>, status: number, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const api = error as ApiError;
    expect([api.status, api.code]).toEqual([status, code]);
    return;
  }
  throw new Error(`expected ${status} ${code}`);
}

describe('今週の問題', () => {
  it('UTC の現在時刻に当たるピリオドを、指定した言語の分だけ返す', async () => {
    const world = await makeWorld();
    const res = await world.service.getCurrentPeriod({ locale: 'en' });
    expect(res.period.id).toBe(world.period.id);
    expect(res.resolvedVia).toBe('clock');
    expect(res.questions).toHaveLength(5);
    expect(res.questions[0]).toEqual({
      id: 'q1',
      category: 'test',
      difficulty: 'beginner',
      text: QUESTIONS[0]?.locales.en.text,
      choices: ['a', 'b', 'c', 'd'],
      decisionPoint: 4,
      answerIndex: 0,
    });
    // もう一方の言語は返さない
    expect(JSON.stringify(res)).not.toContain(QUESTIONS[0]?.locales.ja.text);
    expect(res.settings.msPerChar).toBe(50);
  });

  it('開始前のピリオドの問題は返さない（時刻でも、Config で固定しても）', async () => {
    const world = await makeWorld();
    world.clock.ms = PERIOD_START - 1;
    await expectApiError(world.service.getCurrentPeriod({ locale: 'ja' }), 404, 'NO_ACTIVE_PERIOD');
    await world.store.putConfig({ ...CONFIG, activePeriodId: world.period.id });
    await expectApiError(world.service.getCurrentPeriod({ locale: 'ja' }), 403, 'PERIOD_NOT_STARTED');
  });

  it('Config.activePeriodId があればそれを優先する', async () => {
    const world = await makeWorld();
    const other = makePeriod({ id: 'test-P02', startsAt: '2026-10-26T00:00:00Z', endsAt: '2026-11-02T00:00:00Z' });
    await world.store.putPeriod({ period: other, questions: QUESTIONS });
    world.clock.ms = Date.parse(other.startsAt) + 1000;
    expect((await world.service.getCurrentPeriod({ locale: 'ja' })).period.id).toBe('test-P02');
    await world.store.putConfig({ ...CONFIG, activePeriodId: world.period.id });
    const fixed = await world.service.getCurrentPeriod({ locale: 'ja' });
    expect([fixed.period.id, fixed.resolvedVia]).toEqual([world.period.id, 'config']);
    await expectApiError(world.service.getCurrentPeriod({ locale: 'xx' }), 400, 'INVALID_LOCALE');
  });
});

describe('走行開始', () => {
  it('ピリオドの外では始められない', async () => {
    const world = await makeWorld();
    world.clock.ms = PERIOD_END;
    await expectApiError(
      world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' }),
      403,
      'PERIOD_CLOSED',
    );
  });

  it('知らないピリオドや壊れた入力は弾く', async () => {
    const world = await makeWorld();
    await expectApiError(world.service.startRun({ playerId: PLAYER_A, periodId: 'nope', locale: 'ja' }), 404, 'PERIOD_NOT_FOUND');
    await expectApiError(world.service.startRun({ playerId: 'x', periodId: world.period.id, locale: 'ja' }), 400, 'INVALID_PLAYER_ID');
    await expectApiError(world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'fr' }), 400, 'INVALID_LOCALE');
    await expectApiError(world.service.startRun('{not json'), 400, 'INVALID_BODY');
    await expectApiError(world.service.startRun([1, 2]), 400, 'INVALID_BODY');
  });

  it('開始した時点で1回と数え、言語ごとに数える', async () => {
    const world = await makeWorld();
    const first = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja', seed: 42 });
    const second = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const english = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'en' });
    expect(first.seed).toBe(42);
    expect([first.attemptNumber, second.attemptNumber, english.attemptNumber]).toEqual([1, 2, 1]);
    expect(first.settings).toEqual({ answerWindowMs: 5_000, msPerChar: 150, inputLockMs: 200 });
    expect(first.serverStartedAt).toBe(new Date(world.clock.ms).toISOString());
    expect(first.displayName).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+-\d{4}$/);
  });

  it('同じ playerId からの開始が短時間に多すぎれば拒否する', async () => {
    const world = await makeWorld({}, { startRateLimit: { windowSec: 60, max: 2 } });
    const body = { playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' };
    await world.service.startRun(body);
    world.clock.ms += 10_000;
    await world.service.startRun(body);
    await expectApiError(world.service.startRun(body), 429, 'TOO_MANY_STARTS');
    // 他の人には影響しない。時間が過ぎればまた始められる
    await world.service.startRun({ ...body, playerId: PLAYER_B });
    world.clock.ms += 61_000;
    await world.service.startRun(body);
  });
});

describe('走行終了', () => {
  it('全問正解の走行がランキングに載り、スコア・タイム・正答数・順位が返る', async () => {
    const world = await makeWorld();
    const { played, finish } = await startAndFinish(world, PLAYER_A, answerAllCorrect);
    expect(finish.score).toBeCloseTo(played.score, 10);
    expect(finish.points).toBe(scoreToPoints(played.score));
    expect(finish.timeMs).toBe(played.totalMs + 250);
    expect(finish.correctCount).toBe(5);
    expect(finish.suspicious).toBe(false);
    expect(finish.isNewBest).toBe(true);
    expect([finish.rank, finish.entrants, finish.duplicate]).toEqual([1, 1, false]);

    const board = await world.service.getLeaderboard({ periodId: world.period.id, locale: 'ja', playerId: PLAYER_A });
    expect(board.top).toHaveLength(1);
    expect(board.me?.rank).toBe(1);
    expect(board.me?.bestPoints).toBe(finish.points);
  });

  it('全問時間切れの走行は 0 点で、記録には残る', async () => {
    const world = await makeWorld();
    const { finish } = await startAndFinish(world, PLAYER_A, leaveAll);
    expect([finish.score, finish.correctCount, finish.timedOutCount]).toEqual([0, 0, 5]);
    expect(finish.suspicious).toBe(false);
    expect(finish.rank).toBe(1);
    const stats = await world.service.getPlayerStats(PLAYER_A, {});
    expect(stats.totals).toEqual({ points: 0, runs: 1, answered: 5, correct: 0, accuracy: 0 });
  });

  it('2回目が下回ってもベストと1回目のスコアは残り、累計だけ足される', async () => {
    const world = await makeWorld();
    const best = await startAndFinish(world, PLAYER_A, answerAllCorrect);
    const worse = await startAndFinish(world, PLAYER_A, (q) => ({ choice: q.answerIndex, delayMs: 3_000 }));
    expect(worse.finish.isNewBest).toBe(false);
    expect(worse.finish.bestScore).toBeCloseTo(best.finish.score, 10);
    expect(worse.finish.attemptNumber).toBe(2);

    const stats = await world.service.getPlayerStats(PLAYER_A, { periodId: world.period.id });
    expect(stats.totals).toEqual({ points: 0, runs: 2, answered: 10, correct: 10, accuracy: 1 });
    expect(stats.best?.score).toBeCloseTo(best.finish.score, 10);
    const week = stats.current?.byLocale.ja;
    expect(week?.firstScore).toBeCloseTo(best.finish.score, 10);
    expect([week?.attempts, week?.startedAttempts, week?.rank]).toEqual([2, 2, 1]);
    expect(stats.current?.byLocale.en).toBeNull();
  });

  it('アプリの correct と score は信用せず、選んだ番号から判定し直す', async () => {
    const world = await makeWorld();
    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed, 'ja', world.period, answerAllWrong);
    const tampered = played.answers.map((a) => ({ ...a, correct: true }));
    world.clock.ms += played.totalMs + 250;
    const finish = await world.service.finishRun({ runId: start.runId, answers: tampered, score: 1 });
    expect(finish.correctCount).toBe(0);
    expect(finish.score).toBe(0);
  });

  it('問題数が合わない・知らない問題ID・出題順の違いは決まったエラーで弾く', async () => {
    const world = await makeWorld();
    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed, 'ja', world.period, answerAllCorrect);
    world.clock.ms += played.totalMs + 250;
    const finish = (answers: unknown) => world.service.finishRun({ runId: start.runId, answers });
    await expectApiError(finish(played.answers.slice(0, 4)), 400, 'INCOMPLETE_RUN');
    await expectApiError(finish('nope'), 400, 'INVALID_ANSWERS');
    await expectApiError(finish([...played.answers.slice(0, 4), { ...played.answers[4], questionId: 'q999' }]), 400, 'UNKNOWN_QUESTION');
    await expectApiError(finish(playRun(start.seed + 1, 'ja', world.period, answerAllCorrect).answers), 400, 'ORDER_MISMATCH');
    await expectApiError(finish(played.answers.map((a) => ({ ...a, chosenIndex: 9 }))), 400, 'INVALID_ANSWERS');
    await expectApiError(world.service.finishRun({ runId: 'no-such-run', answers: played.answers }), 404, 'RUN_NOT_FOUND');
    await expectApiError(world.service.finishRun({ answers: played.answers }), 400, 'INVALID_RUN_ID');
    // 他人の playerId からは見えない
    await expectApiError(world.service.finishRun({ runId: start.runId, playerId: PLAYER_B, answers: played.answers }), 404, 'RUN_NOT_FOUND');
  });

  it('理論上の最短時間より速い記録は suspicious として残し、順位に入れない', async () => {
    const world = await makeWorld();
    const settings = resolveSettings(CONFIG, world.period, 'ja');
    // 確定位置 2,3,4,5,6 文字 × 150ms ＝ 3000ms、係数 0.5 で 1500ms
    expect(minimumDurationMs(QUESTIONS, 'ja', settings, CONFIG.minTimeFactor)).toBe(1_500);

    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed, 'ja', world.period, answerAllCorrect);
    world.clock.ms += 1_000; // 1秒で終わったことにする
    const finish = await world.service.finishRun({ runId: start.runId, answers: played.answers });
    expect(finish.suspicious).toBe(true);
    expect(finish.suspiciousReason).toBe('TOO_FAST');
    expect([finish.rank, finish.bestScore, finish.isNewBest]).toEqual([null, null, false]);
    expect(finish.score).toBeGreaterThan(0);

    const run = await world.store.getRun(start.runId);
    expect([run?.status, run?.suspicious, run?.answers?.length]).toEqual(['finished', true, 5]);
    const board = await world.service.getLeaderboard({ periodId: world.period.id, locale: 'ja', playerId: PLAYER_A });
    expect([board.entrants, board.top.length, board.me]).toEqual([0, 0, null]);

    // 累計には足され、firstScore は付かない。次の正当な走行がベストと1回目のスコアになる
    const legit = await startAndFinish(world, PLAYER_A, answerAllCorrect);
    expect([legit.finish.rank, legit.finish.isNewBest, legit.finish.attemptNumber]).toEqual([1, true, 2]);
    const stats = await world.service.getPlayerStats(PLAYER_A, { periodId: world.period.id });
    expect(stats.totals.runs).toBe(2);
    expect(stats.current?.byLocale.ja?.firstScore).toBeCloseTo(legit.finish.score, 10);
  });

  it('アプリが測った時間がサーバーの時間より長すぎれば弾く', async () => {
    const world = await makeWorld();
    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed, 'ja', world.period, (q) => ({ choice: q.answerIndex, delayMs: 4_000 }));
    world.clock.ms += 5 * 200 + 1_000;
    await expectApiError(
      world.service.finishRun({ runId: start.runId, answers: played.answers }),
      400,
      'CLOCK_MISMATCH',
    );
  });

  it('同じ runId の finish を2回呼んでも二重に数えず、同じ結果を返す', async () => {
    const world = await makeWorld();
    const { start, played, finish } = await startAndFinish(world, PLAYER_A, answerAllCorrect);
    world.clock.ms += 60_000;
    const again = await world.service.finishRun({ runId: start.runId, answers: played.answers });
    expect(again.duplicate).toBe(true);
    expect(again.score).toBeCloseTo(finish.score, 10);
    expect([again.timeMs, again.rank, again.attemptNumber]).toEqual([finish.timeMs, 1, 1]);
    // パス版（/runs/{runId}/finish）でも同じ
    const viaPath = await world.service.finishRun({ playerId: PLAYER_A, answers: played.answers }, start.runId);
    expect(viaPath.duplicate).toBe(true);
    const stats = await world.service.getPlayerStats(PLAYER_A, {});
    expect(stats.totals.runs).toBe(1);
    expect(stats.totals.answered).toBe(5);
  });

  it('始めてから長く経ちすぎた走行は受け付けない', async () => {
    const world = await makeWorld();
    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed, 'ja', world.period, answerAllCorrect);
    world.clock.ms += 60 * 60_000;
    await expectApiError(
      world.service.finishRun({ runId: start.runId, answers: played.answers }),
      403,
      'RUN_EXPIRED',
    );
  });
});

describe('激ムズウィーク', () => {
  const hard = { isHardWeek: true, answerWindowSec: 10, maxAttempts: 2, retryWindowMin: 60 };

  it('猶予は10秒。挑戦回数の上限を超えると拒否する', async () => {
    const world = await makeWorld(hard);
    const first = await startAndFinish(world, PLAYER_A, answerAllCorrect);
    expect(first.start.settings.answerWindowMs).toBe(10_000);
    expect(first.start.retryDeadline).toBeNull();
    const second = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const firstRun = await world.store.getRun(first.start.runId);
    const firstFinishedAt = Date.parse(firstRun?.serverFinishedAt ?? '');
    expect(second.retryDeadline).toBe(new Date(firstFinishedAt + 60 * 60_000).toISOString());
    await expectApiError(
      world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' }),
      403,
      'MAX_ATTEMPTS',
    );
  });

  it('1回目が終わって60分を過ぎたら2回目は拒否する', async () => {
    const world = await makeWorld(hard);
    await startAndFinish(world, PLAYER_A, answerAllCorrect);
    world.clock.ms += 61 * 60_000;
    await expectApiError(
      world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' }),
      403,
      'RETRY_WINDOW_EXPIRED',
    );
  });

  it('途中で終わった走行も1回目として数え、その開始時刻から60分が期限になる', async () => {
    const world = await makeWorld(hard);
    const abandoned = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    world.clock.ms += 30 * 60_000;
    const second = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    expect(second.attemptNumber).toBe(2);
    expect(second.retryDeadline).toBe(new Date(Date.parse(abandoned.serverStartedAt) + 60 * 60_000).toISOString());
    world.clock.ms += 31 * 60_000;
    await expectApiError(
      world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' }),
      403,
      'MAX_ATTEMPTS',
    );
  });
});

describe('ランキングと集計', () => {
  it('同スコアなら、ベストを出した挑戦回数が少ないほうが上', async () => {
    const world = await makeWorld();
    // A は1回目に全問正解、B は1回目を外して2回目に全問正解（同じ押し方なので同スコア）
    await startAndFinish(world, PLAYER_A, answerAllCorrect);
    await startAndFinish(world, PLAYER_B, answerAllWrong);
    const b = await startAndFinish(world, PLAYER_B, answerAllCorrect);
    expect(b.finish.rank).toBe(2);

    const board = await world.service.getLeaderboard({ periodId: world.period.id, locale: 'ja', playerId: PLAYER_B });
    expect(board.top.map((e) => e.rank)).toEqual([1, 2]);
    expect(board.top[0]?.bestAttemptNumber).toBe(1);
    expect(board.top[1]?.bestAttemptNumber).toBe(2);
    expect(board.top[0]?.bestScore).toBeCloseTo(board.top[1]?.bestScore ?? -1, 10);
    expect(board.me?.rank).toBe(2);
    // 他人の匿名IDは返さない（IDがそのまま本人確認になるため）
    expect(JSON.stringify(board)).not.toContain(PLAYER_A);
  });

  it('週の終わりの集計でポイントが付き、個人成績に合計が出る', async () => {
    const world = await makeWorld();
    await startAndFinish(world, PLAYER_A, answerAllCorrect);
    await startAndFinish(world, PLAYER_B, answerAllWrong);

    world.clock.ms = PERIOD_END + 10 * 60_000;
    const results = await world.service.aggregateEnded();
    expect(results).toHaveLength(1);
    expect(results[0]?.perLocale).toEqual({ ja: 2, en: 0 });

    const a = await world.service.getPlayerStats(PLAYER_A, {});
    const b = await world.service.getPlayerStats(PLAYER_B, {});
    // 2人なら1位は上位50%（35点）、2位は完走（20点）。3部門とも同じ順位
    expect(a.totals.points).toBe(Math.round(35 * 1 + 35 * 0.5 + 35 * 0.5));
    expect(b.totals.points).toBe(Math.round(20 * 1 + 20 * 0.5 + 20 * 0.5));
    expect(a.periods[0]?.weekPoints?.best.rank).toBe(1);
    // ピリオドが終わっているので「今週」は無い
    expect(a.current).toBeNull();

    // もう一度動かしても二重に足されない
    await world.service.aggregateEnded();
    expect((await world.service.getPlayerStats(PLAYER_A, {})).totals.points).toBe(70);
  });

  it('激ムズウィークはポイントが3倍', async () => {
    const world = await makeWorld({ isHardWeek: true, answerWindowSec: 10, maxAttempts: 2, retryWindowMin: 60 });
    await startAndFinish(world, PLAYER_A, answerAllCorrect);
    const result = await world.service.aggregatePeriod(world.period.id);
    expect(result.isHardWeek).toBe(true);
    const a = await world.service.getPlayerStats(PLAYER_A, {});
    // 1人だけなら各部門とも完走の点（20）。(20 + 10 + 10) × 3
    expect(a.totals.points).toBe(120);
  });
});
