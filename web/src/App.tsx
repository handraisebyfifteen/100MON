import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPeriodEntry,
  DEFAULT_CONFIG,
  estimatePace,
  median,
  resolveSettings,
  RunEngine,
  scoreToPoints,
} from '@core';
import type { Locale, Period, Question, RunRecord, RunResult } from '@core';
import { DebugOverlay } from './components/DebugOverlay';
import { Stage } from './components/Stage';
import { IS_TEMP_DATA, loadData } from './data';
import { createDemoBot } from './demo';
import { loadFonts } from './fonts';
import type { DemoBot } from './demo';
import { formatPeriodRange } from './format';
import { STRINGS } from './i18n';
import { readUrlParams } from './params';
import type { UrlParams } from './params';
import { GameScreen } from './screens/Game';
import { RecordsScreen } from './screens/Records';
import { ResultScreen } from './screens/Result';
import { SettingsScreen } from './screens/Settings';
import { TitleScreen } from './screens/Title';
import { playSound, setSoundSettings } from './sound';
import type { SoundSettings } from './sound';
import { appendRun, getPlayerId, loadRuns, loadSettings, newRunId, saveSettings } from './storage';
import type { StoredSettings } from './storage';

/** 自動再生で結果画面を出しておく時間 */
const DEMO_RESULT_MS = 8000;

/** 最後の問題の判定の音が鳴り終わってから、結果の音を鳴らす */
const RESULT_SOUND_DELAY_MS = 500;

/** 走り出す前に「READY」を出す時間。タイムには含めない。0 にすると出さない */
const READY_MS = 1200;

type Screen =
  | { name: 'title' }
  | { name: 'game'; runKey: number; engine: RunEngine; bot: DemoBot | null; startedAtIso: string }
  | { name: 'result'; runKey: number; result: RunResult; attemptNumber: number | null; isNewBest: boolean }
  | { name: 'records' }
  | { name: 'settings' };

function randomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  }
  return Math.floor(Math.random() * 0x100000000);
}

export function App() {
  const params = useMemo(() => readUrlParams(window.location.search), []);
  const data = useMemo(() => loadData(), []);

  // 書体が揃うまでは何も出さない（途中で字の形が変わらないように）
  const [fontsSettled, setFontsSettled] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadFonts().then(() => {
      if (alive) setFontsSettled(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <Stage>
        {!fontsSettled ? null : data.ok ? (
          <Main questions={data.questions} period={data.period} params={params} />
        ) : (
          <DataError errors={data.errors} />
        )}
      </Stage>
      {params.debug && <DebugOverlay />}
    </>
  );
}

function DataError({ errors }: { errors: readonly string[] }) {
  return (
    <section className="screen data-error">
      <h2>{STRINGS.ja.dataError}</h2>
      <p>{STRINGS.en.dataError}</p>
      <ul>
        {errors.slice(0, 12).map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </section>
  );
}

interface MainProps {
  questions: Question[];
  period: Period;
  params: UrlParams;
}

function Main({ questions, period, params }: MainProps) {
  const [settings, setSettings] = useState<StoredSettings>(() => {
    const stored = loadSettings();
    const locale = params.locale ?? stored.locale;
    const msPerChar = { ...stored.msPerChar };
    if (params.msPerChar !== null) msPerChar[locale] = params.msPerChar;
    setSoundSettings(stored.sound);
    return { ...stored, locale, msPerChar };
  });
  const [runs, setRuns] = useState<RunRecord[]>(loadRuns);
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const runCounter = useRef(0);

  const locale = settings.locale;
  const strings = STRINGS[locale];
  const msPerChar = settings.msPerChar[locale];

  // 漢字の字形が言語に合ったものになるよう、ページの言語も切り替える
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const runSettings = useMemo(
    () =>
      resolveSettings(DEFAULT_CONFIG, period, locale, {
        msPerChar,
        ...(params.answerWindowSec !== null ? { answerWindowMs: params.answerWindowSec * 1000 } : {}),
      }),
    [period, locale, msPerChar, params.answerWindowSec],
  );
  const playable = useMemo(
    () => (params.questionLimit === null ? questions : questions.slice(0, params.questionLimit)),
    [questions, params.questionLimit],
  );
  const pace = useMemo(() => estimatePace(playable, locale, runSettings), [playable, locale, runSettings]);

  const periodRuns = useMemo(
    () => runs.filter((run) => run.periodId === period.id && run.locale === locale),
    [runs, period.id, locale],
  );
  const entry = useMemo(() => buildPeriodEntry(periodRuns), [periodRuns]);

  // 自動再生とお試し（問題数を減らした走行）は記録に残さない
  const recordable = !params.demo && params.questionLimit === null;

  const startRun = useCallback(
    (at: number): void => {
      const seed = params.seed ?? randomSeed();
      runCounter.current += 1;
      setScreen({
        name: 'game',
        runKey: runCounter.current,
        // 開始を少し先の時刻にしておくと、その間は RunEngine が待ってくれる
        engine: new RunEngine({ questions: playable, locale, settings: runSettings, seed, now: at + READY_MS }),
        bot: params.demo ? createDemoBot(seed) : null,
        startedAtIso: new Date(Date.now() + READY_MS).toISOString(),
      });
    },
    [params.seed, params.demo, playable, locale, runSettings],
  );

  const finishRun = (result: RunResult, runKey: number, startedAtIso: string): void => {
    let attemptNumber: number | null = null;
    let isNewBest = false;
    if (recordable) {
      attemptNumber = periodRuns.reduce((max, run) => Math.max(max, run.attemptNumber), 0) + 1;
      isNewBest = entry !== null && result.score > entry.bestScore;
      setRuns(
        appendRun({
          id: newRunId(),
          playerId: getPlayerId(),
          periodId: period.id,
          locale: result.locale,
          attemptNumber,
          startedAt: startedAtIso,
          finishedAt: new Date().toISOString(),
          totalMs: result.totalMs,
          answers: result.answers,
          score: result.score,
          seed: result.seed,
          settings: result.settings,
        }),
      );
    }
    playSound(isNewBest ? 'newBest' : 'finish', RESULT_SOUND_DELAY_MS);
    setScreen({ name: 'result', runKey, result, attemptNumber, isNewBest });
  };

  const update = (next: StoredSettings): void => {
    // 設定画面が変えた直後に鳴らす音にも効くよう、その場で反映する
    setSoundSettings(next.sound);
    setSettings(next);
    saveSettings(next);
  };
  const changeLocale = (next: Locale): void => update({ ...settings, locale: next });
  const changeSpeed = (value: number): void => {
    update({ ...settings, msPerChar: { ...settings.msPerChar, [locale]: value } });
  };
  const changeSound = (sound: SoundSettings): void => update({ ...settings, sound });

  // 自動再生：開いたらすぐ走り出し、画面を消灯させない
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!params.demo || autoStarted.current) return;
    autoStarted.current = true;
    startRun(performance.now());
  }, [params.demo, startRun]);

  useEffect(() => {
    if (!params.demo || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async (): Promise<void> => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
        else sentinel = lock;
      } catch {
        // 使えない環境では何もしない
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [params.demo]);

  const periodLabel = `${period.id}　${formatPeriodRange(period.startsAt, period.endsAt)}`;
  const tags = [
    ...(period.isHardWeek ? [strings.hardWeek] : []),
    ...(IS_TEMP_DATA ? [strings.tempData] : []),
    ...(params.questionLimit !== null ? [strings.practice] : []),
    ...(params.demo ? [strings.demo] : []),
  ];

  if (screen.name === 'game') {
    const { runKey, startedAtIso } = screen;
    return (
      <GameScreen
        key={runKey}
        engine={screen.engine}
        strings={strings}
        periodLabel={period.id}
        tags={tags}
        bot={screen.bot}
        onFinish={(result) => finishRun(result, runKey, startedAtIso)}
        onAbort={() => setScreen({ name: 'title' })}
      />
    );
  }

  if (screen.name === 'result') {
    return (
      <ResultScreen
        key={screen.runKey}
        strings={strings}
        result={screen.result}
        attemptNumber={screen.attemptNumber}
        isNewBest={screen.isNewBest}
        autoContinueMs={params.demo ? DEMO_RESULT_MS : null}
        onRetry={startRun}
        onTitle={() => setScreen({ name: 'title' })}
      />
    );
  }

  if (screen.name === 'records') {
    const comparable = periodRuns.filter(
      (run) =>
        run.settings.msPerChar === runSettings.msPerChar &&
        run.settings.answerWindowMs === runSettings.answerWindowMs,
    );
    return (
      <RecordsScreen
        strings={strings}
        periodLabel={`${periodLabel}　${STRINGS[locale].languageName}`}
        entry={entry}
        runs={periodRuns}
        medianMs={median(comparable.map((run) => run.totalMs))}
        medianCount={comparable.length}
        onBack={() => setScreen({ name: 'title' })}
      />
    );
  }

  if (screen.name === 'settings') {
    return (
      <SettingsScreen
        strings={strings}
        locale={locale}
        msPerChar={msPerChar}
        sound={settings.sound}
        pace={pace}
        onLocale={changeLocale}
        onSpeed={changeSpeed}
        onSound={changeSound}
        onBack={() => setScreen({ name: 'title' })}
      />
    );
  }

  return (
    <TitleScreen
      strings={strings}
      periodLabel={periodLabel}
      tags={tags}
      bestPoints={entry ? scoreToPoints(entry.bestScore) : null}
      onStart={startRun}
      onRecords={() => setScreen({ name: 'records' })}
      onSettings={() => setScreen({ name: 'settings' })}
    />
  );
}
