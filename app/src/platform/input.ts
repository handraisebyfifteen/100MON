import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useTVEventHandler } from '@amazon-devices/react-native-kepler';
import { DEV_PARAMS } from '../devParams';

// リモコンの入力。ブラウザ版の web/src/input.ts と同じ形で、中身だけ Vega の API にしてある。
// §10-0 で確かめたこと：
//   - イベントは {eventType, eventKeyAction, eventId} だけで、時刻は入っていない
//   - eventKeyAction は 0 が押した・1 が離した
//   - 決定は純正リモコンで 'select'、キーボードや inputd-cli では 'enter' で来る
//   - 押しっぱなしは、同じ eventId の 0 が繰り返し来る
//   - 戻るは useTVEventHandler にも来るが、BackHandler の方で扱う（二重に動かないよう、こちらでは捨てる）

/** リモコンの操作。十字キー4方向・中央ボタン・戻る */
export type RemoteInput = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back';

/** at はイベントを受け取った時刻（performance.now() と同じ時計）。repeat は押しっぱなしによる連続入力 */
export type RemoteHandler = (input: RemoteInput, at: number, repeat: boolean) => void;

const BY_EVENT: Record<string, RemoteInput> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  select: 'ok',
  enter: 'ok',
};

const PRESSED = 0;

interface HWEvent {
  eventType: string;
  eventKeyAction?: number;
  eventId?: number;
}

/**
 * いまの時刻。Vega のキーイベントには押した瞬間の時刻が入っていないので、受け取った時刻で代用する。
 * ずれは数ミリ秒なので許容する（vega-port.md §4）。
 */
export function now(): number {
  return performance.now();
}

/** 表示中の画面がリモコンの操作を受け取る */
export function useRemoteInput(handler: RemoteHandler): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  // 直前に押されたときの eventId。同じ id がまた来たら押しっぱなし
  const lastPressId = useRef<number | null>(null);

  const onHWEvent = useCallback((event: HWEvent) => {
    if (event.eventKeyAction !== PRESSED) {
      lastPressId.current = null;
      return;
    }
    const input = BY_EVENT[event.eventType];
    if (input === undefined) return;
    const id = event.eventId ?? null;
    const repeat = id !== null && id === lastPressId.current;
    lastPressId.current = id;
    if (DEV_PARAMS.debug) console.warn(`[qth] key=${input}${repeat ? ' (repeat)' : ''}`);
    latest.current(input, now(), repeat);
  }, []);
  useTVEventHandler(onHWEvent);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      latest.current('back', now(), false);
      // true を返すとアプリは終了しない。終了したい画面は exitApp() を呼ぶ
      return true;
    });
    return () => sub.remove();
  }, []);
}

/** アプリを終了する（タイトルで「戻る」を押したとき） */
export function exitApp(): void {
  BackHandler.exitApp();
}
