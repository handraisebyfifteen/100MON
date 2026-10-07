import { useEffect, useState } from 'react';

/**
 * ?debug=1 で出す確認用の表示。
 * TV のブラウザでリモコンのキーがページに届いているか、画面が何ピクセルとして扱われているかを見る。
 */
export function DebugOverlay() {
  const [lastKey, setLastKey] = useState('—');
  const [keyCount, setKeyCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [size, setSize] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      setLastKey(`key="${event.key}" code="${event.code}" keyCode=${event.keyCode}`);
      setKeyCount((n) => n + 1);
    };
    const onResize = (): void => {
      setSize(`${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`);
    };
    onResize();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);

    let raf = 0;
    let frames = 0;
    let since = performance.now();
    const frame = (): void => {
      frames += 1;
      const now = performance.now();
      if (now - since >= 1000) {
        setFps(Math.round((frames * 1000) / (now - since)));
        frames = 0;
        since = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="debug">
      <div>{size}　{fps} fps</div>
      <div>
        keys: {keyCount}　{lastKey}
      </div>
    </div>
  );
}
