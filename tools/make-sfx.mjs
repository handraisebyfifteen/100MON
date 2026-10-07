// 効果音の WAV を作る。`npm run sfx` で web/public/sfx に書き出す。
//
// 8 ビット時代のゲーム機の音源に寄せている（矩形波2つ・三角波・ノイズ、音量は 16 段階、
// 音程と音量は 1/60 秒ごとに切り替える）。音はすべてここで書いた自前のもので、
// 特定の作品の音を取り込んだり写したりはしていない。

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const FRAME = RATE / 60;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'sfx');

const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C5' や 'F#4' を周波数にする。数値はそのまま Hz */
function hz(note) {
  if (typeof note === 'number') return note;
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) throw new Error(`bad note: ${note}`);
  const midi = SEMITONES[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * 1つのチャンネルを鳴らす。
 * notes は [音, 長さ(1/60秒), 指定] の並び。音が null なら休み。
 *   v:    音量 0〜15。[始め, 終わり] と書くと段階的に変える
 *   to:   この音の終わりまでに、この音程へ段階的に動かす
 *   duty: 矩形波の幅（0.125 / 0.25 / 0.5）
 *   vib:  音程を揺らす幅（半音）
 */
function channel(kind, notes, defaults = {}) {
  const out = [];
  let phase = 0;
  let lfsr = 1;
  let noiseOut = 1;
  for (const [note, frames, opts = {}] of notes) {
    const o = { v: 10, duty: 0.5, ...defaults, ...opts };
    const from = note === null ? 0 : hz(note);
    const to = o.to === undefined ? from : hz(o.to);
    const [v0, v1] = Array.isArray(o.v) ? o.v : [o.v, o.v];
    for (let f = 0; f < frames; f += 1) {
      const t = frames > 1 ? f / (frames - 1) : 0;
      let freq = from + (to - from) * t;
      if (o.vib) freq *= 2 ** (((f % 4 < 2 ? 1 : -1) * o.vib) / 12);
      const vol = note === null ? 0 : Math.round(v0 + (v1 - v0) * t) / 15;
      const start = Math.round(out.length / FRAME) * FRAME;
      const end = Math.round(start + FRAME);
      for (let i = out.length; i < end; i += 1) {
        phase += freq / RATE;
        let s;
        if (kind === 'pulse') {
          s = phase % 1 < o.duty ? 1 : -1;
        } else if (kind === 'triangle') {
          // 16 段の階段になった三角波。音量は変えられない
          const p = phase % 1;
          const step = Math.floor((p < 0.5 ? p * 2 : 2 - p * 2) * 15.999);
          s = vol > 0 ? step / 7.5 - 1 : 0;
        } else {
          // ノイズ。freq はレジスタを進める速さ
          while (phase >= 1) {
            phase -= 1;
            const bit = (lfsr ^ (lfsr >> 1)) & 1;
            lfsr = (lfsr >> 1) | (bit << 14);
            noiseOut = lfsr & 1 ? 1 : -1;
          }
          s = noiseOut;
        }
        out.push(kind === 'triangle' ? s * 0.3 : s * vol * 0.22);
      }
    }
  }
  return out;
}

const pulse = (notes, defaults) => channel('pulse', notes, defaults);
const triangle = (notes, defaults) => channel('triangle', notes, defaults);
const noise = (notes, defaults) => channel('noise', notes, defaults);

function mix(...channels) {
  const length = Math.max(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (const c of channels) for (let i = 0; i < c.length; i += 1) out[i] += c[i];
  return out;
}

function wav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // モノラル
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return data;
}

// 名前は web/src/sound.ts の SOUND_NAMES と揃える
const SOUNDS = {
  // メニューの移動：短い一音
  cursor: () => mix(pulse([['G6', 2, { v: 9 }], ['G6', 2, { v: 4 }]], { duty: 0.25 })),

  // 設定の値を変えた：二音で上がる
  change: () => mix(pulse([['C6', 2], ['G6', 3, { v: [10, 5] }]], { duty: 0.125 })),

  // 決定：三音で駆け上がる
  decide: () => mix(pulse([['B5', 3], ['E6', 3], ['B6', 8, { v: [11, 3] }]], { v: 11 })),

  // 戻る：二音で下がる
  back: () => mix(pulse([['G5', 3], ['C5', 6, { v: [10, 4] }]], { duty: 0.25 })),

  // READY：約1秒。走り出す前の合図
  ready: () =>
    mix(
      pulse(
        [['E5', 6], ['G#5', 6], ['B5', 6], ['E6', 6], ['G#5', 6], ['B5', 6], ['E6', 6], ['G#6', 18, { v: [11, 2], vib: 0.15 }]],
        { v: 11, duty: 0.25 },
      ),
      pulse(
        [['B4', 6], ['E5', 6], ['G#5', 6], ['B5', 6], ['E5', 6], ['G#5', 6], ['B5', 6], ['E6', 18, { v: [7, 1] }]],
        { v: 7, duty: 0.125 },
      ),
      triangle([['E3', 12], ['E3', 12], ['B3', 12], ['E4', 6], ['E3', 18]]),
      noise([[9000, 1, { v: 8 }], [null, 23], [9000, 1, { v: 8 }], [null, 17], [14000, 6, { v: [10, 0] }]]),
    ),

  // 文字送り：ごく短い一音。連続して鳴る
  type: () => mix(pulse([[1245, 1, { v: 6 }], [1245, 1, { v: 2 }]], { duty: 0.125 })),

  // 選択肢を選んだ：音程がすっと上がる
  select: () => mix(pulse([['E5', 4, { to: 'B5', v: 10 }], ['B5', 2, { v: 5 }]], { duty: 0.5 })),

  // 正解：明るく駆け上がる
  correct: () =>
    mix(
      pulse([['C6', 4], ['E6', 4], ['G6', 4], ['C7', 14, { v: [12, 2] }]], { v: 12, duty: 0.25 }),
      pulse([['E5', 4], ['G5', 4], ['C6', 4], ['E6', 14, { v: [8, 1] }]], { v: 8, duty: 0.125 }),
    ),

  // 不正解：低く濁った二音
  wrong: () =>
    mix(
      pulse([['D3', 8], ['A2', 16, { v: [12, 4] }]], { v: 12, duty: 0.5 }),
      pulse([['D#3', 8], ['A#2', 16, { v: [9, 3] }]], { v: 9, duty: 0.25 }),
      noise([[1200, 4, { v: [10, 4] }], [null, 4], [800, 8, { v: [8, 0] }]]),
    ),

  // 時間切れ：揺れながら落ちていく
  timeout: () =>
    mix(
      pulse([['A4', 30, { to: 'A2', v: [11, 3], vib: 0.4 }]], { duty: 0.25 }),
      triangle([['A3', 30, { to: 'A1' }]]),
    ),

  // 残り時間わずか：高い音を3回
  urgent: () =>
    mix(pulse([['A6', 3], [null, 3], ['A6', 3], [null, 3], ['A6', 4, { v: [10, 4] }]], { duty: 0.125 })),

  // 結果：約1.3秒のファンファーレ
  finish: () =>
    mix(
      pulse(
        [['G5', 6], ['C6', 6], ['E6', 6], ['G6', 12], ['E6', 6], ['G6', 6], ['C7', 36, { v: [12, 2], vib: 0.15 }]],
        { v: 12, duty: 0.25 },
      ),
      pulse(
        [['E5', 6], ['G5', 6], ['C6', 6], ['E6', 12], ['C6', 6], ['E6', 6], ['G6', 36, { v: [8, 1] }]],
        { v: 8, duty: 0.125 },
      ),
      triangle([['C3', 12], ['G3', 6], ['C4', 12], ['G3', 12], ['C3', 36]]),
      noise([[12000, 2, { v: 9 }], [null, 16], [12000, 2, { v: 9 }], [null, 22], [14000, 10, { v: [11, 0] }]]),
    ),

  // 自己ベスト更新：結果より長く、和音を3つ上っていく
  newBest: () =>
    mix(
      pulse(
        [
          ['C6', 4], ['E6', 4], ['G6', 4], ['C7', 8],
          ['D6', 4], ['F#6', 4], ['A6', 4], ['D7', 8],
          ['E6', 4], ['G#6', 4], ['B6', 4], ['E7', 8],
          ['B6', 4], ['E7', 44, { v: [12, 2], vib: 0.2 }],
        ],
        { v: 12, duty: 0.25 },
      ),
      pulse(
        [
          ['G5', 4], ['C6', 4], ['E6', 4], ['G6', 8],
          ['A5', 4], ['D6', 4], ['F#6', 4], ['A6', 8],
          ['B5', 4], ['E6', 4], ['G#6', 4], ['B6', 8],
          ['G#6', 4], ['B6', 44, { v: [8, 1] }],
        ],
        { v: 8, duty: 0.125 },
      ),
      triangle([['C3', 20], ['D3', 20], ['E3', 20], ['E3', 4], ['E2', 44]]),
      noise([
        [12000, 2, { v: 9 }], [null, 18],
        [12000, 2, { v: 9 }], [null, 18],
        [12000, 2, { v: 9 }], [null, 18],
        [null, 4], [14000, 14, { v: [12, 0] }],
      ]),
    ),
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const samples = make();
  writeFileSync(join(OUT_DIR, `${name}.wav`), wav(samples));
  console.log(`${name}.wav  ${(samples.length / RATE).toFixed(2)}s`);
}
