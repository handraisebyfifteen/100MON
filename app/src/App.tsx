import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  buildPeriodEntry,
  DEFAULT_CONFIG,
  estimatePace,
  resolveSettings,
  RunEngine,
  scoreToPoints,
} from '@core';
import type { Locale, Period, Question, RunRecord, RunResult } from '@core';
import { Screen, StageView } from './components/Screen';
import { IS_TEMP_DATA, loadData } from './data';
import { createDemoBot } from './demo';
import type { DemoBot } from './demo';
import { DEV_PARAMS } from './devParams';
import type { DevParams } from './devParams';
import { formatPeriodRange } from './format';
import { STRINGS } from './i18n';
import { now } from './platform/input';
import { useStyles } from './platform/layout';
import type { Stage } from './platform/layout';
import { initSound, playSound, setSoundSettings, soundStatus } from './platform/sound';
import type { SoundSettings } from './platform/sound';
import { appendRun, getPlayerId, loadRuns, loadSettings, newRunId, saveSettings } from './platform/storage';
import type { StoredSettings } from './platform/storage';
import { GameScreen } from './screens/Game';
import { ResultScreen } from './screens/Result';
import { TitleScreen } from './screens/Title';
import { COLORS, FONTS } from './theme';

// ブラウザ版の web/src/App.tsx と同じ構造。違いは次の3つ。
//   - URL パラメータの代わりに devParams.ts の定数を使う
//   - 保存と効果音の読み込みが非同期なので、読み終えるまで画面を出さない（§7）
//   - 消灯を防ぐ wakeLock と、ページの言語の切り替えは無い
// 記録と設定の画面は §10-4 で足す。

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
  return Math.floor(Math.random() * 0x100000000);
}

/** 起動時に読み込んでおくもの */
interface Boot {
  settings: StoredSettings;
  runs: RunRecord[];
  playerId: string;
}

export function App() {
  const params = DEV_PARAMS;
  const data = useMemo(() => loadData(), []);

  // 保存と効果音が揃うまでは何も出さない
  const [boot, setBoot] = useState<Boot | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [settings, runs, playerId] = await Promise.all([loadSettings(), loadRuns(), getPlayerId(), initSound()]);
      if (alive) setBoot({ settings, runs, playerId });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <StageView>
      {boot === null ? null : data.ok ? (
        <Main questions={data.questions} period={data.period} params={params} boot={boot} />
      ) : (
        <DataError errors={data.errors} />
      )}
    </StageView>
  );
}

const makeErrorStyles = ({ px }: Stage) => ({
  h2: { marginTop: px(6), fontFamily: FONTS.text, fontSize: px(64), color: COLORS.white },
  p: { fontFamily: FONTS.text, fontSize: px(32), color: COLORS.dim },
  li: { fontFamily: FONTS.text, fontSize: px(32), color: COLORS.white },
});

function DataError({ errors }: { errors: readonly string[] }) {
  const s = useStyles(makeErrorStyles);
  return (
    <Screen>
      <Text style={s.h2}>{STRINGS.ja.dataError}</Text>
      <Text style={s.p}>{STRINGS.en.dataError}</Text>
      <View>
        {errors.slice(0, 12).map((error) => (
          <Text key={error} style={s.li}>
            {error}
          </Text>
        ))}
      </View>
    </Screen>
  );
}

interface MainProps {
  questions: Question[];
  period: Period;
  params: DevParams;
  boot: Boot;
}

function Main({ questions, period, params, boot }: MainProps) {
  const [settings, setSettings] = useState<StoredSettings>(() => {
    const stored = boot.settings;
    const locale = params.locale ?? stored.locale;
    const msPerChar = { ...stored.msPerChar };
    if (params.msPerChar !== null) msPerChar[locale] = params.msPerChar;
    const sound = params.sound === null ? stored.sound : { ...stored.sound, enabled: params.sound };
    setSoundSettings(sound);
    return { ...stored, locale, msPerChar, sound };
  });
  const [runs, setRuns] = useState<RunRecord[]>(boot.runs);
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const runCounter = useRef(0);

  // debug のときは画面の切り替えを端末のログに出す（console.log はリリースビルドでは出ないので warn）
  useEffect(() => {
    if (params.debug) console.warn(`[qth] screen=${screen.name} ${soundStatus()}`);
  }, [params.debug, screen]);

  const locale = settings.locale;
  const strings = STRINGS[locale];
  const msPerChar = settings.msPerChar[locale];

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
  // 設定画面（§10-4）で使う。それまでは計算だけしておく
  const pace = useMemo(() => estimatePace(playable, locale, runSettings), [playable, locale, runSettings]);
  void pace;

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
        appendRun(runs, {
          id: newRunId(),
          playerId: boot.playerId,
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
  // 設定画面（§10-4）で使う
  void changeLocale;
  void changeSpeed;
  void changeSound;

  // 自動再生：開いたらすぐ走り出す
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!params.demo || autoStarted.current) return;
    autoStarted.current = true;
    startRun(now());
  }, [params.demo, startRun]);

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

  // 記録と設定の画面は §10-4 で足す。それまではタイトルに戻す
  return (
    <TitleScreen
      strings={strings}
      locale={locale}
      periodLabel={periodLabel}
      tags={tags}
      bestPoints={entry ? scoreToPoints(entry.bestScore) : null}
      onStart={startRun}
      onRecords={() => setScreen({ name: 'title' })}
      onSettings={() => setScreen({ name: 'title' })}
    />
  );
}
