import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors';
import {
  PLAYER_A,
  PLAYER_B,
  PERIOD_END,
  answerAllCorrect,
  answerAllWrong,
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
  });

  it('挑戦回数は言語ごとに数え、設定値とサーバー時刻を返す', async () => {
    const world = await makeWorld();
    const first = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja', seed: 42 });
    const second = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const english = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'en' });
    expect(first.seed).toBe(42);
    expect([first.attemptNumber, second.attemptNumber, english.attemptNumber]).toEqual([1, 2, 1]);
    expect(first.settings).toEqual({ answerWindowMs: 5_000, msPerChar: 150, inputLockMs: 200 });
    expect(english.settings.msPerChar).toBe(50);
    expect(first.serverStartedAt).toBe(new Date(world.clock.ms).toISOString());
    expect(first.displayName).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+-\d{4}$/);
  });
});

describe('走行終了', () => {
  it('全問正解の走行がランキングに載る', async () => {
    const world = await makeWorld();
    const { played, finish } = await startAndFinish(world, PLAYER_A, answerAllCorrect);
    expect(finish.score).toBeCloseTo(played.score, 10);
    expect(finish.correctCount).toBe(5);
    expect(finish.isNewBest).toBe(true);
    expect([finish.rank, finish.entrants]).toEqual([1, 1]);

    const board = await world.service.getLeaderboard({ periodId: world.period.id, locale: 'ja', playerId: PLAYER_A });
    expect(board.top).toHaveLength(1);
    expect(board.me?.rank).toBe(1);
    expect(board.me?.bestPoints).toBe(finish.points);
  });

  it('2回目が下回ってもベストは残り、合計だけ足される', async () => {
    const world = await makeWorld();
    const best = await startAndFinish(world, PLAYER_A, answerAllCorrect);
    const worse = await startAndFinish(world, PLAYER_A, (q) => ({ choice: q.answerIndex, delayMs: 2_000 }));
    expect(worse.finish.isNewBest).toBe(false);
    expect(worse.finish.bestScore).toBeCloseTo(best.finish.score, 10);
    expect(worse.finish.attemptNumber).toBe(2);

    const stats = await world.service.getPlayerStats(PLAYER_A, { periodId: world.period.id, locale: 'ja' });
    expect(stats.totals).toEqual({ points: 0, runs: 2, answered: 10, correct: 10 });
    expect(stats.current?.firstScore).toBeCloseTo(best.finish.score, 10);
    expect(stats.current?.attempts).toBe(2);
  });

  it('アプリの correct と score は信用せず、選んだ番号から判定し直す', async () => {
    const world = await makeWorld();
    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed, 'ja', world.period, answerAllWrong);
    const tampered = played.answers.map((a) => ({ ...a, correct: true }));
    world.clock.ms += played.totalMs + 250;
    const finish = await world.service.finishRun(start.runId, { playerId: PLAYER_A, answers: tampered, score: 1 });
    expect(finish.correctCount).toBe(0);
    expect(finish.score).toBe(0);
  });

  it('出題順が種と合わなければ弾く', async () => {
    const world = await makeWorld();
    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed + 1, 'ja', world.period, answerAllCorrect);
    world.clock.ms += played.totalMs + 250;
    await expectApiError(
      world.service.finishRun(start.runId, { playerId: PLAYER_A, answers: played.answers }),
      400,
      'ORDER_MISMATCH',
    );
  });

  it('理論上の最短時間より速い記録は、残したうえで順位に入れない', async () => {
    const world = await makeWorld();
    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed, 'ja', world.period, answerAllCorrect);
    // サーバー時刻を進めない＝一瞬で終わったことになる
    await expectApiError(
      world.service.finishRun(start.runId, { playerId: PLAYER_A, answers: played.answers }),
      403,
      'RUN_TOO_FAST',
    );
    const run = await world.store.getRun(PLAYER_A, start.runId);
    expect(run?.status).toBe('rejected');
    expect(run?.answers).toHaveLength(5);
    const board = await world.service.getLeaderboard({ periodId: world.period.id, locale: 'ja' });
    expect(board.entrants).toBe(0);
  });

  it('アプリが測った時間がサーバーの時間より長すぎれば弾く', async () => {
    const world = await makeWorld();
    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed, 'ja', world.period, (q) => ({ choice: q.answerIndex, delayMs: 4_000 }));
    world.clock.ms += 5 * 200 + 1_000;
    await expectApiError(
      world.service.finishRun(start.runId, { playerId: PLAYER_A, answers: played.answers }),
      400,
      'CLOCK_MISMATCH',
    );
  });

  it('同じ走行を2度終われない。他人の走行は見えない', async () => {
    const world = await makeWorld();
    const { start, played } = await startAndFinish(world, PLAYER_A, answerAllCorrect);
    await expectApiError(
      world.service.finishRun(start.runId, { playerId: PLAYER_A, answers: played.answers }),
      409,
      'RUN_ALREADY_FINISHED',
    );
    await expectApiError(
      world.service.finishRun(start.runId, { playerId: PLAYER_B, answers: played.answers }),
      404,
      'RUN_NOT_FOUND',
    );
  });

  it('始めてから長く経ちすぎた走行は受け付けない', async () => {
    const world = await makeWorld();
    const start = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const played = playRun(start.seed, 'ja', world.period, answerAllCorrect);
    world.clock.ms += 60 * 60_000;
    await expectApiError(
      world.service.finishRun(start.runId, { playerId: PLAYER_A, answers: played.answers }),
      403,
      'RUN_EXPIRED',
    );
  });
});

describe('激ムズウィーク', () => {
  const hard = { isHardWeek: true, answerWindowSec: 10, maxAttempts: 2, retryWindowMin: 60 };

  it('猶予は10秒。3回目は始められない', async () => {
    const world = await makeWorld(hard);
    const first = await startAndFinish(world, PLAYER_A, answerAllCorrect);
    expect(first.start.settings.answerWindowMs).toBe(10_000);
    expect(first.start.retryDeadline).toBeNull();
    const second = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    const firstRun = await world.store.getRun(PLAYER_A, first.start.runId);
    const firstFinishedAt = Date.parse(firstRun?.serverFinishedAt ?? '');
    expect(second.retryDeadline).toBe(new Date(firstFinishedAt + 60 * 60_000).toISOString());
    await expectApiError(
      world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' }),
      403,
      'ATTEMPTS_EXHAUSTED',
    );
  });

  it('1回目が終わって60分を過ぎたら2回目は始められない', async () => {
    const world = await makeWorld(hard);
    await startAndFinish(world, PLAYER_A, answerAllCorrect);
    world.clock.ms += 61 * 60_000;
    await expectApiError(
      world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' }),
      403,
      'RETRY_WINDOW_CLOSED',
    );
  });

  it('途中で終わった走行も1回目として数え、その開始時刻から60分が期限になる', async () => {
    const world = await makeWorld(hard);
    const abandoned = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    world.clock.ms += 30 * 60_000;
    const second = await world.service.startRun({ playerId: PLAYER_A, periodId: world.period.id, locale: 'ja' });
    expect(second.attemptNumber).toBe(2);
    expect(second.retryDeadline).toBe(new Date(Date.parse(abandoned.serverStartedAt) + 60 * 60_000).toISOString());
  });
});

describe('ランキングと集計', () => {
  it('同スコアなら先に出した挑戦が上。上位と自分の順位が取れる', async () => {
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
