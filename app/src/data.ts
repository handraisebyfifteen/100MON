import { parseQuestionSet } from '@core';
import type { QuestionSetResult } from '@core';
import rawPeriod from '../../data/period.temp.json';
import rawQuestions from '../../data/questions.temp.json';

/**
 * 出題する問題セットとピリオド。ブラウザ版の web/src/data.ts と同じ。
 * 本番の100問に差し替えるときは、上の2つのファイル名とこのフラグを変える。
 */
export const IS_TEMP_DATA = true;

export function loadData(): QuestionSetResult {
  return parseQuestionSet(rawQuestions, rawPeriod);
}
