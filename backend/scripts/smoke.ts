import { mulberry32, shuffled } from '../../core/src/index';
import type { Locale } from '../../core/src/index';
import { minimumDurationMs } from '../src/verify';
import type { CurrentPeriodResponse, FinishRunResponse, StartRunResponse } from '../src/service';

/**
 * デプロイした API を、アプリと同じ順で叩いて確かめる道具（手元の Mac から動かす）。
 *
 *   npm run backend:build
 *   npm run backend:smoke -- https://xxxx.execute-api.us-east-2.amazonaws.com/prod [playerId] [locale]
 *
 * 今週の問題 → 走行開始 → （最短時間ぶん待つ）→ 走行終了 → ランキング → 個人成績 の順。
 * 走行終了の回答は、開始時にもらった seed から出題順を再現して作る（アプリの RunEngine と同じ並べ方）。
 * AWS のキーは使わない。URL を fetch で呼ぶだけ。
 */

const [base, playerIdArg, localeArg] = process.argv.slice(2);
if (!base) {
  console.error('usage: smoke <api base url> [playerId] [locale]');
  process.exit(2);
}
const playerId = playerIdArg ?? `smoke-${Date.now().toString(36)}`;
const locale = (localeArg ?? 'ja') as Locale;
/** 1問あたりに掛けたことにする時間 */
const ELAPSED_MS = 400;

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

function show(label: string, status: number, data: unknown): void {
  console.log(`\n### ${label} -> ${status}\n${JSON.stringify(data, null, 1).slice(0, 1200)}`);
}

async function main(): Promise<void> {
  const current = await call<CurrentPeriodResponse>('GET', `/period/current?locale=${locale}`);
  show('GET /period/current', current.status, { ...current.data, questions: `${current.data.questions?.length} questions` });
  if (current.status !== 200) process.exit(1);
  const { period, settings, questions } = current.data;

  const start = await call<StartRunResponse>('POST', '/runs/start', { playerId, periodId: period.id, locale });
  show('POST /runs/start', start.status, start.data);
  if (start.status !== 201) process.exit(1);

  // seed から出題順を再現し、全問正解で答えたことにする
  const order = shuffled(questions, mulberry32(start.data.seed));
  const answers = order.map((q, i) => ({
    questionId: q.id,
    order: i + 1,
    chosenIndex: q.answerIndex,
    timedOut: false,
    elapsedMs: ELAPSED_MS,
  }));

  // 理論上の最短時間より速いと suspicious になるので、その分だけ待つ
  const fullQuestions = questions.map((q) => ({
    id: q.id,
    answerIndex: q.answerIndex,
    category: q.category,
    difficulty: q.difficulty as 'beginner',
    locales: { ja: { text: q.text, choices: q.choices, decisionPoint: q.decisionPoint }, en: { text: q.text, choices: q.choices, decisionPoint: q.decisionPoint } },
  }));
  const minMs = minimumDurationMs(fullQuestions, locale, settings, 0.5);
  const waitMs = Math.max(minMs + 2_000, answers.length * ELAPSED_MS - 8_000);
  console.log(`\nwaiting ${Math.ceil(waitMs / 1000)}s so the run is not faster than the theoretical minimum (${minMs}ms)...`);
  await new Promise((r) => setTimeout(r, waitMs));

  const finish = await call<FinishRunResponse>('POST', '/runs/finish', { runId: start.data.runId, answers });
  show('POST /runs/finish', finish.status, finish.data);

  const again = await call<FinishRunResponse>('POST', '/runs/finish', { runId: start.data.runId, answers });
  show('POST /runs/finish (same runId again)', again.status, { duplicate: again.data.duplicate, score: again.data.score });

  const board = await call('GET', `/leaderboard?periodId=${period.id}&locale=${locale}&playerId=${playerId}`);
  show('GET /leaderboard', board.status, board.data);

  const stats = await call('GET', `/players/${playerId}/stats`);
  show('GET /players/{playerId}/stats', stats.status, stats.data);

  // わざと速すぎる走行：開始してすぐ終える → suspicious
  const fast = await call<StartRunResponse>('POST', '/runs/start', { playerId, periodId: period.id, locale });
  const fastOrder = shuffled(questions, mulberry32(fast.data.seed));
  const fastFinish = await call<FinishRunResponse>('POST', '/runs/finish', {
    runId: fast.data.runId,
    answers: fastOrder.map((q, i) => ({ questionId: q.id, order: i + 1, chosenIndex: q.answerIndex, timedOut: false, elapsedMs: 10 })),
  });
  show('POST /runs/finish (too fast)', fastFinish.status, {
    suspicious: fastFinish.data.suspicious,
    suspiciousReason: fastFinish.data.suspiciousReason,
    rank: fastFinish.data.rank,
    bestScore: fastFinish.data.bestScore,
  });

  // わざとおかしい入力
  const bad1 = await call('POST', '/runs/finish', { runId: start.data.runId, answers: answers.slice(0, 99) });
  show('POST /runs/finish (99 answers, already finished run)', bad1.status, bad1.data);
  const bad2 = await call('POST', '/runs/finish', { runId: 'no-such-run', answers });
  show('POST /runs/finish (unknown runId)', bad2.status, bad2.data);
  const bad3 = await call('POST', '/runs/start', { playerId: 'x', periodId: period.id, locale });
  show('POST /runs/start (bad playerId)', bad3.status, bad3.data);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
