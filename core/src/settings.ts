import type { Config, Locale, Period } from './types';

/**
 * 暫定の設定値。本番ではサーバーから受け取る。
 * 表示速度と基準時間は第2週に実測で決める（設計書 §18）。
 */
export const DEFAULT_CONFIG: Config = {
  baseTimeSec: 300,
  answerWindowSec: 5,
  typewriterMsPerChar: 150,
  typewriterMsPerCharByLocale: { ja: 150, en: 50 },
  inputLockMs: 200,
};

/** 1走行に適用する設定。時間はすべてミリ秒 */
export interface RunSettings {
  baseTimeMs: number;
  answerWindowMs: number;
  msPerChar: number;
  inputLockMs: number;
}

/**
 * Config・Period・言語から、その走行の設定を決める。
 * 優先順位：overrides（調整用） > Period の指定 > Config。
 */
export function resolveSettings(
  config: Config,
  period: Period | null,
  locale: Locale,
  overrides: Partial<RunSettings> = {},
): RunSettings {
  const baseTimeSec = period?.baseTimeSec ?? config.baseTimeSec;
  const answerWindowSec = period?.answerWindowSec ?? config.answerWindowSec;
  const msPerChar = config.typewriterMsPerCharByLocale?.[locale] ?? config.typewriterMsPerChar;
  return {
    baseTimeMs: overrides.baseTimeMs ?? baseTimeSec * 1000,
    answerWindowMs: overrides.answerWindowMs ?? answerWindowSec * 1000,
    msPerChar: overrides.msPerChar ?? msPerChar,
    inputLockMs: overrides.inputLockMs ?? config.inputLockMs ?? 0,
  };
}
