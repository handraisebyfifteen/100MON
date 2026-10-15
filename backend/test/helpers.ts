import { DEFAULT_CONFIG, RunEngine, resolveSettings } from '../../core/src/index';
import type { Answer, Locale, Period, Question } from '../../core/src/index';
import { makeQuestion } from '../../core/test/helpers';
import { GameService } from '../src/service';
import { MemoryStore } from '../src/store-memory';
import { DEFAULT_POINTS_CONFIG } from '../src/types';
import type { ServerConfig } from '../src/types';

export const CONFIG: ServerConfig = { ...DEFAULT_CONFIG, points: DEFAULT_POINTS_CONFIG };

/** 5問の小さなピリオド。正解は 0,1,2,3,0 */
export const QUESTIONS: Question[] = [
  makeQuestion('q1', 3, 0),
  makeQuestion('q2', 4, 1),
  makeQuestion('q3', 5, 2),
  makeQuestion('q4', 6, 3),
  makeQuestion('q5', 7, 0),
];

export const PERIOD_START = Date.parse('2026-10-19T00:00:00Z');
export const PERIOD_END = Date.parse('2026-10-26T00:00:00Z');

export function makePeriod(overrides: Partial<Period> = {}): Period {
  return {
    id: 'test-P01',
    startsAt: new Date(PERIOD_START).toISOString(),
    endsAt: new Date(PERIOD_END).toISOString(),
    quarter: 1,
    isHardWeek: false,
    questionIds: QUESTIONS.map((q) => q.id),
    ...overrides,
  };
}

export interface World {
  store: MemoryStore;
  service: GameService;
  clock: { ms: number };
  period: Period;
}

export async function makeWorld(periodOverrides: Partial<Period> = {}): Promise<World> {
  const store = new MemoryStore();
  const period = makePeriod(periodOverrides);
  await store.putConfig(CONFIG);
  await store.putPeriod(period);
  await store.putQuestions(period.id, QUESTIONS);
  const clock = { ms: PERIOD_START + 3_600_000 };
  let counter = 0;
  const service = new GameService({
    store,
    now: () => new Date(clock.ms),
    newId: () => `id${++counter}`,
  });
  return { store, service, clock, period };
}

export const PLAYER_A = 'player-aaaa-0001';
export const PLAYER_B = 'player-bbbb-0002';

/** 1問ごとの答え方：選ぶ番号（null なら放置して時間切れ）と、出題から押すまでの時間 */
export type Strategy = (question: Question, index: number) => { choice: number | null; delayMs: number };

export const answerAllCorrect: Strategy = (q) => ({ choice: q.answerIndex, delayMs: 300 });
export const answerAllWrong: Strategy = (q) => ({ choice: (q.answerIndex + 1) % 4, delayMs: 300 });

/** 本物の RunEngine で1走行ぶん遊び、回答の配列と合計時間を返す */
export function playRun(seed: number, locale: Locale, period: Period, strategy: Strategy): { answers: Answer[]; totalMs: number; score: number } {
  const settings = resolveSettings(CONFIG, period, locale);
  const engine = new RunEngine({ questions: QUESTIONS, locale, settings, seed, now: 0 });
  let view = engine.tick(0);
  while (view !== null) {
    const { choice, delayMs } = strategy(view.question, view.index);
    const t = view.startedAt + Math.max(delayMs, settings.inputLockMs);
    if (choice === null) {
      view = engine.tick(view.deadlineAt);
      continue;
    }
    if (!engine.select(choice, t)) throw new Error('select rejected');
    if (!engine.confirm(t)) throw new Error('confirm rejected');
    view = engine.tick(t);
  }
  const result = engine.result();
  return { answers: result.answers, totalMs: result.totalMs, score: result.score };
}

/** 開始 → 遊ぶ → 終了 までを通す。時計は走行時間ぶん進める */
export async function startAndFinish(world: World, playerId: string, strategy: Strategy, locale: Locale = 'ja') {
  const start = await world.service.startRun({ playerId, periodId: world.period.id, locale });
  const played = playRun(start.seed, locale, world.period, strategy);
  world.clock.ms += played.totalMs + 250;
  const finish = await world.service.finishRun(start.runId, {
    playerId,
    answers: played.answers,
    clientTotalMs: played.totalMs,
  });
  return { start, played, finish };
}
