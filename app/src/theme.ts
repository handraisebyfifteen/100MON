// 色。ブラウザ版 styles.css の :root と同じ名前・同じ値。

const NORMAL = {
  panel: '#000a3c',
  blue: '#0058f8',
  deep: '#002a88',
  sky: '#3cbcfc',
  white: '#fcfcfc',
  dim: '#8fa8e8',
  select: '#f8d878',
  gold: '#f8b800',
  ink: '#000',
  gauge: '#fce0a8',
  gaugeEmpty: '#18245c',
  urgent: '#f83800',
  correct: '#58d854',
  wrong: '#f83800',
  timeout: '#fc9838',
  /** 画面の外側（Stage の余白） */
  outside: '#000',
} as const;

type ColorName = keyof typeof NORMAL;

/** '#rgb' / '#rrggbb' を RGB で反転する（'#000a3c' → '#fff5c3'） */
function invertHex(hex: string): string {
  const full = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex;
  const value = 0xffffff - parseInt(full.slice(1), 16);
  return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * 反転しない色。正解の緑・不正解の赤・時間切れの橙・残りわずかの赤は意味を持つ色なので、激ムズでもそのまま使う。
 * 画面の外側の余白も反転しない（TV の黒い縁と揃えておく）。
 */
const KEEP: ReadonlySet<ColorName> = new Set<ColorName>(['correct', 'wrong', 'timeout', 'urgent', 'outside']);

/** 激ムズの画面で使う、色を RGB で反転した組（オーナー希望 2026-10-16） */
const INVERTED = Object.fromEntries(
  (Object.entries(NORMAL) as Array<[ColorName, string]>).map(([name, hex]) => [
    name,
    KEEP.has(name) ? hex : invertHex(hex),
  ]),
) as Record<ColorName, string>;

/**
 * いま使う色。各画面は描き始めるときにここを読むので、画面を出す前に setInverted で切り替える。
 * 画面ごとのスタイルは出したときに作られる（useStyles）ため、切り替えは画面が替わるときにだけ行う。
 */
export const COLORS: Record<ColorName, string> = { ...NORMAL };

let inverted = false;

export function setInverted(on: boolean): void {
  if (on === inverted) return;
  inverted = on;
  Object.assign(COLORS, on ? INVERTED : NORMAL);
}

/** 書体。assets/fonts/ のファイル名（拡張子なし）と同じにする */
export const FONTS = {
  text: 'DotGothic16',
  /** 問題文と選択肢。TV でドット文字が読みにくい場合は、ここだけ替えられる */
  question: 'DotGothic16',
  digits: 'Press Start 2P',
} as const;
