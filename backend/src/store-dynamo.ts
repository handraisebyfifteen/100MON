import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Locale, Period, Question } from '../../core/src/index';
import type { Store } from './store';
import type { LeaderboardItem, PointsResult, RunItem, ServerConfig } from './types';

/**
 * DynamoDB での持ち方（設計書 §9）。
 *
 * Runs        : pk = playerId, sk = runId（runId は開始時刻で始まるので時刻順に並ぶ）
 * Leaderboard : pk = board（ピリオドID#言語）, sk = playerId
 *               GSI byRank   : pk = board, sk = rankKey（上位から取る）
 *               GSI byPlayer : pk = playerId, sk = board（自分の全ピリオド）
 * Config      : pk = 種類（config / period / questions）, sk = ID
 */

export interface DynamoTables {
  runs: string;
  leaderboard: string;
  config: string;
}

const CONDITION_FAILED = 'ConditionalCheckFailedException';

export class DynamoStore implements Store {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tables: DynamoTables;

  constructor(tables: DynamoTables, client: DynamoDBClient = new DynamoDBClient({})) {
    this.tables = tables;
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  /** Lambda の環境変数（テンプレートで渡す）からテーブル名を読む */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): DynamoStore {
    const need = (name: string): string => {
      const value = env[name];
      if (!value) throw new Error(`environment variable ${name} is not set`);
      return value;
    };
    return new DynamoStore({
      runs: need('RUNS_TABLE'),
      leaderboard: need('LEADERBOARD_TABLE'),
      config: need('CONFIG_TABLE'),
    });
  }

  // ---- Config ----

  private async getConfigItem<T>(pk: string, sk: string, field: string): Promise<T | null> {
    const out = await this.doc.send(new GetCommand({ TableName: this.tables.config, Key: { pk, sk } }));
    const item = out.Item;
    return item && item[field] !== undefined ? (item[field] as T) : null;
  }

  async getConfig(): Promise<ServerConfig | null> {
    return this.getConfigItem<ServerConfig>('config', 'global', 'value');
  }

  async putConfig(config: ServerConfig): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.tables.config, Item: { pk: 'config', sk: 'global', value: config } }),
    );
  }

  async getPeriod(periodId: string): Promise<Period | null> {
    return this.getConfigItem<Period>('period', periodId, 'value');
  }

  async putPeriod(period: Period): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.tables.config, Item: { pk: 'period', sk: period.id, value: period } }),
    );
  }

  async listPeriods(): Promise<Period[]> {
    const items = await this.queryAll({
      TableName: this.tables.config,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'period' },
    });
    return items.map((item) => item.value as Period);
  }

  async getQuestions(periodId: string): Promise<Question[] | null> {
    return this.getConfigItem<Question[]>('questions', periodId, 'value');
  }

  async putQuestions(periodId: string, questions: Question[]): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.tables.config, Item: { pk: 'questions', sk: periodId, value: questions } }),
    );
  }

  // ---- Runs ----

  async putRun(run: RunItem): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.tables.runs, Item: { ...run, pk: run.playerId, sk: run.runId } }));
  }

  async getRun(playerId: string, runId: string): Promise<RunItem | null> {
    const out = await this.doc.send(
      new GetCommand({ TableName: this.tables.runs, Key: { pk: playerId, sk: runId } }),
    );
    return out.Item ? DynamoStore.stripKeys<RunItem>(out.Item) : null;
  }

  async listRuns(playerId: string, filter?: { periodId: string; locale: Locale }): Promise<RunItem[]> {
    const items = await this.queryAll({
      TableName: this.tables.runs,
      KeyConditionExpression: 'pk = :pk',
      ...(filter
        ? {
            FilterExpression: 'periodId = :period AND #locale = :locale',
            ExpressionAttributeNames: { '#locale': 'locale' },
            ExpressionAttributeValues: { ':pk': playerId, ':period': filter.periodId, ':locale': filter.locale },
          }
        : { ExpressionAttributeValues: { ':pk': playerId } }),
    });
    return items.map((item) => DynamoStore.stripKeys<RunItem>(item));
  }

  // ---- Leaderboard ----

  async getEntry(board: string, playerId: string): Promise<LeaderboardItem | null> {
    const out = await this.doc.send(
      new GetCommand({ TableName: this.tables.leaderboard, Key: { board, playerId } }),
    );
    return out.Item ? (out.Item as LeaderboardItem) : null;
  }

  async putEntry(entry: LeaderboardItem, expectedAttempts: number | null): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tables.leaderboard,
          Item: entry,
          ...(expectedAttempts === null
            ? { ConditionExpression: 'attribute_not_exists(board)' }
            : {
                ConditionExpression: 'attempts = :expected',
                ExpressionAttributeValues: { ':expected': expectedAttempts },
              }),
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === CONDITION_FAILED) return false;
      throw error;
    }
  }

  async setEntryPoints(board: string, playerId: string, points: PointsResult): Promise<void> {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.tables.leaderboard,
        Key: { board, playerId },
        UpdateExpression: 'SET points = :points',
        ConditionExpression: 'attribute_exists(board)',
        ExpressionAttributeValues: { ':points': points },
      }),
    );
  }

  async listEntriesByRank(board: string, limit?: number): Promise<LeaderboardItem[]> {
    const items = await this.queryAll(
      {
        TableName: this.tables.leaderboard,
        IndexName: 'byRank',
        KeyConditionExpression: 'board = :board',
        ExpressionAttributeValues: { ':board': board },
        ScanIndexForward: true,
        ...(limit !== undefined ? { Limit: limit } : {}),
      },
      limit,
    );
    return items as unknown as LeaderboardItem[];
  }

  async countBetter(board: string, rankKey: string): Promise<number> {
    return this.count({
      TableName: this.tables.leaderboard,
      IndexName: 'byRank',
      KeyConditionExpression: 'board = :board AND rankKey < :key',
      ExpressionAttributeValues: { ':board': board, ':key': rankKey },
    });
  }

  async countEntries(board: string): Promise<number> {
    return this.count({
      TableName: this.tables.leaderboard,
      IndexName: 'byRank',
      KeyConditionExpression: 'board = :board',
      ExpressionAttributeValues: { ':board': board },
    });
  }

  async listEntriesByPlayer(playerId: string): Promise<LeaderboardItem[]> {
    const items = await this.queryAll({
      TableName: this.tables.leaderboard,
      IndexName: 'byPlayer',
      KeyConditionExpression: 'playerId = :playerId',
      ExpressionAttributeValues: { ':playerId': playerId },
    });
    return items as unknown as LeaderboardItem[];
  }

  // ---- 共通 ----

  private static stripKeys<T>(item: Record<string, unknown>): T {
    const { pk: _pk, sk: _sk, ...rest } = item;
    return rest as T;
  }

  /** ページを全部たどって集める。limit があればそこで止める */
  private async queryAll(
    input: ConstructorParameters<typeof QueryCommand>[0],
    limit?: number,
  ): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(new QueryCommand({ ...input, ExclusiveStartKey: startKey }));
      for (const item of out.Items ?? []) items.push(item);
      startKey = out.LastEvaluatedKey;
      if (limit !== undefined && items.length >= limit) break;
    } while (startKey);
    return limit !== undefined ? items.slice(0, limit) : items;
  }

  private async count(input: ConstructorParameters<typeof QueryCommand>[0]): Promise<number> {
    let total = 0;
    let startKey: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(
        new QueryCommand({ ...input, Select: 'COUNT', ExclusiveStartKey: startKey }),
      );
      total += out.Count ?? 0;
      startKey = out.LastEvaluatedKey;
    } while (startKey);
    return total;
  }
}
