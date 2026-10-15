import type { Question, RunSettings } from '../src';

/** 問題文が n 文字のテスト用の問題を作る */
export function makeQuestion(id: string, charCount: number, answerIndex = 0): Question {
  const text = 'あ'.repeat(charCount);
  return {
    id,
    answerIndex,
    category: 'test',
    difficulty: 'beginner',
    locales: {
      ja: { text, choices: ['a', 'b', 'c', 'd'], decisionPoint: 1 },
      en: { text: 'x'.repeat(charCount * 2), choices: ['a', 'b', 'c', 'd'], decisionPoint: 1 },
    },
  };
}

/** 1文字 100ms・猶予 5秒・確定後 200ms は入力を受け付けない */
export const SETTINGS: RunSettings = {
  answerWindowMs: 5_000,
  msPerChar: 100,
  inputLockMs: 200,
};
