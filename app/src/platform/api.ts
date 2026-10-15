import type { Answer, Locale, RunSettings } from '@core';
import { DEV_PARAMS } from '../devParams';

/**
 * ランキングのサーバー（/backend）を呼ぶ。公開 API は4つだけ（設計書 §12）。
 * アプリは URL を fetch で呼ぶだけで、AWS のキーは持たない。
 * 返ってくる形は backend/src/service.ts と同じ。backend は Node 向けなので、型はここに写してある。
 */

/** backend/README.md「いま動いているもの」の ApiUrl */
export const API_BASE = 'https://p9j0z2lfmh.execute-api.us-east-2.amazonaws.com/prod';

/** 待つ上限。走行開始はタイトルで待たせるので短め、終了は順位の計算があるので長め */
const START_TIMEOUT_MS = 5000;
const FINISH_TIMEOUT_MS = 10000;
const READ_TIMEOUT_MS = 8000;

export interface StartRunResponse {
  runId: string;
  attemptNumber: number;
  serverStartedAt: string;
  /** この種で RunEngine を作ること。終了時に出題順を照合される */
  seed: number;
  displayName: string;
  /** サーバーが検証に使う設定。走行もこれで行う */
  settings: RunSettings;
  period: { id: string; isHardWeek: boolean; endsAt: string; maxAttempts: number | null };
  retryDeadline: string | null;
}

export interface FinishRunResponse {
  runId: string;
  attemptNumber: number;
  score: number;
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

/**
 * サーバーが返したエラー、またはつながらなかったこと。
 * code は画面の分岐に使う短い名前（PERIOD_CLOSED など）。つながらないときは OFFLINE、待ちきれなかったときは TIMEOUT。
 */
export class ApiError extends Error {
  readonly code: string;
  /** HTTP のステータス。つながらなかったときは 0 */
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

async function request<T>(method: 'GET' | 'POST', path: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 中断が効かない環境でも待ちきれるよう、時間切れは別の Promise で起こす
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ApiError('TIMEOUT', 0, `no response in ${timeoutMs}ms`));
    }, timeoutMs);
  });
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await Promise.race([
      fetch(API_BASE + path, {
        method,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      }),
      timeout,
    ]);
  } catch (error) {
    const failure = error instanceof ApiError ? error : new ApiError('OFFLINE', 0, String(error));
    if (DEV_PARAMS.debug) console.warn(`[qth] api ${method} ${path} ${failure.code} ${failure.message}`);
    throw failure;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (DEV_PARAMS.debug) console.warn(`[qth] api ${method} ${path} ${response.status} ${Date.now() - startedAt}ms`);
  if (!response.ok) {
    const error = (data as ErrorBody | null)?.error;
    throw new ApiError(error?.code ?? `HTTP_${response.status}`, response.status, error?.message ?? 'request failed');
  }
  return data as T;
}

/** 走行開始。seed を省くとサーバーが決める */
export function startRun(input: { playerId: string; periodId: string; locale: Locale; seed: number | null }): Promise<StartRunResponse> {
  const { playerId, periodId, locale, seed } = input;
  return request('POST', '/runs/start', { playerId, periodId, locale, ...(seed === null ? {} : { seed }) }, START_TIMEOUT_MS);
}

/** 走行終了。answers は RunEngine の result().answers をそのまま */
export function finishRun(
  runId: string,
  input: { playerId: string; answers: readonly Answer[]; clientTotalMs: number },
): Promise<FinishRunResponse> {
  return request('POST', `/runs/${encodeURIComponent(runId)}/finish`, input, FINISH_TIMEOUT_MS);
}

/** 上位10人と自分 */
export function getLeaderboard(input: { periodId: string; locale: Locale; playerId: string }): Promise<LeaderboardResponse> {
  // RN の URLSearchParams は一部しか実装されていないので、自分で組む
  const query = Object.entries(input)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return request('GET', `/leaderboard?${query}`, undefined, READ_TIMEOUT_MS);
}
