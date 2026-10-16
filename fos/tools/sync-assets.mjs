// 効果音と書体を Android の置き場所にコピーする（tools/tv.sh がビルド前に呼ぶ。手で動かすなら npm run sync-assets）。
//   web/public/sfx/*.wav   → android/app/src/main/res/raw/<小文字の名前>.wav
//                            Android の資源名は小文字・数字・_ だけなので、newBest.wav は newbest.wav になる
//                            （SfxModule.kt も小文字にして探す）
//   app/assets/fonts/*.ttf → android/app/src/main/assets/fonts/
//                            fontFamily はファイル名（拡張子なし）。Vega 版・ブラウザ版と同じ名前で効く
// コピー先は git に入れてある（ビルドだけで済むように）。元を変えたらこれを動かし直す。
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fosRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(fosRoot, '..');
const main = join(fosRoot, 'android', 'app', 'src', 'main');

function sync(from, to, filter, rename = (name) => name) {
  mkdirSync(to, { recursive: true });
  const files = readdirSync(from).filter(filter).sort();
  for (const file of files) copyFileSync(join(from, file), join(to, rename(file)));
  return files.length;
}

const sfx = sync(join(repoRoot, 'web', 'public', 'sfx'), join(main, 'res', 'raw'), (f) => f.endsWith('.wav'), (f) => f.toLowerCase());
const fonts = sync(join(repoRoot, 'app', 'assets', 'fonts'), join(main, 'assets', 'fonts'), (f) => f.endsWith('.ttf'));
console.log(`sync-assets: ${sfx} sounds -> res/raw, ${fonts} fonts -> assets/fonts`);
