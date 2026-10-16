import { AppState } from 'react-native';
import {
  AudioChannelMask,
  AudioContentType,
  AudioFlags,
  AudioPlaybackStreamBuilder,
  AudioSampleFormat,
  AudioSampleRate,
  AudioUsageType,
} from '@amazon-devices/keplerscript-audio-lib';
import type { AudioPlaybackStream } from '@amazon-devices/keplerscript-audio-lib';
import { DEV_PARAMS } from '../devParams';
import { SFX_PCM, SFX_SAMPLE_RATE } from '../generated/sfxData';
import { DEFAULT_GAP_MS, defaultSoundSettings, MIN_GAP_MS, SOUND_NAMES, VOLUME } from './soundNames';
import type { SoundName, SoundSettings } from './soundNames';

// 効果音。ブラウザ版の web/src/sound.ts と同じ関数名・同じ SOUND_NAMES。
//
// ファミコンの音源と同じ考え方で鳴らす：
//   - 音声の出力を1本だけ開いておき、約12msごとに「いま鳴っている音を足し合わせたもの」を流し込み続ける
//   - 何も鳴っていないときは無音を流す（出力が止まらないので、鳴らし始めに頭が削られない）
//   - 音のデータは tools/embed-sfx.mjs がアプリに埋め込んだ生の PCM。起動時に数値の配列に戻しておく
//   - 鳴らすときは「この音を重ねる」と一覧に足すだけ。JS スレッドを止める処理は無い
//
// これまでに試してやめたもの（vega-port.md §10-2）：
//   - w3cmedia の AudioPlayer：動画用の重いプレイヤー。鳴らし直すたびに 1〜7 秒止まり、強制終了された
//   - WebView の Web Audio：動くが、メモリが約150MB増え、起動直後に OS の描画部分で落ちることがあった

// 効果音の名前・設定の型・音量・最短間隔は soundNames.ts にある（Fire OS 版 fos/src/platform/sound.ts と共有）
export { SOUND_NAMES, defaultSoundSettings };
export type { SoundName, SoundSettings };

/** 1回に流し込む長さ（フレーム数）。512 / 44100 ≒ 11.6ms */
const FRAMES_PER_CHUNK = 512;
/** 出力側に溜めておく数。多いほど途切れにくく、少ないほど遅れが小さい（4 × 11.6ms ≒ 46ms） */
const BUFFER_COUNT = 4;
/** 出力がいっぱいのときに待つ時間 */
const FULL_WAIT_MS = 5;
/** 同時に鳴らせる数。超えたら古いものから止める */
const MAX_VOICES = 8;

/** AudioStatus.STATUS_WOULD_BLOCK：出力がいっぱい */
const STATUS_WOULD_BLOCK = -6;

interface Voice {
  data: Int16Array;
  /** 次に読む位置 */
  pos: number;
  /** 鳴り始めるまでに待つフレーム数（delayMs の分） */
  wait: number;
}

let settings = defaultSoundSettings();
const pcm = new Map<SoundName, Int16Array>();
const voices: Voice[] = [];
const lastPlayedAt = new Map<SoundName, number>();
let stream: AudioPlaybackStream | null = null;
let running = false;
let initPromise: Promise<void> | null = null;
/** 確認用：出力を開けなかったときの理由 */
let lastError: string | null = null;

/** 確認用：いまの状態を1行で返す（debug のログに出す） */
export function soundStatus(): string {
  return `sounds=${pcm.size} running=${running} stream=${stream !== null} voices=${voices.length} error=${lastError ?? '-'} tried=[${attemptLog.join(' | ')}]`;
}

export function setSoundSettings(next: SoundSettings): void {
  settings = next;
}

// ---- 音のデータ ----

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_INDEX = (() => {
  const table = new Uint8Array(128);
  for (let i = 0; i < BASE64.length; i++) table[BASE64.charCodeAt(i)] = i;
  return table;
})();

/** base64 を 16bit の PCM に戻す（リトルエンディアン） */
function decodePcm(base64: string): Int16Array {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((base64.length / 4) * 3 - padding);
  let j = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const n =
      (BASE64_INDEX[base64.charCodeAt(i)]! << 18) |
      (BASE64_INDEX[base64.charCodeAt(i + 1)]! << 12) |
      (BASE64_INDEX[base64.charCodeAt(i + 2)]! << 6) |
      BASE64_INDEX[base64.charCodeAt(i + 3)]!;
    if (j < bytes.length) bytes[j++] = (n >> 16) & 0xff;
    if (j < bytes.length) bytes[j++] = (n >> 8) & 0xff;
    if (j < bytes.length) bytes[j++] = n & 0xff;
  }
  const samples = new Int16Array(bytes.length >> 1);
  for (let i = 0; i < samples.length; i++) {
    const v = bytes[i * 2]! | (bytes[i * 2 + 1]! << 8);
    samples[i] = v >= 0x8000 ? v - 0x10000 : v;
  }
  return samples;
}

// ---- 足し合わせて流し込む ----

const mixBuffer = new Float32Array(FRAMES_PER_CHUNK);

/** 出力のチャンネル数。モノラルで開けなければステレオ（同じ音を左右に入れる） */
let channels: 1 | 2 = 1;

/** いま鳴っている音を1回分（FRAMES_PER_CHUNK）足し合わせる */
function mix(): ArrayBuffer {
  const out = new Int16Array(FRAMES_PER_CHUNK * channels);
  if (voices.length === 0) return out.buffer as ArrayBuffer;
  mixBuffer.fill(0);
  for (let v = voices.length - 1; v >= 0; v--) {
    const voice = voices[v]!;
    let start = 0;
    if (voice.wait > 0) {
      start = Math.min(voice.wait, FRAMES_PER_CHUNK);
      voice.wait -= start;
    }
    const count = Math.min(FRAMES_PER_CHUNK - start, voice.data.length - voice.pos);
    for (let i = 0; i < count; i++) mixBuffer[start + i]! += voice.data[voice.pos + i]!;
    voice.pos += count;
    if (voice.pos >= voice.data.length) voices.splice(v, 1);
  }
  for (let i = 0; i < FRAMES_PER_CHUNK; i++) {
    const v = mixBuffer[i]! * VOLUME;
    const s = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    if (channels === 1) {
      out[i] = s;
    } else {
      out[i * 2] = s;
      out[i * 2 + 1] = s;
    }
  }
  return out.buffer as ArrayBuffer;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// debug のときの数え上げ
const stats = { writes: 0, full: 0, errors: 0, lastReport: 0 };

/** 出力に流し込み続ける。出力がいっぱいなら少し待つ */
async function pump(target: AudioPlaybackStream): Promise<void> {
  let pending: Uint8Array | null = null;
  while (running && stream === target) {
    if (pending === null) pending = new Uint8Array(mix());
    let written: number;
    try {
      // 途中まで書けた残りは、新しい ArrayBuffer にしてから渡す
      const chunk = pending.byteOffset === 0 && pending.byteLength === pending.buffer.byteLength
        ? (pending.buffer as ArrayBuffer)
        : (pending.slice().buffer as ArrayBuffer);
      written = await target.writeAsync(chunk);
    } catch {
      written = -1;
    }
    if (written > 0) {
      stats.writes++;
      pending = written >= pending.byteLength ? null : pending.subarray(written);
    } else if (written === STATUS_WOULD_BLOCK || written === 0) {
      stats.full++;
      await sleep(FULL_WAIT_MS);
    } else {
      // 出力が使えなくなった。少し待ってから続ける（音が鳴らないだけで、ゲームは続く）
      stats.errors++;
      await sleep(200);
    }
    if (DEV_PARAMS.debug) {
      const at = performance.now();
      if (at - stats.lastReport > 5000) {
        stats.lastReport = at;
        console.warn(`[qth] audio writes=${stats.writes} full=${stats.full} errors=${stats.errors} voices=${voices.length}`);
        stats.writes = 0;
        stats.full = 0;
        stats.errors = 0;
      }
    }
  }
}

/**
 * 出力の開き方の候補。上から試し、最初に開けたものを使う。
 * どれが通るかはシミュレータと実機で違うかもしれないので、試した結果を soundStatus() に残す
 */
interface Attempt {
  label: string;
  channels: 1 | 2;
  contentType: AudioContentType;
  flags: AudioFlags;
  /** 1回の長さと溜める数を指定する（指定しなければ OS の既定） */
  tuned: boolean;
}

const ATTEMPTS: readonly Attempt[] = [
  { label: 'game-low', channels: 1, contentType: AudioContentType.CONTENT_TYPE_GAME, flags: AudioFlags.FLAG_LOW_LATENCY, tuned: true },
  { label: 'game', channels: 1, contentType: AudioContentType.CONTENT_TYPE_GAME, flags: AudioFlags.FLAG_NONE, tuned: false },
  { label: 'music', channels: 1, contentType: AudioContentType.CONTENT_TYPE_MUSIC, flags: AudioFlags.FLAG_NONE, tuned: false },
  { label: 'music-st', channels: 2, contentType: AudioContentType.CONTENT_TYPE_MUSIC, flags: AudioFlags.FLAG_NONE, tuned: false },
];

/** 確認用：試した結果 */
const attemptLog: string[] = [];

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

async function tryOpen(attempt: Attempt): Promise<AudioPlaybackStream | null> {
  const builder = new AudioPlaybackStreamBuilder();
  builder.setAudioConfig({
    sampleRate: SFX_SAMPLE_RATE as AudioSampleRate,
    channelMask: attempt.channels === 1 ? AudioChannelMask.CHANNEL_MONO : AudioChannelMask.CHANNEL_STEREO,
    format: AudioSampleFormat.FORMAT_PCM_16_BIT,
  });
  builder.setAudioAttributes({
    contentType: attempt.contentType,
    usage: AudioUsageType.USAGE_MEDIA,
    flags: attempt.flags,
    tag: 'qth-sfx',
  });
  if (attempt.tuned) {
    builder.setFramesPerBuffer(FRAMES_PER_CHUNK);
    builder.setBufferCount(BUFFER_COUNT);
  }
  let opened: AudioPlaybackStream;
  try {
    opened = await builder.buildAsync();
  } catch (e) {
    attemptLog.push(`${attempt.label}:build:${describe(e)}`);
    return null;
  }
  // 開始の前に無音を少し書いておく（空のままだと開始できない作りかもしれないため）
  channels = attempt.channels;
  const prefill: number[] = [];
  for (let i = 0; i < 2; i++) {
    try {
      prefill.push(await opened.writeAsync(mix()));
    } catch (e) {
      prefill.push(-999);
    }
  }
  try {
    await opened.startAsync();
  } catch (e) {
    attemptLog.push(`${attempt.label}:start:${describe(e)}:prefill=${prefill.join('/')}`);
    void AudioPlaybackStreamBuilder.destroyAsync(opened).catch(() => {});
    return null;
  }
  let latency = '?';
  try {
    latency = String(await opened.getLatencyInMsAsync());
  } catch {
    // 分からなくても使える
  }
  attemptLog.push(`${attempt.label}:ok:prefill=${prefill.join('/')}:latency=${latency}ms`);
  return opened;
}

async function openStream(): Promise<AudioPlaybackStream> {
  for (const attempt of ATTEMPTS) {
    const opened = await tryOpen(attempt);
    if (opened !== null) return opened;
  }
  throw new Error('no attempt succeeded');
}

async function start(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const opened = await openStream();
    if (!running) {
      void AudioPlaybackStreamBuilder.destroyAsync(opened).catch(() => {});
      return;
    }
    stream = opened;
    void pump(opened);
    if (DEV_PARAMS.debug) console.warn('[qth] audio stream started');
  } catch (e) {
    running = false;
    lastError = e instanceof Error ? e.message : JSON.stringify(e);
    if (DEV_PARAMS.debug) console.warn(`[qth] audio stream failed: ${lastError}`);
  }
}

/** 背景に回ったときは出力を閉じる（ほかのアプリの音を邪魔しない） */
function stop(): void {
  running = false;
  voices.length = 0;
  const closing = stream;
  stream = null;
  if (closing) {
    void closing
      .stopAsync()
      .catch(() => {})
      .then(() => AudioPlaybackStreamBuilder.destroyAsync(closing))
      .catch(() => {});
  }
}

/** 起動時に1回呼ぶ。音のデータを展開し、出力を開くまで待てる */
export function initSound(): Promise<void> {
  if (initPromise === null) {
    initPromise = (async () => {
      const t0 = performance.now();
      for (const name of SOUND_NAMES) {
        const data = SFX_PCM[name];
        if (data !== undefined) pcm.set(name, decodePcm(data));
      }
      if (DEV_PARAMS.debug) {
        console.warn(`[qth] audio decoded ${pcm.size} sounds in ${(performance.now() - t0).toFixed(0)}ms`);
      }
      await start();
      AppState.addEventListener('change', (state) => {
        if (state === 'active') void start();
        else stop();
      });
    })();
  }
  return initPromise;
}

/** 効果音を鳴らす。delayMs を指定すると、そのぶん遅らせて鳴らす */
export function playSound(name: SoundName, delayMs = 0): void {
  if (!settings.enabled || !settings.events[name]) return;
  const data = pcm.get(name);
  if (data === undefined || !running) return;

  const at = performance.now();
  const last = lastPlayedAt.get(name);
  if (last !== undefined && at - last < (MIN_GAP_MS[name] ?? DEFAULT_GAP_MS)) return;
  lastPlayedAt.set(name, at);

  if (voices.length >= MAX_VOICES) voices.shift();
  voices.push({ data, pos: 0, wait: Math.round((Math.max(0, delayMs) * SFX_SAMPLE_RATE) / 1000) });
}
