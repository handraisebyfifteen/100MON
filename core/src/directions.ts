import { CHOICE_COUNT } from './types';

export type Direction = 'up' | 'left' | 'right' | 'down';

/**
 * 選択肢の並び（choices[0..3]）と十字キーの対応。
 * 画面を上から読む順（上 → 左 → 右 → 下）に並べている。
 * 対応を変えるときはこの1行だけを書き換える。
 */
export const CHOICE_DIRECTIONS: readonly Direction[] = ['up', 'left', 'right', 'down'];

export function choiceIndexOf(direction: Direction): number {
  return CHOICE_DIRECTIONS.indexOf(direction);
}

export function directionOf(choiceIndex: number): Direction {
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= CHOICE_COUNT) {
    throw new RangeError(`choiceIndex out of range: ${choiceIndex}`);
  }
  return CHOICE_DIRECTIONS[choiceIndex] as Direction;
}
