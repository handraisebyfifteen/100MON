import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CONFIG, LOCALES } from '@core';
import type { Locale, RunRecord } from '@core';
import { defaultSoundSettings, SOUND_NAMES } from './sound';
import type { SoundSettings } from './sound';

// 端末内の保存。ブラウザ版の web/src/storage.ts と同じキー・同じ中身で、localStorage を非同期の保存に替えてある。
// 読み込みは起動時に1回だけ行い、読み終えてから画面を出す（vega-port.md §7）。失敗は握りつぶす。

const KEYS = {
  settings: 'qth.settings.v1',
  player: 'qth.player.v1',
  // v2：スコアの式を変えた（1問10点・1000点満点）。v1 の記録とは比べられないので分ける
  runs: 'qth.runs.v2',
} as const;

/** 保存しておく走行の上限。1走行は約 10KB */
const MAX_RUNS = 100;

/** 保存が無いときの言語。端末の言語設定を読む仕組みはまだ入れていない */
const DEFAULT_LOCALE: Locale = 'ja';

export interface StoredSettings {
  locale: Locale;
  msPerChar: Record<Locale, number>;
  sound: SoundSettings;
}

async function read(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても遊べる
  }
}

function defaultSpeed(locale: Locale): number {
  return DEFAULT_CONFIG.typewriterMsPerCharByLocale?.[locale] ?? DEFAULT_CONFIG.typewriterMsPerChar;
}

export async function loadSettings(): Promise<StoredSettings> {
  const saved = (await read(KEYS.settings)) as Partial<StoredSettings> | null;
  const locale = LOCALES.includes(saved?.locale as Locale) ? (saved?.locale as Locale) : DEFAULT_LOCALE;
  const speed = (l: Locale): number => {
    const value = saved?.msPerChar?.[l];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : defaultSpeed(l);
  };
  // 保存したあとで増えた効果音は、オンにしておく
  const sound = defaultSoundSettings();
  if (typeof saved?.sound?.enabled === 'boolean') sound.enabled = saved.sound.enabled;
  for (const name of SOUND_NAMES) {
    const on = saved?.sound?.events?.[name];
    if (typeof on === 'boolean') sound.events[name] = on;
  }
  return { locale, msPerChar: { ja: speed('ja'), en: speed('en') }, sound };
}

export function saveSettings(settings: StoredSettings): void {
  void write(KEYS.settings, settings);
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function newRunId(): string {
  return randomId();
}

/** 端末単位の匿名ID。最初に作って、以後は同じものを使う */
export async function getPlayerId(): Promise<string> {
  const saved = await read(KEYS.player);
  if (typeof saved === 'string' && saved.length > 0) return saved;
  const id = randomId();
  await write(KEYS.player, id);
  return id;
}

export async function loadRuns(): Promise<RunRecord[]> {
  const saved = await read(KEYS.runs);
  return Array.isArray(saved) ? (saved as RunRecord[]) : [];
}

/**
 * 走行を1件追加して、保存後の一覧を返す。
 * ブラウザ版と違って保存を読み直さず、いま持っている一覧に足す（読み書きが前後しないように）。
 */
export function appendRun(runs: readonly RunRecord[], record: RunRecord): RunRecord[] {
  const next = [...runs, record].slice(-MAX_RUNS);
  void write(KEYS.runs, next);
  return next;
}
