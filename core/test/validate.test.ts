import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuestionSet } from '../src';
import { makeQuestion } from './helpers';

const period = (ids: string[]) => ({
  id: 'p',
  startsAt: '2026-10-19T00:00:00Z',
  endsAt: '2026-10-26T00:00:00Z',
  quarter: 1,
  isHardWeek: false,
  questionIds: ids,
});

function errorsOf(rawQuestions: unknown, rawPeriod: unknown): string[] {
  const result = parseQuestionSet(rawQuestions, rawPeriod);
  return result.ok ? [] : result.errors;
}

describe('問題セットの読み込み', () => {
  it('ピリオドの questionIds の順に問題を返す', () => {
    const questions = [makeQuestion('a', 5), makeQuestion('b', 5), makeQuestion('c', 5)];
    const result = parseQuestionSet(questions, period(['c', 'a']));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions.map((q) => q.id)).toEqual(['c', 'a']);
    expect(result.warnings).toHaveLength(1); // 100問でない
  });

  it('形のおかしいデータは不合格にし、どこがおかしいかを返す', () => {
    const good = makeQuestion('a', 5);
    const cases: Array<[string, unknown, RegExp]> = [
      ['正解の位置が範囲外', { ...good, answerIndex: 4 }, /answerIndex/],
      ['難易度が未知', { ...good, difficulty: 'easy' }, /difficulty/],
      ['英語版が無い', { ...good, locales: { ja: good.locales.ja } }, /locales\.en/],
      [
        '選択肢が3つ',
        { ...good, locales: { ...good.locales, ja: { ...good.locales.ja, choices: ['a', 'b', 'c'] } } },
        /choices/,
      ],
      [
        '選択肢が重複',
        { ...good, locales: { ...good.locales, ja: { ...good.locales.ja, choices: ['a', 'a', 'c', 'd'] } } },
        /duplicates/,
      ],
      [
        '確定位置が問題文より長い',
        { ...good, locales: { ...good.locales, ja: { ...good.locales.ja, decisionPoint: 6 } } },
        /decisionPoint/,
      ],
    ];
    for (const [name, bad, pattern] of cases) {
      const errors = errorsOf([bad], period(['a']));
      expect(errors.join('\n'), name).toMatch(pattern);
    }
  });

  it('ID の重複と、存在しない ID の参照を弾く', () => {
    const a = makeQuestion('a', 5);
    expect(errorsOf([a, a], period(['a'])).join('\n')).toMatch(/duplicate id/);
    expect(errorsOf([a], period(['a', 'zzz'])).join('\n')).toMatch(/unknown question id zzz/);
    expect(errorsOf([a], period(['a', 'a'])).join('\n')).toMatch(/duplicates/);
    expect(errorsOf([a], period([])).join('\n')).toMatch(/must not be empty/);
  });

  it('配列でない・ピリオドが壊れている場合も落ちずに不合格を返す', () => {
    expect(errorsOf(null, period(['a'])).join('\n')).toMatch(/questions: must be an array/);
    expect(errorsOf([makeQuestion('a', 5)], null).join('\n')).toMatch(/period: must be an object/);
    expect(errorsOf([makeQuestion('a', 5)], { ...period(['a']), startsAt: 'nope' }).join('\n')).toMatch(/startsAt/);
  });
});

describe('data/ の仮データ', () => {
  const read = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));

  it('そのまま読み込めて、100問そろっている', () => {
    const result = parseQuestionSet(read('questions.temp.json'), read('period.temp.json'));
    expect(result.ok ? result.warnings : result.errors).toEqual([]);
    expect(result.ok && result.questions.length).toBe(100);
  });
});
