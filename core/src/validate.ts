import { splitChars } from './text';
import { CHOICE_COUNT, DIFFICULTIES, LOCALES } from './types';
import type { Difficulty, LocalizedQuestion, Period, Question } from './types';

/** 1ピリオドの問題数 */
export const QUESTIONS_PER_PERIOD = 100;

export type QuestionSetResult =
  | { ok: true; period: Period; questions: Question[]; warnings: string[] }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function checkLocalized(value: unknown, where: string, errors: string[]): value is LocalizedQuestion {
  if (!isRecord(value)) {
    errors.push(`${where}: missing`);
    return false;
  }
  const before = errors.length;
  if (!isNonEmptyString(value.text)) errors.push(`${where}.text: must be a non-empty string`);

  const choices = value.choices;
  if (!Array.isArray(choices) || choices.length !== CHOICE_COUNT || !choices.every(isNonEmptyString)) {
    errors.push(`${where}.choices: must be ${CHOICE_COUNT} non-empty strings`);
  } else if (new Set(choices).size !== CHOICE_COUNT) {
    errors.push(`${where}.choices: must not contain duplicates`);
  }

  if (isNonEmptyString(value.text)) {
    const length = splitChars(value.text).length;
    const dp = value.decisionPoint;
    if (typeof dp !== 'number' || !Number.isInteger(dp) || dp < 1 || dp > length) {
      errors.push(`${where}.decisionPoint: must be an integer from 1 to ${length}`);
    }
  }
  return errors.length === before;
}

function checkQuestion(value: unknown, where: string, errors: string[]): value is Question {
  if (!isRecord(value)) {
    errors.push(`${where}: must be an object`);
    return false;
  }
  const before = errors.length;
  if (!isNonEmptyString(value.id)) errors.push(`${where}.id: must be a non-empty string`);
  const answerIndex = value.answerIndex;
  if (
    typeof answerIndex !== 'number' ||
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex >= CHOICE_COUNT
  ) {
    errors.push(`${where}.answerIndex: must be an integer from 0 to ${CHOICE_COUNT - 1}`);
  }
  if (!isNonEmptyString(value.category)) errors.push(`${where}.category: must be a non-empty string`);
  if (!DIFFICULTIES.includes(value.difficulty as Difficulty)) {
    errors.push(`${where}.difficulty: must be one of ${DIFFICULTIES.join(', ')}`);
  }
  const locales = value.locales;
  if (!isRecord(locales)) {
    errors.push(`${where}.locales: missing`);
  } else {
    for (const locale of LOCALES) {
      checkLocalized(locales[locale], `${where}.locales.${locale}`, errors);
    }
  }
  return errors.length === before;
}

function checkPeriod(value: unknown, errors: string[]): value is Period {
  if (!isRecord(value)) {
    errors.push('period: must be an object');
    return false;
  }
  const before = errors.length;
  if (!isNonEmptyString(value.id)) errors.push('period.id: must be a non-empty string');
  for (const key of ['startsAt', 'endsAt'] as const) {
    const raw = value[key];
    if (!isNonEmptyString(raw) || Number.isNaN(Date.parse(raw))) {
      errors.push(`period.${key}: must be a date-time string`);
    }
  }
  if (typeof value.quarter !== 'number') errors.push('period.quarter: must be a number');
  if (typeof value.isHardWeek !== 'boolean') errors.push('period.isHardWeek: must be a boolean');
  const ids = value.questionIds;
  if (!Array.isArray(ids) || !ids.every(isNonEmptyString)) {
    errors.push('period.questionIds: must be an array of strings');
  } else if (new Set(ids).size !== ids.length) {
    errors.push('period.questionIds: must not contain duplicates');
  }
  for (const key of ['baseTimeSec', 'answerWindowSec', 'maxAttempts', 'retryWindowMin'] as const) {
    const raw = value[key];
    if (raw !== undefined && !(typeof raw === 'number' && raw > 0)) {
      errors.push(`period.${key}: must be a positive number when present`);
    }
  }
  return errors.length === before;
}

/**
 * 問題セットとピリオドのファイル（設計書 §9）を読み、形を確かめる。
 * 合格すれば、ピリオドの questionIds の順に並べた問題を返す。
 * 壊れたデータで走り出さないよう、1つでもおかしければ全体を不合格にする。
 */
export function parseQuestionSet(rawQuestions: unknown, rawPeriod: unknown): QuestionSetResult {
  const errors: string[] = [];
  const byId = new Map<string, Question>();

  if (!Array.isArray(rawQuestions)) {
    errors.push('questions: must be an array');
  } else {
    rawQuestions.forEach((raw, i) => {
      const where = isRecord(raw) && isNonEmptyString(raw.id) ? `question ${raw.id}` : `questions[${i}]`;
      if (!checkQuestion(raw, where, errors)) return;
      if (byId.has(raw.id)) {
        errors.push(`${where}: duplicate id`);
        return;
      }
      byId.set(raw.id, raw);
    });
  }

  const periodOk = checkPeriod(rawPeriod, errors);
  if (!periodOk || errors.length > 0) {
    return { ok: false, errors };
  }

  const period = rawPeriod as Period;
  const questions: Question[] = [];
  for (const id of period.questionIds) {
    const question = byId.get(id);
    if (!question) {
      errors.push(`period.questionIds: unknown question id ${id}`);
    } else {
      questions.push(question);
    }
  }
  if (questions.length === 0 && errors.length === 0) {
    errors.push('period.questionIds: must not be empty');
  }
  if (errors.length > 0) return { ok: false, errors };

  const warnings: string[] = [];
  if (questions.length !== QUESTIONS_PER_PERIOD) {
    warnings.push(`period has ${questions.length} questions (expected ${QUESTIONS_PER_PERIOD})`);
  }
  return { ok: true, period, questions, warnings };
}
