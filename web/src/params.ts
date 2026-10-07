import { LOCALES } from '@core';
import type { Locale } from '@core';

/**
 * URL の末尾に付ける調整用の指定。
 *   ?demo=1     入力なしで問題が流れ続ける（TV での見え方の確認用）
 *   ?lang=en    言語（ja / en）
 *   ?ms=120     表示速度（1文字あたりのミリ秒）
 *   ?window=2.5 回答の猶予（秒）
 *   ?n=10       先頭の n 問だけで走る（お試し。記録には残さない）
 *   ?seed=1     出題順を固定する
 *   ?debug=1    受け取ったキーと画面サイズを表示する
 */
export interface UrlParams {
  demo: boolean;
  debug: boolean;
  locale: Locale | null;
  msPerChar: number | null;
  answerWindowSec: number | null;
  questionLimit: number | null;
  seed: number | null;
}

export const SPEED_MIN = 20;
export const SPEED_MAX = 400;

function flag(value: string | null): boolean {
  return value === '1' || value === 'true';
}

function numberIn(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function readUrlParams(search: string): UrlParams {
  const q = new URLSearchParams(search);
  const lang = q.get('lang');
  const limit = numberIn(q.get('n'), 1, 10_000);
  const seed = numberIn(q.get('seed'), 0, 0xffffffff);
  return {
    demo: flag(q.get('demo')),
    debug: flag(q.get('debug')),
    locale: LOCALES.includes(lang as Locale) ? (lang as Locale) : null,
    msPerChar: numberIn(q.get('ms'), SPEED_MIN, SPEED_MAX),
    answerWindowSec: numberIn(q.get('window'), 0.5, 30),
    questionLimit: limit === null ? null : Math.floor(limit),
    seed: seed === null ? null : Math.floor(seed),
  };
}
