import { DEV_PARAMS } from '../../../app/src/devParams';
import {
  DEFAULT_GAP_MS,
  defaultSoundSettings,
  MIN_GAP_MS,
  SOUND_NAMES,
  VOLUME,
} from '../../../app/src/platform/soundNames';
import type { SoundName, SoundSettings } from '../../../app/src/platform/soundNames';
import NativeSfx from '../specs/NativeSfx';

// 効果音（Fire OS 版）。Vega 版 app/src/platform/sound.ts と同じ関数名・同じ SOUND_NAMES。
// Android には短い効果音のための SoundPool があるので、それを使う小さな部品（SfxModule.kt）を呼ぶだけ。
// 音のファイルは android/app/src/main/res/raw/ に置く（tools/sync-assets.mjs が web/public/sfx からコピーする）。

export { SOUND_NAMES, defaultSoundSettings };
export type { SoundName, SoundSettings };

/** 読み込みを待つ上限。読み込めなくても、音が鳴らないだけでゲームは始める */
const LOAD_TIMEOUT_MS = 3000;

let settings = defaultSoundSettings();
const lastPlayedAt = new Map<SoundName, number>();
let loadedCount = 0;
let ready = false;
let initPromise: Promise<void> | null = null;
/** 確認用：読み込めなかったときの理由 */
let lastError: string | null = null;

/** 確認用：いまの状態を1行で返す（debug のログに出す） */
export function soundStatus(): string {
  return `sounds=${loadedCount}/${SOUND_NAMES.length} ready=${ready} error=${lastError ?? '-'}`;
}

export function setSoundSettings(next: SoundSettings): void {
  settings = next;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`load timed out after ${ms}ms`)), ms));
}

/** 起動時に1回呼ぶ。音を読み込み終わるまで待てる */
export function initSound(): Promise<void> {
  if (initPromise === null) {
    initPromise = (async () => {
      const t0 = performance.now();
      try {
        loadedCount = await Promise.race([NativeSfx.load([...SOUND_NAMES]), timeout(LOAD_TIMEOUT_MS)]);
        ready = loadedCount > 0;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      if (DEV_PARAMS.debug) {
        console.warn(`[qth] audio loaded ${loadedCount} sounds in ${(performance.now() - t0).toFixed(0)}ms ${lastError ?? ''}`);
      }
    })();
  }
  return initPromise;
}

/** 効果音を鳴らす。delayMs を指定すると、そのぶん遅らせて鳴らす */
export function playSound(name: SoundName, delayMs = 0): void {
  if (!settings.enabled || !settings.events[name] || !ready) return;

  const at = performance.now();
  const last = lastPlayedAt.get(name);
  if (last !== undefined && at - last < (MIN_GAP_MS[name] ?? DEFAULT_GAP_MS)) return;
  lastPlayedAt.set(name, at);

  const fire = (): void => NativeSfx.play(name, VOLUME);
  if (delayMs > 0) setTimeout(fire, delayMs);
  else fire();
}
