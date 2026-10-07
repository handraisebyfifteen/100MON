// 設計書 §9「データ構造」の型。アプリ・パイプライン・バックエンドで同じ形を使う。

export type Locale = 'ja' | 'en';
export const LOCALES: readonly Locale[] = ['ja', 'en'];

/** 最初級 / 初級 / 中級 / 上級 / 最上級 / ヘルモード */
export type Difficulty = 'beginner0' | 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'hell';
export const DIFFICULTIES: readonly Difficulty[] = [
  'beginner0',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
  'hell',
];

export const CHOICE_COUNT = 4;

export interface LocalizedQuestion {
  /** 問題文 */
  text: string;
  choices: [string, string, string, string];
  /** 確定位置（何文字目で答えが確定するか）。1 始まり */
  decisionPoint: number;
}

export interface Question {
  id: string;
  /** 正解の位置（言語共通）。0〜3 */
  answerIndex: number;
  category: string;
  difficulty: Difficulty;
  locales: Record<Locale, LocalizedQuestion>;
}

export interface Period {
  id: string;
  /** UTC */
  startsAt: string;
  /** UTC */
  endsAt: string;
  /** 1〜4、決勝は 5 */
  quarter: number;
  /** 激ムズウィークか */
  isHardWeek: boolean;
  questionIds: string[];
  /** 指定があれば Config より優先（激ムズウィーク用） */
  baseTimeSec?: number;
  /** 同上 */
  answerWindowSec?: number;
  /** 激ムズウィークは 2。判定はサーバー側で行う */
  maxAttempts?: number;
  /** 激ムズウィークは 60。判定はサーバー側で行う */
  retryWindowMin?: number;
}

/** サーバー設定値 */
export interface Config {
  baseTimeSec: number;
  answerWindowSec: number;
  typewriterMsPerChar: number;
  /**
   * 言語ごとの表示速度。指定があれば typewriterMsPerChar より優先。
   * 「日本語と英語で分けるか」は未確定（設計書 §18）。分けて試せるように置いてある。
   */
  typewriterMsPerCharByLocale?: Partial<Record<Locale, number>>;
  /** 確定の直後に入力を受け付けない時間 */
  inputLockMs?: number;
}

export interface Answer {
  questionId: string;
  /** 何番目に出題されたか。1 始まり */
  order: number;
  chosenIndex: number | null;
  correct: boolean;
  /** 時間切れ（誤答とは別に記録） */
  timedOut: boolean;
  elapsedMs: number;
}
