import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { ReactNode } from 'react';
import { startFrameLoop } from '../platform/frame';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { COLORS } from '../theme';

interface FrameTimerProps {
  /** この問題が出題された時刻（performance.now() と同じ時計） */
  startedAt: number;
  /** 問題文が出揃うまでの時間。この間は枠を減らさない */
  typingMs: number;
  /** 回答の猶予。この時間をかけて枠が消える */
  windowMs: number;
  /** 残りわずか。色は補助で、残り時間は長さで伝える */
  urgent: boolean;
  children: ReactNode;
}

/**
 * 目盛りの数（ブラウザ版の FrameTimer.tsx と同じ）。
 * 上下の棒は両端から中央へ、左右の棒は上から下へ、目盛り1つぶんずつ減る。
 */
const STEPS_H = 54;
const STEPS_V = 13;

const makeStyles = ({ px }: Stage) => ({
  frame: { height: px(264), marginTop: px(14) },
  barH: { position: 'absolute' as const, left: 0, right: 0, height: px(20), backgroundColor: COLORS.gaugeEmpty },
  barV: {
    position: 'absolute' as const,
    top: px(28),
    bottom: px(28),
    width: px(20),
    backgroundColor: COLORS.gaugeEmpty,
  },
  fillH: { position: 'absolute' as const, top: 0, bottom: 0 },
  fillV: { position: 'absolute' as const, left: 0, right: 0, bottom: 0 },
  body: {
    position: 'absolute' as const,
    top: px(28),
    right: px(28),
    bottom: px(28),
    left: px(28),
    paddingHorizontal: px(32),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

/**
 * 問題文を囲む枠が、そのまま残り時間を表す（ブラウザ版の「毎フレーム計算する」側の作り。vega-port.md §9）。
 * 毎フレーム進み具合を計算し、目盛りが1つ減ったときだけ描き直す。
 * 時間の計測は RunEngine がタイムスタンプで行うので、描画が遅れても記録はずれない。
 * 目盛りの縞模様（16px ごと）は後回し。
 */
export function FrameTimer({ startedAt, typingMs, windowMs, urgent, children }: FrameTimerProps) {
  const s = useStyles(makeStyles);
  // 減った目盛りの数
  const [gone, setGone] = useState({ h: 0, v: 0 });

  useEffect(() => {
    let last = { h: -1, v: -1 };
    const stop = startFrameLoop((at) => {
      const progress = Math.min(1, Math.max(0, (at - startedAt - typingMs) / windowMs));
      const next = { h: Math.floor(progress * STEPS_H), v: Math.floor(progress * STEPS_V) };
      if (next.h !== last.h || next.v !== last.v) {
        last = next;
        setGone(next);
      }
      if (progress >= 1) stop();
    });
    return stop;
  }, [startedAt, typingMs, windowMs]);

  const color = urgent ? COLORS.urgent : COLORS.gauge;
  const h = gone.h / STEPS_H;
  const v = gone.v / STEPS_V;
  // 上下：両端から中央へ縮む。左右：上から下へ縮む（下端は動かない）
  const fillH = { left: `${h * 50}%` as const, width: `${(1 - h) * 100}%` as const, backgroundColor: color };
  const fillV = { height: `${(1 - v) * 100}%` as const, backgroundColor: color };

  return (
    <View style={s.frame}>
      <View style={[s.barH, { top: 0 }]}>
        <View style={[s.fillH, fillH]} />
      </View>
      <View style={[s.barH, { bottom: 0 }]}>
        <View style={[s.fillH, fillH]} />
      </View>
      <View style={[s.barV, { left: 0 }]}>
        <View style={[s.fillV, fillV]} />
      </View>
      <View style={[s.barV, { right: 0 }]}>
        <View style={[s.fillV, fillV]} />
      </View>
      <View style={s.body}>{children}</View>
    </View>
  );
}
