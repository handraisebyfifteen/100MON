import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors';
import { GameService } from '../service';
import { DynamoStore } from '../store-dynamo';

/**
 * 公開する4つの API（設計書 §12）。HTTP API のルートごとに GameService を呼ぶだけ。
 * 走行開始 / 走行終了 / ランキング取得 / 個人成績取得
 */

const service = new GameService({
  store: DynamoStore.fromEnv(),
  now: () => new Date(),
  newId: () => randomUUID(),
});

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function respond(status: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const query = event.queryStringParameters ?? {};
  const params = event.pathParameters ?? {};
  try {
    switch (event.routeKey) {
      case 'POST /runs/start':
        return respond(201, await service.startRun(event.body));
      case 'POST /runs/{runId}/finish':
        return respond(200, await service.finishRun(params.runId ?? '', event.body));
      case 'GET /leaderboard':
        return respond(200, await service.getLeaderboard(query));
      case 'GET /players/{playerId}/stats':
        return respond(200, await service.getPlayerStats(params.playerId, query));
      default:
        return respond(404, { error: { code: 'NOT_FOUND', message: 'unknown route' } });
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return respond(error.status, { error: { code: error.code, message: error.message } });
    }
    // 内部の事情は返さない。ログにだけ残す
    console.error('unhandled error', error);
    return respond(500, { error: { code: 'INTERNAL', message: 'internal error' } });
  }
}
