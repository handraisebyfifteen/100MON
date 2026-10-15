import { useEffect, useMemo, useState } from 'react';
import { now } from '../platform/input';

// CSS の animation: steps(n) を、state の段階的な切り替えで再現する（vega-port.md §3 の換算表）。
// なめらかな補間はしない。段階的な動きが見た目の決まり。

/**
 * key が変わった時刻から、times の各時刻を過ぎるたびに描き直し、いくつ過ぎたかを返す（0〜times.length）。
 * times は昇順で、毎回同じ配列を渡す（モジュールの定数にしておく）。
 */
export function useSteps(key: unknown, times: readonly number[]): number {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const start = useMemo(() => now(), [key]);
  const [, bump] = useState(0);

  useEffect(() => {
    const timers = times.map((t) =>
      setTimeout(() => bump((n) => n + 1), Math.max(0, t - (now() - start))),
    );
    return () => timers.forEach((id) => clearTimeout(id));
  }, [start, times]);

  // タイマーが数ミリ秒早く来ても段が進むように、少しだけ下駄を履かせる
  const elapsed = now() - start + 4;
  let phase = 0;
  for (const t of times) if (elapsed >= t) phase++;
  return phase;
}

/** active の間、periodMs の周期で true / false を切り替える（CSS の steps(1) の点滅） */
export function useBlink(periodMs: number, active: boolean): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(true);
    if (!active) return;
    const id = setInterval(() => setOn((v) => !v), periodMs / 2);
    return () => clearInterval(id);
  }, [periodMs, active]);
  return on;
}
