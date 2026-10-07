import { useEffect, useRef } from 'react';

/** リモコンの操作。十字キー4方向・中央ボタン・戻る */
export type RemoteInput = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back';

/** at はイベントが起きた時刻（performance.now() と同じ時計）。repeat は押しっぱなしによる連続入力 */
export type RemoteHandler = (input: RemoteInput, at: number, repeat: boolean) => void;

const BY_KEY: Record<string, RemoteInput> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
  Enter: 'ok',
  ' ': 'ok',
  Spacebar: 'ok',
  Select: 'ok',
  Escape: 'back',
  Esc: 'back',
  Backspace: 'back',
  GoBack: 'back',
  BrowserBack: 'back',
};

// key が入らない古いブラウザ向け
const BY_KEY_CODE: Record<number, RemoteInput> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'ok',
  32: 'ok',
  27: 'back',
  8: 'back',
};

export function toRemoteInput(event: KeyboardEvent): RemoteInput | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return BY_KEY[event.key] ?? BY_KEY_CODE[event.keyCode] ?? null;
}

/**
 * イベントが起きた時刻。処理が遅れても、押した瞬間の時刻で記録するために使う。
 * 値がおかしい環境では、いまの時刻で代用する。
 */
export function eventTime(event: { timeStamp: number }): number {
  const now = performance.now();
  return event.timeStamp > 0 && event.timeStamp <= now ? event.timeStamp : now;
}

/** 表示中の画面がリモコンの操作を受け取る */
export function useRemoteInput(handler: RemoteHandler): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const input = toRemoteInput(event);
      if (input === null) return;
      // 方向キーでページが動かないようにする。「戻る」はブラウザの動作を残す
      if (input !== 'back') event.preventDefault();
      latest.current(input, eventTime(event), event.repeat);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
