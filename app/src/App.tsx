import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  buildPeriodEntry,
  DEFAULT_CONFIG,
  estimatePace,
  median,
  resolveSettings,
  RunEngine,
  mulberry32,
  scoreToPoints,
  shuffled,
} from '@core';
import type { Locale, Period, Question, RunRecord, RunResult } from '@core';
import { Screen, StageView } from './components/Screen';
import { IS_TEMP_DATA, loadData, loadExhibition } from './data';
import type { ExhibitionLevel } from './data';
import { createDemoBot } from './demo';
import type { DemoBot } from './demo';
import { DEV_PARAMS } from './devParams';
import type { DevParams } from './devParams';
import { formatPeriodRange } from './format';
import { STRINGS } from './i18n';
import { ApiError, finishRun as reportFinish, startRun as reportStart } from './platform/api';
import { now } from './platform/input';
import { useStyles } from './platform/layout';
import type { Stage } from './platform/layout';
import { initSound, playSound, setSoundSettings, soundStatus } from './platform/sound';
import type { SoundSettings } from './platform/sound';
import { appendRun, getPlayerId, loadRuns, loadSettings, newRunId, saveSettings } from './platform/storage';
import type { StoredSettings } from './platform/storage';
import { GameScreen } from './screens/Game';
import { RankingScreen } from './screens/Ranking';
import { ExhibitionScreen } from './screens/Exhibition';
import { RecordsScreen } from './screens/Records';
import { ResultScreen } from './screens/Result';
import type { ServerResult } from './screens/Result';
import { SettingsScreen } from './screens/Settings';
import { TitleScreen } from './screens/Title';
import { COLORS, FONTS, setInverted } from './theme';

// ブラウザ版の web/src/App.tsx と同じ構造。違いは次の5つ。
//   - URL パラメータの代わりに devParams.ts の定数を使う
//   - 保存と効果音の読み込みが非同期なので、読み終えるまで画面を出さない（§7）
//   - 消灯を防ぐ wakeLock と、ページの言語の切り替えは無い
//   - ランキングのサーバーに走行の開始と終了を申告する（Vega 版だけ。platform/api.ts）
//   - エキシビジョン（終わったピリオドの問題で、記録に残さず遊ぶ）がある

/** 自動再生で結果画面を出しておく時間 */
const DEMO_RESULT_MS = 8000;

/** 最後の問題の判定の音が鳴り終わってから、結果の音を鳴らす */
const RESULT_SOUND_DELAY_MS = 500;

/** エキシビジョンの激ムズの回答の猶予。激ムズウィーク（設計書 §6）と同じ */
const HELL_ANSWER_WINDOW_SEC = 10;

/** 走り出す前に「READY」を出す時間。タイムには含めない。0 にすると出さない */
const READY_MS = 1200;

/** サーバーに申告した走行。終了時に同じ runId で結果を送る */
interface OnlineRun {
  runId: string;
  attemptNumber: number;
}

/**
 * 公式戦：今週の100問。記録に残し、サーバーに申告してランキングに載せる。
 * エキシビジョン：今月の問題と終わったピリオドの問題から、選んだ難易度・数だけ。記録にもランキングにも残さない。
 */
type Mode = { kind: 'official' } | { kind: 'exhibition'; level: ExhibitionLevel; count: number };
const OFFICIAL: Mode = { kind: 'official' };

type Screen =
  | { name: 'title' }
  | { name: 'exhibition' }
  | {
      name: 'game';
      runKey: number;
      mode: Mode;
      engine: RunEngine;
      bot: DemoBot | null;
      startedAtIso: string;
      online: OnlineRun | null;
      /** 申告しようとして断られた理由。申告しない走行では null */
      offlineReason: string | null;
    }
  | { name: 'result'; runKey: number; mode: Mode; result: RunResult; attemptNumber: number | null; isNewBest: boolean }
  | { name: 'ranking' }
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
  const pace = useMemo(() => estimatePace(playable, locale, runSettings), [playable, locale, runSettings]);
  // エキシビジョンの問題（今月の既定の問題と、起動した時点で終わっているピリオドの問題）
  const pools = useMemo(() => loadExhibition(Date.now()), []);
  const poolSizes = useMemo(
    () => ({
      beginner: pools.beginner.length,
      intermediate: pools.intermediate.length,
      advanced: pools.advanced.length,
      hell: pools.hell.length,
    }),
    [pools],
  );
  // 問題数の画面から戻ってきたときに、前に選んだ難易度に合わせておく
  const [exhibitionLevel, setExhibitionLevel] = useState<ExhibitionLevel | null>(null);
  // エキシビジョンはピリオドに属さないので標準の設定で走る。激ムズだけは激ムズウィークと同じ猶予にする
  const exhibitionSettings = useCallback(
    (level: ExhibitionLevel) =>
      resolveSettings(DEFAULT_CONFIG, null, locale, {
        msPerChar,
        ...(level === 'hell' ? { answerWindowMs: HELL_ANSWER_WINDOW_SEC * 1000 } : {}),
        ...(params.answerWindowSec !== null ? { answerWindowMs: params.answerWindowSec * 1000 } : {}),
      }),
    [locale, msPerChar, params.answerWindowSec],
  );

  const periodRuns = useMemo(
    () => runs.filter((run) => run.periodId === period.id && run.locale === locale),
    [runs, period.id, locale],
  );
  const entry = useMemo(() => buildPeriodEntry(periodRuns), [periodRuns]);

  // 自動再生とお試し（問題数を減らした走行）は記録に残さない
  const recordable = !params.demo && params.questionLimit === null;
  // 記録に残す走行だけ、サーバーに申告してランキングに載せる
  const reportable = recordable && params.online;

  // サーバーに走行開始を申告している間（タイトルで待つ）
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  // 直近の走行のサーバーの扱い（結果画面に出す）
  const [server, setServer] = useState<ServerResult>({ status: 'none' });

  const startRun = useCallback((mode: Mode): void => {
    if (starting.current) return;
    starting.current = true;
    void (async () => {
      let seed = params.seed ?? randomSeed();
      let engineSettings = mode.kind === 'official' ? runSettings : exhibitionSettings(mode.level);
      // エキシビジョンは、その難易度の問題から毎回選び直す（並びは RunEngine がさらに混ぜる）
      const runQuestions =
        mode.kind === 'official' ? playable : shuffled(pools[mode.level], mulberry32(seed + 1)).slice(0, mode.count);
      let online: OnlineRun | null = null;
      let offlineReason: string | null = null;
      if (mode.kind === 'official' && reportable) {
        setBusy(true);
        try {
          const started = await reportStart({ playerId: boot.playerId, periodId: period.id, locale, seed: params.seed });
          // サーバーが決めた種と設定で走る。終了時にサーバーが同じ種・設定で検証するため
          seed = started.seed;
          engineSettings = started.settings;
          online = { runId: started.runId, attemptNumber: started.attemptNumber };
        } catch (error) {
          // つながらない・期間外などは、端末内の記録だけの走行にする
          offlineReason = error instanceof ApiError ? error.code : 'OFFLINE';
        }
        setBusy(false);
      }
      starting.current = false;
      runCounter.current += 1;
      setScreen({
        name: 'game',
        runKey: runCounter.current,
        mode,
        // 開始を少し先の時刻にしておくと、その間は RunEngine が待ってくれる
        engine: new RunEngine({ questions: runQuestions, locale, settings: engineSettings, seed, now: now() + READY_MS }),
        bot: params.demo ? createDemoBot(seed) : null,
        startedAtIso: new Date(Date.now() + READY_MS).toISOString(),
        online,
        offlineReason,
      });
    })();
  }, [params.seed, params.demo, reportable, boot.playerId, period.id, playable, pools, locale, runSettings, exhibitionSettings]);

  const finishRun = (result: RunResult, runKey: number, game: Extract<Screen, { name: 'game' }>): void => {
    let attemptNumber: number | null = null;
    let isNewBest = false;
    if (recordable && game.mode.kind === 'official') {
      attemptNumber = periodRuns.reduce((max, run) => Math.max(max, run.attemptNumber), 0) + 1;
      isNewBest = entry !== null && result.score > entry.bestScore;
      setRuns(
        appendRun(runs, {
          id: newRunId(),
          playerId: boot.playerId,
          periodId: period.id,
          locale: result.locale,
          attemptNumber,
          startedAt: game.startedAtIso,
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
    setScreen({
      name: 'result',
      runKey,
      mode: game.mode,
      result,
      // 申告した走行は、サーバーが数えた回数を出す（入れ直しても続きから数えられる）
      attemptNumber: game.online?.attemptNumber ?? attemptNumber,
      isNewBest,
    });

    if (game.online !== null) {
      const { runId } = game.online;
      setServer({ status: 'pending' });
      reportFinish(runId, { playerId: boot.playerId, answers: result.answers, clientTotalMs: Math.round(result.totalMs) })
        .then((finished) => {
          if (runCounter.current !== runKey) return;
          setServer({ status: 'ok', rank: finished.rank, entrants: finished.entrants, isNewBest: finished.isNewBest });
        })
        .catch((error: unknown) => {
          if (runCounter.current !== runKey) return;
          setServer({ status: 'error', code: error instanceof ApiError ? error.code : 'OFFLINE' });
        });
    } else if (game.offlineReason !== null) {
      setServer({ status: 'offline', reason: game.offlineReason });
    } else {
      setServer({ status: 'none' });
    }
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

  // 自動再生：開いたらすぐ走り出す
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!params.demo || autoStarted.current) return;
    autoStarted.current = true;
    startRun(OFFICIAL);
  }, [params.demo, startRun]);

  const periodLabel = `${period.id}　${formatPeriodRange(period.startsAt, period.endsAt)}`;
  const tags = [
    ...(period.isHardWeek ? [strings.hardWeek] : []),
    ...(IS_TEMP_DATA ? [strings.tempData] : []),
    ...(params.questionLimit !== null ? [strings.practice] : []),
    ...(params.demo ? [strings.demo] : []),
  ];

  // 激ムズの画面は色を反転する（オーナー希望 2026-10-16）。激ムズウィークの間はアプリ全体、
  // エキシビジョンの激ムズは走行と結果の画面。各画面は出したときに色を読むので、ここで先に切り替える
  setInverted(
    (screen.name === 'game' || screen.name === 'result') && screen.mode.kind === 'exhibition'
      ? screen.mode.level === 'hell'
      : period.isHardWeek,
  );

  if (screen.name === 'game') {
    const game = screen;
    return (
      <GameScreen
        key={game.runKey}
        engine={game.engine}
        strings={strings}
        periodLabel={game.mode.kind === 'official' ? period.id : strings.exhibition}
        tags={
          game.mode.kind === 'official'
            ? [...tags, ...(game.offlineReason !== null ? [strings.offline] : [])]
            : [
                strings.levelNames[game.mode.level],
                strings.questionCount(game.mode.count),
                ...(params.demo ? [strings.demo] : []),
              ]
        }
        bot={game.bot}
        onFinish={(result) => finishRun(result, game.runKey, game)}
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
        server={server}
        autoContinueMs={params.demo ? DEMO_RESULT_MS : null}
        onRetry={() => startRun(screen.mode)}
        onTitle={() => setScreen({ name: 'title' })}
      />
    );
  }

  if (screen.name === 'exhibition') {
    return (
      <ExhibitionScreen
        strings={strings}
        poolSizes={poolSizes}
        initialLevel={exhibitionLevel}
        onStart={(level, count) => {
          setExhibitionLevel(level);
          startRun({ kind: 'exhibition', level, count });
        }}
        onBack={() => setScreen({ name: 'title' })}
      />
    );
  }

  if (screen.name === 'ranking') {
    return (
      <RankingScreen
        strings={strings}
        periodLabel={`${periodLabel}　${STRINGS[locale].languageName}`}
        periodId={period.id}
        locale={locale}
        playerId={boot.playerId}
        onBack={() => setScreen({ name: 'title' })}
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
      busy={busy}
      onStart={() => startRun(OFFICIAL)}
      onExhibition={() => setScreen({ name: 'exhibition' })}
      onRanking={() => setScreen({ name: 'ranking' })}
      onRecords={() => setScreen({ name: 'records' })}
      onSettings={() => setScreen({ name: 'settings' })}
    />
  );
}
