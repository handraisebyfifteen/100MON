import { randomUUID } from 'node:crypto';
import { GameService } from '../service';
import { DynamoStore } from '../store-dynamo';

/**
 * 週の終わりの集計。EventBridge のスケジュール（月曜 00:10 UTC）から呼ばれる。
 * 手で動かすときは { "periodId": "2026-P01" } を渡すと、そのピリオドだけ集計する。
 */

const service = new GameService({
  store: DynamoStore.fromEnv(),
  now: () => new Date(),
  newId: () => randomUUID(),
});

interface AggregateEvent {
  periodId?: string;
}

export async function handler(event: AggregateEvent | undefined): Promise<unknown> {
  if (event && typeof event.periodId === 'string' && event.periodId.length > 0) {
    const result = await service.aggregatePeriod(event.periodId);
    console.log('aggregated', JSON.stringify(result));
    return [result];
  }
  const results = await service.aggregateEnded();
  console.log('aggregated', JSON.stringify(results));
  return results;
}
