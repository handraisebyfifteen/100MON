import type { ReactElement } from 'react';

// 記号はドット絵で描く。書体によって字形が変わったり、収録されていなかったりするのを避けるため。
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

interface PixelIconProps {
  name: IconName;
  className?: string;
}

export function PixelIcon({ name, className }: PixelIconProps) {
  const rows: readonly string[] = ICONS[name];
  const width = rows[0]?.length ?? 0;
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
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} />);
      x = end;
    }
  });

  return (
    <svg
      className={`px-icon${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${width} ${rows.length}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      {rects}
    </svg>
  );
}
