import { now } from './input';

// 毎フレームの処理。
// Vega の requestAnimationFrame は画面の更新に同期しておらず、毎秒 1,000 回以上呼ばれる（§10-2 で計測。1問で 5,000〜15,000 回）。
// そのまま使うと JS スレッドを食いつぶして操作が遅れるので、タイマーで 60 回前後に抑える。

/** 1 フレームの間隔（ms）。60fps 相当 */
export const FRAME_MS = 16;

/** callback を毎フレーム呼ぶ。返した関数で止める */
export function startFrameLoop(callback: (at: number) => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = (): void => {
    if (stopped) return;
    callback(now());
    if (!stopped) timer = setTimeout(tick, FRAME_MS);
  };
  timer = setTimeout(tick, 0);
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  };
}
