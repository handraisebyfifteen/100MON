import { readFile } from 'node:fs/promises';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { parseQuestionSet } from '../../core/src/index';
import { DynamoStore } from '../src/store-dynamo';
import { DEFAULT_SERVER_CONFIG } from '../src/types';

/**
 * 問題セットとピリオドを Periods テーブルに入れ、Config に初期値を入れる（手元の Mac から動かす）。
 *
 *   npm run backend:build
 *   npm run backend:seed -- data/questions.temp.json data/period.temp.json
 *
 * - 何度実行しても同じ結果になる：同じピリオドIDの項目だけを上書きし、Config は無いときだけ入れる
 * - 既存のデータを消す処理は無い
 * - テーブル名は環境変数 PERIODS_TABLE / CONFIG_TABLE（省略時は trivia-periods / trivia-config）
 * - AWS の資格情報は aws cli の設定（~/.aws）を使う。コードには置かない
 */

/** DynamoDB の1件の上限は 400KB。余裕を見てこれを超えたら止める */
const MAX_ITEM_BYTES = 380_000;

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

  const item = { period: parsed.period, questions: parsed.questions };
  const bytes = Buffer.byteLength(JSON.stringify({ ...parsed.period, questions: parsed.questions }), 'utf-8');
  console.log(`period ${parsed.period.id}: ${parsed.questions.length} questions, about ${bytes} bytes as one item`);
  if (bytes > MAX_ITEM_BYTES) {
    console.error(`too large for one DynamoDB item (limit ${MAX_ITEM_BYTES} bytes)`);
    process.exit(1);
  }

  const env = process.env;
  const prefix = env.NAME_PREFIX ?? 'trivia';
  const store = new DynamoStore(
    {
      periods: env.PERIODS_TABLE ?? `${prefix}-periods`,
      runs: env.RUNS_TABLE ?? `${prefix}-runs`,
      leaderboard: env.LEADERBOARD_TABLE ?? `${prefix}-leaderboard`,
      config: env.CONFIG_TABLE ?? `${prefix}-config`,
    },
    new DynamoDBClient({ region: env.AWS_REGION ?? 'us-east-2' }),
  );

  await store.putPeriod(item);
  console.log(`seeded period ${parsed.period.id} (${parsed.period.startsAt} - ${parsed.period.endsAt})`);

  const created = await store.putConfigIfAbsent(DEFAULT_SERVER_CONFIG);
  console.log(created ? 'config: created with defaults' : 'config: already exists, kept as is');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
