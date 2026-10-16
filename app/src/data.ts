import { parseQuestionList, parseQuestionSet } from '@core';
import type { Difficulty, Question, QuestionSetResult } from '@core';
import rawExhibition from '../../data/questions.exhibition-2026-10.json';
import rawExhibitionHell from '../../data/questions.exhibition-2026-10-hell.json';
import rawPeriod01 from '../../data/period.2026-P01.json';
import rawQuestions01 from '../../data/questions.2026-P01.json';

/**
 * アプリに入れる問題セットとピリオド。サーバーに入れたもの（backend:seed）と同じファイルを読む。
 * 古い順に並べ、最後のものを公式戦で出す。新しいピリオドを足すときは、下の配列の最後に足す
 * （前のピリオドは消さない。終わったピリオドはエキシビジョンの問題になる）。
 * 仮データに戻すときはフラグも true にする。
 * ブラウザ版（web/src/data.ts）は TV での見え方の確認用なので、仮データのまま。
 */
export const IS_TEMP_DATA = false;

const SETS: ReadonlyArray<{ questions: unknown; period: unknown }> = [
  { questions: rawQuestions01, period: rawPeriod01 },
];

/**
 * エキシビジョンの既定の問題（今月のぶん）。毎月、新しい月のファイルに差し替える（オーナー決定 2026-10-16）。
 * 激ムズ以外は pipeline/generate_period.py --exhibition で作り、激ムズは Claude Code の Claude が書く。
 * 古い月のファイルは data/ に残しておく（あとの週の問題とかぶらないよう、生成役が使用済みとして読む）。
 */
const EXHIBITION_SETS: readonly unknown[] = [rawExhibition, rawExhibitionHell];

/** 公式戦で出すピリオド（いちばん新しいもの） */
export function loadData(): QuestionSetResult {
  const last = SETS[SETS.length - 1] as { questions: unknown; period: unknown };
  return parseQuestionSet(last.questions, last.period);
}

/** エキシビジョンで選べる難易度 */
export type ExhibitionLevel = 'beginner' | 'intermediate' | 'advanced' | 'hell';
export const EXHIBITION_LEVELS: readonly ExhibitionLevel[] = ['beginner', 'intermediate', 'advanced', 'hell'];

/** 問題の難易度 → エキシビジョンの難易度。最初級は初級に、最上級は上級にまとめる */
const LEVEL_OF: Record<Difficulty, ExhibitionLevel> = {
  beginner0: 'beginner',
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
  expert: 'advanced',
  hell: 'hell',
};

export type ExhibitionPools = Record<ExhibitionLevel, Question[]>;

/**
 * エキシビジョンで出す問題を、難易度ごとに集める。今月の既定の問題と、終わったピリオドの問題。
 * 公式戦は過去の問題を使い回すことがある（元の ID のまま）ので、同じ ID は1つにする（あとに読んだほうを残す）。
 * 終わる前のピリオドは入れない（答えを先に知れてしまう）。読めないファイルは飛ばす。
 */
export function loadExhibition(nowMs: number): ExhibitionPools {
  const byId = new Map<string, Question>();
  for (const raw of EXHIBITION_SETS) {
    const parsed = parseQuestionList(raw);
    if (parsed.ok) for (const question of parsed.questions) byId.set(question.id, question);
  }
  for (const set of SETS) {
    const parsed = parseQuestionSet(set.questions, set.period);
    if (!parsed.ok || Date.parse(parsed.period.endsAt) > nowMs) continue;
    for (const question of parsed.questions) byId.set(question.id, question);
  }
  const pools: ExhibitionPools = { beginner: [], intermediate: [], advanced: [], hell: [] };
  for (const question of byId.values()) pools[LEVEL_OF[question.difficulty]].push(question);
  return pools;
}
