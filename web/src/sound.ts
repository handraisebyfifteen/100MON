// 効果音。音声ファイル（web/public/sfx/*.wav）を先に読み込んでおき、呼ばれたらすぐ鳴らす。
// 音が出せない環境でも遊べるよう、失敗は握りつぶす。

/** 効果音の種類。ファイル名と同じ（tools/make-sfx.mjs の SOUNDS と揃える） */
export const SOUND_NAMES = [
  'cursor',
  'change',
  'decide',
  'back',
  'ready',
  'type',
  'select',
  'urgent',
  'correct',
  'wrong',
  'timeout',
  'finish',
  'newBest',
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export interface SoundSettings {
  /** 全体のオン・オフ。オフなら events に関係なく鳴らさない */
  enabled: boolean;
  events: Record<SoundName, boolean>;
}

export function defaultSoundSettings(): SoundSettings {
  const events = {} as Record<SoundName, boolean>;
  for (const name of SOUND_NAMES) events[name] = true;
  return { enabled: true, events };
}

const VOLUME = 0.5;

/** 同じ音を続けて鳴らすときの最短の間隔。文字送りは速い設定だと毎フレーム呼ばれる */
const MIN_GAP_MS: Partial<Record<SoundName, number>> = { type: 70 };
const DEFAULT_GAP_MS = 30;

let settings = defaultSoundSettings();
let context: AudioContext | null = null;
let output: GainNode | null = null;
/** ブラウザは、利用者が操作するまで音を出させない。最初の操作があったら true */
let unlocked = false;
const buffers = new Map<SoundName, AudioBuffer>();
const lastPlayedAt = new Map<SoundName, number>();

export function setSoundSettings(next: SoundSettings): void {
  settings = next;
}

function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // 古いブラウザは Promise を返さないので、コールバックで受ける
  return new Promise((resolve, reject) => {
    void ctx.decodeAudioData(data, resolve, reject)?.catch(reject);
  });
}

async function load(ctx: AudioContext, name: SoundName): Promise<void> {
  try {
    const response = await fetch(`sfx/${name}.wav`);
    if (!response.ok) return;
    buffers.set(name, await decode(ctx, await response.arrayBuffer()));
  } catch {
    // この音は鳴らないだけ
  }
}

/** 起動時に1回呼ぶ。音声ファイルを読み込み、最初の操作で音を出せるようにする */
export function initSound(): void {
  if (context) return;
  const Ctor =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    context = new Ctor();
    output = context.createGain();
    output.gain.value = VOLUME;
    output.connect(context.destination);
  } catch {
    context = null;
    return;
  }
  const ctx = context;
  for (const name of SOUND_NAMES) void load(ctx, name);

  // 画面側の処理より先に受け取って、その操作の音から鳴るようにする。
  // タブを離れて止められたあとも、次の操作でまた鳴るよう、外さずに置いておく
  const unlock = (): void => {
    unlocked = true;
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  };
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('pointerdown', unlock, true);
}

/** 効果音を鳴らす。delayMs を指定すると、そのぶん遅らせて鳴らす */
export function playSound(name: SoundName, delayMs = 0): void {
  if (!settings.enabled || !settings.events[name]) return;
  if (!context || !output || !unlocked) return;
  const buffer = buffers.get(name);
  if (!buffer) return;

  const now = performance.now();
  const last = lastPlayedAt.get(name);
  if (last !== undefined && now - last < (MIN_GAP_MS[name] ?? DEFAULT_GAP_MS)) return;
  lastPlayedAt.set(name, now);

  try {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.start(context.currentTime + delayMs / 1000);
  } catch {
    // 鳴らせなくても続ける
  }
}
