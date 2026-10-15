import { LOCALES } from '../../core/src/index';
import type { Locale } from '../../core/src/index';
import { badRequest } from './errors';

/** 端末単位の匿名ID。アプリが作る UUID などを想定 */
const PLAYER_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PERIOD_ID = /^[A-Za-z0-9_-]{1,64}$/;
const RUN_ID = /^[A-Za-z0-9_-]{1,96}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseBody(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null || raw === '') return {};
  if (isRecord(raw)) return raw;
  if (typeof raw !== 'string') throw badRequest('INVALID_BODY', 'body must be a JSON object');
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw badRequest('INVALID_BODY', 'body must be a JSON object');
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name !== 'SyntaxError') throw error;
    throw badRequest('INVALID_BODY', 'body must be valid JSON');
  }
}

export function parsePlayerId(value: unknown): string {
  if (typeof value !== 'string' || !PLAYER_ID.test(value)) {
    throw badRequest('INVALID_PLAYER_ID', 'playerId must be 8-64 characters of letters, digits, - or _');
  }
  return value;
}

export function parsePeriodId(value: unknown): string {
  if (typeof value !== 'string' || !PERIOD_ID.test(value)) {
    throw badRequest('INVALID_PERIOD_ID', 'periodId is required');
  }
  return value;
}

export function parseRunId(value: unknown): string {
  if (typeof value !== 'string' || !RUN_ID.test(value)) {
    throw badRequest('INVALID_RUN_ID', 'runId is required');
  }
  return value;
}

export function parseLocale(value: unknown): Locale {
  if (typeof value !== 'string' || !LOCALES.includes(value as Locale)) {
    throw badRequest('INVALID_LOCALE', `locale must be one of ${LOCALES.join(', ')}`);
  }
  return value as Locale;
}

/** 出題順の種。無ければ undefined（サーバーが決める） */
export function parseSeed(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw badRequest('INVALID_SEED', 'seed must be an integer from 0 to 4294967295');
  }
  return value;
}

export function parseOptionalNonNegativeInt(value: unknown, code: string, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw badRequest(code, `${name} must be a non-negative integer`);
  }
  return value;
}
