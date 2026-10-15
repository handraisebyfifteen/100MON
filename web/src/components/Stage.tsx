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
    // window.innerWidth は使わない。TV やスマホのブラウザ（Fire TV の Silk など）は、
    // 中身が画面からはみ出すと、その幅を画面の幅として返すことがある（1920 のまま縮まらない）。
    // 画面に固定した外枠（#root）の実際の大きさで測る
    const box = el.parentElement ?? document.documentElement;
    const fit = (): void => {
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (!(width > 0 && height > 0)) return;
      const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
      const x = (width - STAGE_WIDTH * scale) / 2;
      const y = (height - STAGE_HEIGHT * scale) / 2;
      el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    };
    fit();
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
    };
  }, []);

  return (
    <div className="stage" ref={ref}>
      {children}
    </div>
  );
}
