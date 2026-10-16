import type { Locale } from '@core';
import type { ExhibitionLevel } from './data';
import type { IconName } from './components/PixelIcon';
import type { SoundName } from './platform/sound';

/** 画面の文言。問題文と選択肢は問題セットの側にある */
export interface Strings {
  appTitle: string;
  tagline: string;
  tempData: string;
  hardWeek: string;
  practice: string;
  demo: string;

  language: string;
  languageName: string;
  speed: string;
  speedUnit: string;
  /** 表示速度の行を選んでいるときに出す注意 */
  speedNote: string;
  start: string;
  /** タイトルのメニュー：週の100問で順位を競う */
  official: string;
  /** タイトルのメニュー：終わったピリオドの問題で、記録に残さず遊ぶ */
  exhibition: string;
  exhibitionNote: string;
  /** エキシビジョンの難易度の名前 */
  levelNames: Record<ExhibitionLevel, string>;
  exhibitionPool: (n: number) => string;
  /** その難易度の問題が無いとき */
  exhibitionEmpty: string;
  questionCount: (n: number) => string;
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
  streak: (n: number) => string;
  /** 正解の記号。日本語は丸、英語はチェック */
  correctIcon: IconName;
  timeUp: string;
  hintChoose: string;
  hintConfirm: string;

  resultTitle: string;
  score: string;
  scoreMax: string;
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

  /** ランキング（サーバーの値。Vega 版だけ） */
  ranking: string;
  rankingTitle: string;
  loading: string;
  connecting: string;
  entrants: (n: number) => string;
  you: string;
  colRank: string;
  colName: string;
  colPoints: string;
  colAttempts: string;
  noEntries: string;
  reload: string;
  /** 結果画面の順位の行 */
  rankPending: string;
  rankLine: (rank: number, entrants: number) => string;
  rankFailed: (code: string) => string;
  notRanked: (reason: string) => string;
  /** サーバーに申告できなかった走行の札 */
  offline: string;
  /** サーバーが弾いた理由を人の言葉に */
  serverReason: (code: string) => string;

  dataError: string;
}

export const STRINGS: Record<Locale, Strings> = {
  ja: {
    appTitle: '100MON',
    tagline: '100問タイムアタック',
    tempData: '仮データ',
    hardWeek: '激ムズウィーク',
    practice: 'お試し',
    demo: 'DEMO',

    language: '言語',
    languageName: '日本語',
    speed: '文字の速さ',
    speedUnit: 'ミリ秒／文字',
    speedNote: 'ランキングの走行には効きません（サーバーの速さで走ります）',
    start: 'スタート',
    official: '公式戦',
    exhibition: 'エキシビジョン',
    exhibitionNote: '今月の問題と、終わったピリオドの問題で遊ぶ。記録に残らず、ランキングにも載らない',
    levelNames: { beginner: '初級', intermediate: '中級', advanced: '上級', hell: '激ムズ' },
    exhibitionPool: (n) => `${n}問から出題`,
    exhibitionEmpty: 'この難易度の問題はまだありません',
    questionCount: (n) => `${n}問`,
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
      streak: '10問連続正解ごと',
      wrong: '不正解',
      timeout: '時間切れ',
      finish: '結果',
      newBest: '自己ベスト更新',
    },
    on: 'ON',
    off: 'OFF',

    correct: '正解',
    streak: (n) => `${n}問連続正解！`,
    correctIcon: 'ring',
    timeUp: '時間切れ',
    hintChoose: 'えらぶ',
    hintConfirm: '確定',

    resultTitle: '結果',
    score: 'スコア',
    scoreMax: '/1000',
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

    ranking: 'ランキング',
    rankingTitle: 'ランキング',
    loading: '読み込んでいます…',
    connecting: 'サーバーにつないでいます…',
    entrants: (n) => `参加 ${n}人`,
    you: 'あなた',
    colRank: '順位',
    colName: '名前',
    colPoints: 'ベスト',
    colAttempts: '挑戦',
    noEntries: 'まだ誰も走っていません',
    reload: 'もう一度',
    rankPending: '順位を取得しています…',
    rankLine: (rank, entrants) => `順位 ${rank}位 ／ ${entrants}人`,
    rankFailed: (code) => `順位を取得できませんでした（${code}）`,
    notRanked: (reason) => `ランキング対象外：${reason}`,
    offline: 'オフライン',
    serverReason: (code) =>
      ({
        OFFLINE: 'サーバーにつながりません',
        TIMEOUT: 'サーバーの応答がありません',
        PERIOD_CLOSED: '今は期間外です',
        PERIOD_NOT_FOUND: 'この週の問題がサーバーにありません',
        ATTEMPTS_EXHAUSTED: '今週の挑戦回数を使い切りました',
        RETRY_WINDOW_CLOSED: '2回目の期限を過ぎました',
      })[code] ?? `サーバーに断られました（${code}）`,
    colAttempt: '回',
    colSpeed: '速さ',
    back: '戻る',

    dataError: '問題データを読み込めませんでした',
  },
  en: {
    appTitle: '100MON',
    tagline: '100-question time attack',
    tempData: 'temp data',
    hardWeek: 'Hard week',
    practice: 'Practice',
    demo: 'DEMO',

    language: 'Language',
    languageName: 'English',
    speed: 'Text speed',
    speedUnit: 'ms / char',
    speedNote: 'Not used in ranked runs (the server sets the speed)',
    start: 'Start',
    official: 'Official match',
    exhibition: 'Exhibition',
    exhibitionNote: "This month's set plus questions from past periods. Not recorded or ranked",
    levelNames: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', hell: 'Hell' },
    exhibitionPool: (n) => `Drawn from ${n} questions`,
    exhibitionEmpty: 'No questions at this level yet',
    questionCount: (n) => `${n} questions`,
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
      streak: 'Every 10 in a row',
      wrong: 'Wrong',
      timeout: 'Time up',
      finish: 'Result',
      newBest: 'New best',
    },
    on: 'ON',
    off: 'OFF',

    correct: 'Correct',
    streak: (n) => `${n} IN A ROW!`,
    correctIcon: 'check',
    timeUp: 'Time up',
    hintChoose: 'Choose',
    hintConfirm: 'Confirm',

    resultTitle: 'Result',
    score: 'Score',
    scoreMax: '/1000',
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

    ranking: 'Ranking',
    rankingTitle: 'Ranking',
    loading: 'Loading…',
    connecting: 'Connecting to the server…',
    entrants: (n) => `${n} players`,
    you: 'You',
    colRank: 'Rank',
    colName: 'Name',
    colPoints: 'Best',
    colAttempts: 'Tries',
    noEntries: 'Nobody has run yet',
    reload: 'Reload',
    rankPending: 'Getting your rank…',
    rankLine: (rank, entrants) => `Rank ${rank} of ${entrants}`,
    rankFailed: (code) => `Could not get your rank (${code})`,
    notRanked: (reason) => `Not ranked: ${reason}`,
    offline: 'OFFLINE',
    serverReason: (code) =>
      ({
        OFFLINE: 'cannot reach the server',
        TIMEOUT: 'the server did not respond',
        PERIOD_CLOSED: 'this week is not open',
        PERIOD_NOT_FOUND: 'this week is not on the server',
        ATTEMPTS_EXHAUSTED: 'no attempts left this week',
        RETRY_WINDOW_CLOSED: 'the retry window has closed',
      })[code] ?? `the server refused (${code})`,
    colAttempt: '#',
    colSpeed: 'Speed',
    back: 'Back',

    dataError: 'Could not load the question data',
  },
};
