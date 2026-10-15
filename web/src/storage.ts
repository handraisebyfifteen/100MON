import { DEFAULT_CONFIG, LOCALES } from '@core';
import type { Locale, RunRecord } from '@core';
import { defaultSoundSettings, SOUND_NAMES } from './sound';
import type { SoundSettings } from './sound';

// 端末内の保存。使えない環境（プライベートウィンドウなど）でも動くよう、失敗は握りつぶす。

const KEYS = {
  settings: 'qth.settings.v1',
  player: 'qth.player.v1',
  // v2：スコアの式を変えた（1問10点・1000点満点）。v1 の記録とは比べられないので分ける
  runs: 'qth.runs.v2',
} as const;

/** 保存しておく走行の上限。1走行は約 10KB */
const MAX_RUNS = 100;

export interface StoredSettings {
  locale: Locale;
  msPerChar: Record<Locale, number>;
  sound: SoundSettings;
}

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても遊べる
  }
}

function defaultSpeed(locale: Locale): number {
  return DEFAULT_CONFIG.typewriterMsPerCharByLocale?.[locale] ?? DEFAULT_CONFIG.typewriterMsPerChar;
}

export function loadSettings(): StoredSettings {
  const saved = read(KEYS.settings) as Partial<StoredSettings> | null;
  const browserLocale: Locale = navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
  const locale = LOCALES.includes(saved?.locale as Locale) ? (saved?.locale as Locale) : browserLocale;
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
  write(KEYS.settings, settings);
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function newRunId(): string {
  return randomId();
}

/** 端末単位の匿名ID。最初に作って、以後は同じものを使う */
export function getPlayerId(): string {
  const saved = read(KEYS.player);
  if (typeof saved === 'string' && saved.length > 0) return saved;
  const id = randomId();
  write(KEYS.player, id);
  return id;
}

export function loadRuns(): RunRecord[] {
  const saved = read(KEYS.runs);
  return Array.isArray(saved) ? (saved as RunRecord[]) : [];
}

/** 走行を1件追加して、保存後の一覧を返す */
export function appendRun(record: RunRecord): RunRecord[] {
  const runs = [...loadRuns(), record].slice(-MAX_RUNS);
  write(KEYS.runs, runs);
  return runs;
}
