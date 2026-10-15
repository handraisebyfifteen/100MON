// 色。ブラウザ版 styles.css の :root と同じ名前・同じ値。

export const COLORS = {
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

/** 書体。assets/fonts/ のファイル名（拡張子なし）と同じにする */
export const FONTS = {
  text: 'DotGothic16',
  /** 問題文と選択肢。TV でドット文字が読みにくい場合は、ここだけ替えられる */
  question: 'DotGothic16',
  digits: 'Press Start 2P',
} as const;
