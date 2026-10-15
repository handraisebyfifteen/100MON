import { View } from 'react-native';
import type { ReactElement } from 'react';
import type { Direction } from '@core';

// 記号はドット絵で描く。書体によって字形が変わったり、収録されていなかったりするのを避けるため。
// ブラウザ版（SVG）と同じドット。SVG ライブラリは使わず、横に続くドットを1つの View にまとめて並べる（vega-port.md §8）。
const ICONS = {
  /** 上向きの矢印。ほかの向きは回して使う */
  arrow: ['.......', '...#...', '..###..', '.#####.', '#######', '.......', '.......'],
  ring: [
    '...#####...',
    '..#######..',
    '.###...###.',
    '###.....###',
    '##.......##',
    '##.......##',
    '##.......##',
    '###.....###',
    '.###...###.',
    '..#######..',
    '...#####...',
  ],
  cross: [
    '##.......##',
    '###.....###',
    '.###...###.',
    '..###.###..',
    '...#####...',
    '....###....',
    '...#####...',
    '..###.###..',
    '.###...###.',
    '###.....###',
    '##.......##',
  ],
  check: [
    '...........',
    '.........##',
    '........###',
    '.......###.',
    '##....###..',
    '###..###...',
    '.######....',
    '..####.....',
    '...##......',
    '...........',
    '...........',
  ],
} as const;

export type IconName = keyof typeof ICONS;

const ROTATION: Record<Direction, string> = { up: '0deg', right: '90deg', down: '180deg', left: '270deg' };

interface PixelIconProps {
  name: IconName;
  /** 一辺の大きさ（換算後の px）。ドット1つが整数になるよう切り下げる */
  size: number;
  color: string;
  /** 矢印の向き */
  direction?: Direction;
}

export function PixelIcon({ name, size, color, direction }: PixelIconProps) {
  const rows: readonly string[] = ICONS[name];
  const width = rows[0]?.length ?? 1;
  const dot = Math.max(1, Math.floor(size / width));
  const rects: ReactElement[] = [];

  // 横に続くドットは1本の長方形にまとめる
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x += 1;
        continue;
      }
      let end = x;
      while (row[end] === '#') end += 1;
      rects.push(
        <View
          key={`${x}-${y}`}
          style={{
            position: 'absolute',
            left: x * dot,
            top: y * dot,
            width: (end - x) * dot,
            height: dot,
            backgroundColor: color,
          }}
        />,
      );
      x = end;
    }
  });

  return (
    <View
      style={{
        width: width * dot,
        height: rows.length * dot,
        transform: [{ rotate: ROTATION[direction ?? 'up'] }],
      }}
    >
      {rects}
    </View>
  );
}
