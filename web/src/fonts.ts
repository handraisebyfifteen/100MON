import japaneseUrl from '@fontsource/dotgothic16/files/dotgothic16-japanese-400-normal.woff2?url';
import latinExtUrl from '@fontsource/dotgothic16/files/dotgothic16-latin-ext-400-normal.woff2?url';
import latinUrl from '@fontsource/dotgothic16/files/dotgothic16-latin-400-normal.woff2?url';
import digitsUrl from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?url';

// ドット文字の書体。どちらも SIL Open Font License 1.1 で、アプリに同梱できる。
//   DotGothic16     日本語と英語の本文（16ドット）
//   Press Start 2P  数字と英字の見出し（8ドット）

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, ' +
  'U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, ' +
  'U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

let pending: Promise<boolean> | null = null;

/**
 * 書体をすべて読み込んでから画面を出す。
 * 問題文の表示中に書体が切り替わると読む速さに響くので、あとから読み込む方式にはしない。
 * 読み込めなかった場合や時間がかかりすぎた場合は、端末の書体のまま進める（false を返す）。
 */
export function loadFonts(timeoutMs = 5000): Promise<boolean> {
  if (pending) return pending;
  if (typeof FontFace === 'undefined' || !document.fonts) {
    pending = Promise.resolve(false);
    return pending;
  }

  const woff2 = (url: string): string => `url(${url}) format('woff2')`;
  // 同じ名前の書体は、あとから足したものが優先される。日本語 → 欧文の順に足す
  const faces = [
    new FontFace('DotGothic16', woff2(japaneseUrl)),
    new FontFace('DotGothic16', woff2(latinExtUrl), { unicodeRange: LATIN_EXT }),
    new FontFace('DotGothic16', woff2(latinUrl), { unicodeRange: LATIN }),
    new FontFace('Press Start 2P', woff2(digitsUrl)),
  ];

  const loaded = Promise.all(faces.map((face) => face.load()))
    .then((ready) => {
      ready.forEach((face) => document.fonts.add(face));
      return true;
    })
    .catch(() => false);
  const timeout = new Promise<boolean>((resolve) => {
    window.setTimeout(() => resolve(false), timeoutMs);
  });

  pending = Promise.race([loaded, timeout]);
  return pending;
}
