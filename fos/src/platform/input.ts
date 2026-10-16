import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, useTVEventHandler } from 'react-native';
import { DEV_PARAMS } from '../../../app/src/devParams';

// リモコンの入力（Fire OS 版）。Vega 版 app/src/platform/input.ts と同じ形で、中身を react-native-tvos の API にしてある。
//   - イベントは {eventType, eventKeyAction, tag}。時刻は入っていないので受け取った時刻で代用する（Vega 版と同じ）
//   - eventKeyAction は 0 が押した・1 が離した
//   - react-native-tvos の Android 側は、標準では「離した」しか JS に渡さない。押した瞬間に反応したいので、
//     MainApplication.kt で enableKeyDownEvents を有効にしている（これが無いと何も反応しない）
//   - 決定は 'select'（純正リモコンの中央、キーボードの Enter とも）
//   - 押しっぱなしは、約 300ms 後から 'longDown' などの名前で約 300ms おきに来る（Android 側が長押しとして扱う）。
//     Vega 版の「同じキーの繰り返し」と同じく repeat = true で渡す
//   - 戻るはここに来ず、BackHandler で受ける

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
};

/** 押しっぱなしのときに来る名前 → 元のキー */
const BY_LONG_EVENT: Record<string, RemoteInput> = {
  longUp: 'up',
  longDown: 'down',
  longLeft: 'left',
  longRight: 'right',
  longSelect: 'ok',
};

const PRESSED = 0;
const RELEASED = 1;

interface HWEvent {
  eventType: string;
  eventKeyAction?: number;
}

/** いまの時刻。キーイベントに押した瞬間の時刻は入っていないので、受け取った時刻で代用する */
export function now(): number {
  return performance.now();
}

/** 表示中の画面がリモコンの操作を受け取る */
export function useRemoteInput(handler: RemoteHandler): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  // 押したままのキー。離す前にもう一度「押した」が来たら押しっぱなし
  const held = useRef<Set<string>>(new Set());

  const onHWEvent = useCallback((event: HWEvent) => {
    const type = event.eventType;
    if (event.eventKeyAction !== PRESSED) {
      // 離した（1）。長押しの名前で離したことが来ることもあるので、元のキーに戻してから消す
      if (event.eventKeyAction === RELEASED) held.current.delete(BY_LONG_EVENT[type] ?? BY_EVENT[type] ?? type);
      return;
    }
    const longInput = BY_LONG_EVENT[type];
    const input = longInput ?? BY_EVENT[type];
    if (input === undefined) return;
    // 長押しの名前で来たもの、または離す前にもう一度「押した」が来たものは押しっぱなし
    const repeat = longInput !== undefined || held.current.has(input);
    held.current.add(input);
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
