import type { Config, Locale, Period } from './types';

/**
 * 暫定の設定値。本番ではサーバーから受け取る。
 * 表示速度は TV で確認して確定した（設計書 §5）。
 */
export const DEFAULT_CONFIG: Config = {
  answerWindowSec: 5,
  typewriterMsPerChar: 150,
  typewriterMsPerCharByLocale: { ja: 150, en: 50 },
  inputLockMs: 200,
};

/** 1走行に適用する設定。時間はすべてミリ秒 */
export interface RunSettings {
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
  const answerWindowSec = period?.answerWindowSec ?? config.answerWindowSec;
  const msPerChar = config.typewriterMsPerCharByLocale?.[locale] ?? config.typewriterMsPerChar;
  return {
    answerWindowMs: overrides.answerWindowMs ?? answerWindowSec * 1000,
    msPerChar: overrides.msPerChar ?? msPerChar,
    inputLockMs: overrides.inputLockMs ?? config.inputLockMs ?? 0,
  };
}
