// 効果音（web/public/sfx/*.wav）の中身を、アプリに組み込む TS ファイルにデータとして埋め込む。
// wav の見出しを外し、16bit・モノラルの生の音のデータ（PCM）だけを base64 で持つ。
// 出力：app/src/generated/sfxData.ts（生成物。git には入れない）
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(appRoot, '..', 'web', 'public', 'sfx');
const outFile = join(appRoot, 'src', 'generated', 'sfxData.ts');

const SAMPLE_RATE = 44100;

/** wav から PCM の部分を取り出す。形式が想定と違えば止める */
function readPcm(file) {
  const wav = readFileSync(join(source, file));
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file}: wav ではない`);
  }
  let offset = 12;
  let format = null;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        code: wav.readUInt16LE(body),
        channels: wav.readUInt16LE(body + 2),
        rate: wav.readUInt32LE(body + 4),
        bits: wav.readUInt16LE(body + 14),
      };
    }
    if (id === 'data') {
      if (!format || format.code !== 1 || format.channels !== 1 || format.rate !== SAMPLE_RATE || format.bits !== 16) {
        throw new Error(`${file}: 16bit・モノラル・${SAMPLE_RATE}Hz の PCM ではない ${JSON.stringify(format)}`);
      }
      return wav.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  throw new Error(`${file}: data が無い`);
}

const entries = readdirSync(source)
  .filter((file) => file.endsWith('.wav'))
  .sort()
  .map((file) => [file.slice(0, -'.wav'.length), readPcm(file).toString('base64')]);

const body = entries.map(([name, data]) => `  ${JSON.stringify(name)}: ${JSON.stringify(data)},`).join('\n');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  [
    '// tools/embed-sfx.mjs が生成。手で直さない',
    '',
    '/** 生の音のデータの形式 */',
    `export const SFX_SAMPLE_RATE = ${SAMPLE_RATE};`,
    '',
    '/** 効果音ごとの PCM（16bit・モノラル・リトルエンディアン）を base64 にしたもの */',
    'export const SFX_PCM: Record<string, string> = {',
    body,
    '};',
    '',
  ].join('\n'),
);
console.log(`embed-sfx: ${entries.length} sounds -> ${outFile}`);
