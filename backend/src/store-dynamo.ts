import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Locale, Period } from '../../core/src/index';
import type { BestRecord, RunContribution, Store } from './store';
import type { LeaderboardItem, PeriodItem, PointsResult, RunItem, ServerConfig } from './types';

/**
 * DynamoDB での持ち方（設計書 §9、backend/README.md「DynamoDB の持ち方」が正）。
 *
 * Periods     : pk = periodId。ピリオドの項目と questions（100問）を同じ件に入れる
 * Runs        : pk = playerId, sk = runId（runId は開始時刻で始まるので時刻順に並ぶ）
 *               GSI byRunId : pk = runId（終了時に runId だけで引く）
 * Leaderboard : pk = board（ピリオドID#言語）, sk = playerId
 *               GSI byRank   : pk = board, sk = rankKey（上位から取る。rankKey が無い行は載らない）
 *               GSI byPlayer : pk = playerId, sk = board（自分の全ピリオド）
 * Config      : pk = key（'global' の1件）, value = ServerConfig
 */

export interface DynamoTables {
  periods: string;
  runs: string;
  leaderboard: string;
  config: string;
}

const CONDITION_FAILED = 'ConditionalCheckFailedException';
const CONFIG_KEY = 'global';

/** 問題を除いたピリオドの属性（listPeriods の射影） */
const PERIOD_FIELDS = [
  'periodId',
  'startsAt',
  'endsAt',
  'quarter',
  'isHardWeek',
  'questionIds',
  'answerWindowSec',
  'maxAttempts',
  'retryWindowMin',
] as const;

function isConditionFailed(error: unknown): boolean {
  return error instanceof Error && error.name === CONDITION_FAILED;
}

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
      periods: need('PERIODS_TABLE'),
      runs: need('RUNS_TABLE'),
      leaderboard: need('LEADERBOARD_TABLE'),
      config: need('CONFIG_TABLE'),
    });
  }

  // ---- Config ----

  async getConfig(): Promise<ServerConfig | null> {
    const out = await this.doc.send(new GetCommand({ TableName: this.tables.config, Key: { key: CONFIG_KEY } }));
    return out.Item?.value ? (out.Item.value as ServerConfig) : null;
  }

  async putConfigIfAbsent(config: ServerConfig): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tables.config,
          Item: { key: CONFIG_KEY, value: config },
          ConditionExpression: 'attribute_not_exists(#k)',
          ExpressionAttributeNames: { '#k': 'key' },
        }),
      );
      return true;
    } catch (error) {
      if (isConditionFailed(error)) return false;
      throw error;
    }
  }

  // ---- Periods ----

  private static toPeriod(item: Record<string, unknown>): Period {
    const { periodId, questions: _questions, ...rest } = item;
    return { ...(rest as Omit<Period, 'id'>), id: periodId as string };
  }

  async getPeriod(periodId: string): Promise<PeriodItem | null> {
    const out = await this.doc.send(new GetCommand({ TableName: this.tables.periods, Key: { periodId } }));
    if (!out.Item) return null;
    return { period: DynamoStore.toPeriod(out.Item), questions: (out.Item.questions ?? []) as PeriodItem['questions'] };
  }

  async putPeriod(item: PeriodItem): Promise<void> {
    const { id, ...period } = item.period;
    await this.doc.send(
      new PutCommand({ TableName: this.tables.periods, Item: { periodId: id, ...period, questions: item.questions } }),
    );
  }

  async listPeriods(): Promise<Period[]> {
    const names = Object.fromEntries(PERIOD_FIELDS.map((f) => [`#${f}`, f]));
    const items: Record<string, unknown>[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(
        new ScanCommand({
          TableName: this.tables.periods,
          ProjectionExpression: PERIOD_FIELDS.map((f) => `#${f}`).join(', '),
          ExpressionAttributeNames: names,
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of out.Items ?? []) items.push(item);
      startKey = out.LastEvaluatedKey;
    } while (startKey);
    return items.map(DynamoStore.toPeriod);
  }

  // ---- Runs ----

  async putRun(run: RunItem): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.tables.runs, Item: run }));
  }

  async finishRun(run: RunItem): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tables.runs,
          Item: run,
          ConditionExpression: 'attribute_exists(runId) AND #status = :started',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':started': 'started' },
        }),
      );
      return true;
    } catch (error) {
      if (isConditionFailed(error)) return false;
      throw error;
    }
  }

  async getRun(runId: string, playerId?: string): Promise<RunItem | null> {
    if (playerId !== undefined) {
      const out = await this.doc.send(
        new GetCommand({ TableName: this.tables.runs, Key: { playerId, runId }, ConsistentRead: true }),
      );
      return out.Item ? (out.Item as RunItem) : null;
    }
    const items = await this.queryAll(
      {
        TableName: this.tables.runs,
        IndexName: 'byRunId',
        KeyConditionExpression: 'runId = :runId',
        ExpressionAttributeValues: { ':runId': runId },
      },
      1,
    );
    return items.length > 0 ? (items[0] as unknown as RunItem) : null;
  }

  async listRuns(playerId: string, filter?: { periodId: string; locale: Locale }): Promise<RunItem[]> {
    const items = await this.queryAll({
      TableName: this.tables.runs,
      KeyConditionExpression: 'playerId = :playerId',
      ConsistentRead: true,
      ...(filter
        ? {
            FilterExpression: 'periodId = :period AND #locale = :locale',
            ExpressionAttributeNames: { '#locale': 'locale' },
            ExpressionAttributeValues: { ':playerId': playerId, ':period': filter.periodId, ':locale': filter.locale },
          }
        : { ExpressionAttributeValues: { ':playerId': playerId } }),
    });
    return items as unknown as RunItem[];
  }

  async listRunsSince(playerId: string, sinceMs: number): Promise<RunItem[]> {
    // runId は 13桁の開始時刻（ミリ秒）で始まるので、範囲で絞れる
    const items = await this.queryAll({
      TableName: this.tables.runs,
      KeyConditionExpression: 'playerId = :playerId AND runId >= :since',
      ConsistentRead: true,
      ExpressionAttributeValues: { ':playerId': playerId, ':since': String(Math.max(0, sinceMs)).padStart(13, '0') },
    });
    return items as unknown as RunItem[];
  }

  // ---- Leaderboard ----

  async getEntry(board: string, playerId: string): Promise<LeaderboardItem | null> {
    const out = await this.doc.send(
      new GetCommand({ TableName: this.tables.leaderboard, Key: { board, playerId } }),
    );
    return out.Item ? (out.Item as LeaderboardItem) : null;
  }

  async recordRun(c: RunContribution): Promise<LeaderboardItem> {
    const sets = [
      '#displayName = if_not_exists(#displayName, :displayName)',
      '#periodId = if_not_exists(#periodId, :periodId)',
      '#locale = if_not_exists(#locale, :locale)',
    ];
    const values: Record<string, unknown> = {
      ':displayName': c.displayName,
      ':periodId': c.periodId,
      ':locale': c.locale,
      ':one': 1,
      ':correct': c.correct,
      ':answered': c.answered,
    };
    const names: Record<string, string> = {
      '#displayName': 'displayName',
      '#periodId': 'periodId',
      '#locale': 'locale',
      '#attempts': 'attempts',
      '#totalCorrect': 'totalCorrect',
      '#totalAnswered': 'totalAnswered',
    };
    if (c.firstScore !== null) {
      // 使わない名前を ExpressionAttributeNames に入れると DynamoDB が弾くので、使うときだけ足す
      sets.push('#firstScore = if_not_exists(#firstScore, :firstScore)');
      names['#firstScore'] = 'firstScore';
      values[':firstScore'] = c.firstScore;
    }
    const out = await this.doc.send(
      new UpdateCommand({
        TableName: this.tables.leaderboard,
        Key: { board: c.board, playerId: c.playerId },
        UpdateExpression: `SET ${sets.join(', ')} ADD #attempts :one, #totalCorrect :correct, #totalAnswered :answered`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }),
    );
    return out.Attributes as LeaderboardItem;
  }

  async updateBest(board: string, playerId: string, best: BestRecord): Promise<boolean> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.tables.leaderboard,
          Key: { board, playerId },
          UpdateExpression:
            'SET rankKey = :rankKey, bestScore = :score, bestRunId = :runId, bestAttemptNumber = :attempt, bestCorrect = :correct, bestAnswered = :answered',
          // 行があり、まだベストが無いか、新しいスコアのほうが高いときだけ。同スコアは先に出したほうが残る
          ConditionExpression: 'attribute_exists(board) AND (attribute_not_exists(bestScore) OR bestScore < :score)',
          ExpressionAttributeValues: {
            ':rankKey': best.rankKey,
            ':score': best.bestScore,
            ':runId': best.bestRunId,
            ':attempt': best.bestAttemptNumber,
            ':correct': best.bestCorrect,
            ':answered': best.bestAnswered,
          },
        }),
      );
      return true;
    } catch (error) {
      if (isConditionFailed(error)) return false;
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
