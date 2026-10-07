import type { Direction } from '@core';
import { PixelIcon } from './PixelIcon';

interface KeyHintProps {
  /** 使うボタン。方向キーか中央ボタン */
  keys: ReadonlyArray<Direction | 'ok'>;
  label: string;
}

/** 「このボタンで何ができるか」の案内 */
export function KeyHint({ keys, label }: KeyHintProps) {
  return (
    <span className="keyhint">
      <span className="keyhint-keys">
        {keys.map((key) =>
          key === 'ok' ? (
            <span key={key} className="keycap">
              OK
            </span>
          ) : (
            <PixelIcon key={key} name="arrow" className={`arrow arrow-${key}`} />
          ),
        )}
      </span>
      <span>{label}</span>
    </span>
  );
}
