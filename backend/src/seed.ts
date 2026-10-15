import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, parseQuestionSet } from '../../core/src/index';
import { DynamoStore } from './store-dynamo';
import { DEFAULT_POINTS_CONFIG } from './types';

/**
 * 問題セットとピリオドを Config テーブルに入れる（手元の Mac から動かす）。
 *
 *   npm run backend:seed -- data/questions.temp.json data/period.temp.json
 *
 * テーブル名は環境変数 RUNS_TABLE / LEADERBOARD_TABLE / CONFIG_TABLE で渡す
 * （`sam deploy` の出力に出る）。AWS の資格情報は aws cli の設定を使う。コードには置かない。
 */
async function main(): Promise<void> {
  const [questionsPath, periodPath] = process.argv.slice(2);
  if (!questionsPath || !periodPath) {
    console.error('usage: seed <questions.json> <period.json>');
    process.exit(2);
  }
  const rawQuestions: unknown = JSON.parse(await readFile(questionsPath, 'utf-8'));
  const rawPeriod: unknown = JSON.parse(await readFile(periodPath, 'utf-8'));
  const parsed = parseQuestionSet(rawQuestions, rawPeriod);
  if (!parsed.ok) {
    console.error('invalid question set:\n  ' + parsed.errors.join('\n  '));
    process.exit(1);
  }
  for (const warning of parsed.warnings) console.warn('warning:', warning);

  const store = DynamoStore.fromEnv();
  const config = (await store.getConfig()) ?? { ...DEFAULT_CONFIG, points: DEFAULT_POINTS_CONFIG };
  await store.putConfig(config);
  await store.putPeriod(parsed.period);
  await store.putQuestions(parsed.period.id, parsed.questions);
  console.log(`seeded period ${parsed.period.id} with ${parsed.questions.length} questions`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
