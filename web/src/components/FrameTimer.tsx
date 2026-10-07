import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

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
 * 4辺の棒と、それぞれの目盛りの数（styles.css の棒の長さと揃える）。
 * 上下の棒は両端から中央へ、左右の棒は上から下へ、目盛り1つぶんずつ減る。
 */
const SIDES = [
  { name: 'top', axis: 'scaleX', steps: 54 },
  { name: 'right', axis: 'scaleY', steps: 13 },
  { name: 'bottom', axis: 'scaleX', steps: 54 },
  { name: 'left', axis: 'scaleY', steps: 13 },
] as const;

/**
 * 問題文を囲む枠が、そのまま残り時間を表す。
 *
 * 細い棒を4辺に置き、transform の拡大縮小だけで動かす（幅や高さは動かさない）。
 * 動きはブラウザのアニメーションに任せ、開始時刻を出題の時刻に合わせる。
 * 時間の計測は RunEngine がタイムスタンプで行うので、描画が詰まっても記録はずれない。
 */
export function FrameTimer({ startedAt, typingMs, windowMs, urgent, children }: FrameTimerProps) {
  const fills = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const els = fills.current;
    const first = els.find((el) => el !== null);

    if (first && typeof first.animate === 'function') {
      const animations = SIDES.flatMap((side, i) => {
        const el = els[i];
        if (!el) return [];
        const animation = el.animate(
          [{ transform: `${side.axis}(1)` }, { transform: `${side.axis}(0)` }],
          { duration: windowMs, delay: typingMs, fill: 'both', easing: `steps(${side.steps}, end)` },
        );
        // ページのタイムラインは performance.now() と同じ時計なので、出題の時刻にそのまま合わせられる
        animation.startTime = startedAt;
        return [animation];
      });
      return () => animations.forEach((animation) => animation.cancel());
    }

    // アニメーションの仕組みが無いブラウザでは、毎フレーム計算して動かす
    let raf = 0;
    const frame = (): void => {
      const progress = Math.min(1, Math.max(0, (performance.now() - startedAt - typingMs) / windowMs));
      SIDES.forEach((side, i) => {
        const el = els[i];
        if (el) el.style.transform = `${side.axis}(${1 - Math.floor(progress * side.steps) / side.steps})`;
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [startedAt, typingMs, windowMs]);

  return (
    <div className={`frame${urgent ? ' is-urgent' : ''}`}>
      {SIDES.map((side, i) => (
        <span key={side.name} className={`bar bar-${side.name}`}>
          <i
            ref={(el) => {
              fills.current[i] = el;
            }}
          />
        </span>
      ))}
      <div className="frame-body">{children}</div>
    </div>
  );
}
