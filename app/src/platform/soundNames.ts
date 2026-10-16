// 効果音の名前と設定の型。Vega 版（sound.ts）と Fire OS 版（fos/src/platform/sound.ts）で共有する。

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
  'streak',
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

/** ブラウザ版と同じ音量 */
export const VOLUME = 0.5;

/** 同じ音を続けて鳴らすときの最短の間隔。文字送りは速い設定だと毎フレーム呼ばれる */
export const MIN_GAP_MS: Partial<Record<SoundName, number>> = { type: 70 };
export const DEFAULT_GAP_MS = 30;
