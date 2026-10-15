import type { Locale } from '@core';

/**
 * 調整用の指定。ブラウザ版の URL パラメータ（web/src/params.ts）に当たるもの。
 * Vega には URL が無いので、ここに直書きして使う。提出ビルドでは全部 null / false にする。
 *   demo            入力なしで問題が流れ続ける（TV での見え方の確認用）
 *   debug           画面の切り替え・受け取ったキー・フレームの間隔を端末のログに出す
 *   locale          言語（ja / en）
 *   msPerChar       表示速度（1文字あたりのミリ秒）
 *   answerWindowSec 回答の猶予（秒）
 *   questionLimit   先頭の n 問だけで走る（お試し。記録には残さない）
 *   seed            出題順を固定する
 *   sound           効果音の全体のオン・オフを保存より優先する（重さの切り分け用）
 *   online          false にするとサーバーを一切呼ばない（端末内だけで走る）
 */
export interface DevParams {
  demo: boolean;
  debug: boolean;
  locale: Locale | null;
  msPerChar: number | null;
  answerWindowSec: number | null;
  questionLimit: number | null;
  seed: number | null;
  sound: boolean | null;
  online: boolean;
}

export const SPEED_MIN = 20;
export const SPEED_MAX = 400;

// 確認用に値を変えるときは、この const の中だけを変える（上の interface は触らない）
export const DEV_PARAMS: DevParams = {
  demo: false,
  debug: false,
  locale: null,
  msPerChar: null,
  answerWindowSec: null,
  questionLimit: null,
  seed: null,
  sound: null,
  online: true,
};
