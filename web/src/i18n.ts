import type { Locale } from '@core';
import type { IconName } from './components/PixelIcon';
import type { SoundName } from './sound';

/** 画面の文言。問題文と選択肢は問題セットの側にある */
export interface Strings {
  appTitle: string;
  tagline: string;
  workingTitle: string;
  tempData: string;
  hardWeek: string;
  practice: string;
  demo: string;

  language: string;
  languageName: string;
  speed: string;
  speedUnit: string;
  start: string;
  records: string;
  best: string;
  paceLongest: (seconds: string) => string;
  paceAllTimeout: (minutes: string) => string;
  paceOver: (count: number) => string;
  hintMove: string;
  hintChange: string;
  hintSelect: string;

  settings: string;
  sound: string;
  /** 効果音ごとの名前。設定画面で1つずつオン・オフする */
  soundNames: Record<SoundName, string>;
  on: string;
  off: string;

  correct: string;
  /** 正解の記号。日本語は丸、英語はチェック */
  correctIcon: IconName;
  timeUp: string;
  hintChoose: string;
  hintConfirm: string;

  resultTitle: string;
  score: string;
  time: string;
  correctCount: string;
  timeouts: string;
  newBest: string;
  attempt: (n: number) => string;
  notRecorded: string;
  retry: string;
  toTitle: string;

  recordsTitle: string;
  attempts: string;
  bestScore: string;
  firstScore: string;
  accuracyAll: string;
  medianTime: (count: number) => string;
  totalAnswered: string;
  noRuns: string;
  colAttempt: string;
  colSpeed: string;
  back: string;

  dataError: string;
}

export const STRINGS: Record<Locale, Strings> = {
  ja: {
    appTitle: '速読トリビア',
    tagline: '100問タイムアタック',
    workingTitle: '仮称',
    tempData: '仮データ',
    hardWeek: '激ムズウィーク',
    practice: 'お試し',
    demo: 'DEMO',

    language: '言語',
    languageName: '日本語',
    speed: '文字の速さ',
    speedUnit: 'ミリ秒／文字',
    start: 'スタート',
    records: '記録',
    best: 'ベスト',
    paceLongest: (s) => `一番長い問題文の表示 ${s}秒`,
    paceAllTimeout: (m) => `全問時間切れで ${m}分`,
    paceOver: (n) => `表示に10秒を超える問題が ${n}問あります`,
    hintMove: 'えらぶ',
    hintChange: 'かえる',
    hintSelect: '決定',

    settings: '設定',
    sound: '効果音',
    soundNames: {
      cursor: 'カーソル移動',
      change: '設定の変更',
      decide: '決定',
      back: '戻る・中断',
      ready: 'スタートの合図',
      type: '文字送り',
      select: '選択肢をえらぶ',
      urgent: '残り時間わずか',
      correct: '正解',
      wrong: '不正解',
      timeout: '時間切れ',
      finish: '結果',
      newBest: '自己ベスト更新',
    },
    on: 'ON',
    off: 'OFF',

    correct: '正解',
    correctIcon: 'ring',
    timeUp: '時間切れ',
    hintChoose: 'えらぶ',
    hintConfirm: '確定',

    resultTitle: '結果',
    score: 'スコア',
    time: 'タイム',
    correctCount: '正答数',
    timeouts: '時間切れ',
    newBest: '自己ベスト更新',
    attempt: (n) => `${n}回目の挑戦`,
    notRecorded: '記録には残しません',
    retry: 'もう一度',
    toTitle: 'タイトルへ',

    recordsTitle: '記録',
    attempts: '挑戦回数',
    bestScore: 'ベストスコア',
    firstScore: '1回目のスコア',
    accuracyAll: '正解率（全走行）',
    medianTime: (n) => `中央値・いまの速さ（${n}走行）`,
    totalAnswered: '累計回答数',
    noRuns: 'まだ記録がありません',
    colAttempt: '回',
    colSpeed: '速さ',
    back: '戻る',

    dataError: '問題データを読み込めませんでした',
  },
  en: {
    appTitle: 'SPEED TRIVIA',
    tagline: '100-question time attack',
    workingTitle: 'working title',
    tempData: 'temp data',
    hardWeek: 'Hard week',
    practice: 'Practice',
    demo: 'DEMO',

    language: 'Language',
    languageName: 'English',
    speed: 'Text speed',
    speedUnit: 'ms / char',
    start: 'Start',
    records: 'Records',
    best: 'Best',
    paceLongest: (s) => `Longest question takes ${s} s to show`,
    paceAllTimeout: (m) => `${m} min if every question times out`,
    paceOver: (n) => `${n} question(s) take over 10 s to show`,
    hintMove: 'Move',
    hintChange: 'Change',
    hintSelect: 'Select',

    settings: 'Settings',
    sound: 'Sound',
    soundNames: {
      cursor: 'Cursor move',
      change: 'Value change',
      decide: 'Select',
      back: 'Back / quit',
      ready: 'Ready jingle',
      type: 'Text typing',
      select: 'Pick a choice',
      urgent: 'Running out',
      correct: 'Correct',
      wrong: 'Wrong',
      timeout: 'Time up',
      finish: 'Result',
      newBest: 'New best',
    },
    on: 'ON',
    off: 'OFF',

    correct: 'Correct',
    correctIcon: 'check',
    timeUp: 'Time up',
    hintChoose: 'Choose',
    hintConfirm: 'Confirm',

    resultTitle: 'Result',
    score: 'Score',
    time: 'Time',
    correctCount: 'Correct',
    timeouts: 'Timeouts',
    newBest: 'New personal best',
    attempt: (n) => `Attempt ${n}`,
    notRecorded: 'Not recorded',
    retry: 'Play again',
    toTitle: 'Title',

    recordsTitle: 'Records',
    attempts: 'Attempts',
    bestScore: 'Best score',
    firstScore: 'First-run score',
    accuracyAll: 'Accuracy (all runs)',
    medianTime: (n) => `Median, this speed (${n} runs)`,
    totalAnswered: 'Total answered',
    noRuns: 'No runs yet',
    colAttempt: '#',
    colSpeed: 'Speed',
    back: 'Back',

    dataError: 'Could not load the question data',
  },
};
