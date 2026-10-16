import { parseQuestionSet } from '@core';
import type { QuestionSetResult } from '@core';
import rawPeriod from '../../data/period.2026-P01.json';
import rawQuestions from '../../data/questions.2026-P01.json';

/**
 * 出題する問題セットとピリオド。サーバーに入れたもの（backend:seed）と同じファイルを読む。
 * ピリオドが替わるときは、上の2つのファイル名を変える。仮データに戻すときはフラグも true にする。
 * ブラウザ版（web/src/data.ts）は TV での見え方の確認用なので、仮データのまま。
 */
export const IS_TEMP_DATA = false;

export function loadData(): QuestionSetResult {
  return parseQuestionSet(rawQuestions, rawPeriod);
}
