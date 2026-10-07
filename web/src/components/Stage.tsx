import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** 画面は 1920×1080 を基準に組み、表示先の大きさに合わせて全体を拡大縮小する */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

export function Stage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (): void => {
      const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
      const x = (window.innerWidth - STAGE_WIDTH * scale) / 2;
      const y = (window.innerHeight - STAGE_HEIGHT * scale) / 2;
      el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="stage" ref={ref}>
      {children}
    </div>
  );
}
