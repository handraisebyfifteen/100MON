import { computeScore, questionScore } from './score';
import { mulberry32, shuffled } from './rng';
import type { RunSettings } from './settings';
import { splitChars, typingDurationMs, visibleCharCount } from './text';
import { CHOICE_COUNT } from './types';
import type { Answer, Locale, Question } from './types';

export interface RunOptions {
  /** 出題する問題（ピリオドの100問）。出題順は seed で並べ替える */
  questions: readonly Question[];
  locale: Locale;
  settings: RunSettings;
  /** 出題順を決める種。走行ごとに変える */
  seed: number;
  /**
   * 開始時刻。以後すべて、同じ時計（後戻りしないミリ秒）の値を渡す。
   * 先の時刻を渡すと、その時刻までは始まらない（文字は出ず、入力も受け付けない）。
   */
  now: number;
}

/** typing：問題文を表示中 / countdown：出揃って回答の猶予を消費中 */
export type QuestionPhase = 'typing' | 'countdown';

/** いま出題中の問題の状態。画面はこれだけを見て描く */
export interface QuestionView {
  phase: QuestionPhase;
  /** 0 始まり */
  index: number;
  total: number;
  question: Question;
  chars: readonly string[];
  choices: readonly string[];
  visibleChars: number;
  startedAt: number;
  typingMs: number;
  /** 問題文が出揃う時刻。ここから枠が減り始める */
  countdownStartsAt: number;
  /** 時間切れになる時刻 */
  deadlineAt: number;
  /** 回答の猶予の残り。表示中は満タンのまま */
  remainingMs: number;
  selected: number | null;
  inputLocked: boolean;
  correctCount: number;
  /** 直前までの連続正解数。不正解・時間切れで 0 に戻る */
  streak: number;
  lastAnswer: Answer | null;
}

export interface RunResult {
  locale: Locale;
  seed: number;
  settings: RunSettings;
  answers: Answer[];
  totalMs: number;
  questionCount: number;
  correctCount: number;
  timedOutCount: number;
  /** 正答率（0〜1） */
  accuracy: number;
  score: number;
}

interface Item {
  question: Question;
  chars: string[];
  choices: readonly string[];
  typingMs: number;
}

/**
 * 1走行ぶんの進行。
 *
 * 時間はすべて、呼び出し側が渡す時刻（タイムスタンプ）だけで決まる。
 * 描画の間隔には依存しないので、描画が詰まっても記録はずれない。
 * 時計も画面も持たないため、ブラウザ版と Vega 版で同じものを使える。
 */
export class RunEngine {
  readonly locale: Locale;
  readonly settings: RunSettings;
  readonly seed: number;
  readonly startedAt: number;
  readonly total: number;

  private readonly items: Item[];
  private readonly answers: Answer[] = [];
  private index = 0;
  private questionStartedAt: number;
  private selected: number | null = null;
  private lockedUntil: number;
  private clock: number;
  private finishedAt: number | null = null;
  private correctCount = 0;
  private streak = 0;
  private readonly questionScores: number[] = [];

  constructor(options: RunOptions) {
    if (options.questions.length === 0) {
      throw new Error('RunEngine: questions is empty');
    }
    this.locale = options.locale;
    this.settings = options.settings;
    this.seed = options.seed;
    this.startedAt = options.now;
    this.total = options.questions.length;

    const order = shuffled(options.questions, mulberry32(options.seed));
    this.items = order.map((question) => {
      const localized = question.locales[options.locale];
      const chars = splitChars(localized.text);
      return {
        question,
        chars,
        choices: localized.choices,
        typingMs: typingDurationMs(chars.length, options.settings.msPerChar),
      };
    });

    this.clock = options.now;
    this.questionStartedAt = options.now;
    this.lockedUntil = options.now + options.settings.inputLockMs;
  }

  get finished(): boolean {
    return this.finishedAt !== null;
  }

  /** 方向キー：選択肢を選ぶ。受け付けたら true */
  select(choiceIndex: number, now: number): boolean {
    const t = this.advance(now);
    if (this.finishedAt !== null || t < this.lockedUntil) return false;
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= CHOICE_COUNT) return false;
    this.selected = choiceIndex;
    return true;
  }

  /** 中央ボタン：確定。どれも選んでいなければ何も起きない。受け付けたら true */
  confirm(now: number): boolean {
    const t = this.advance(now);
    if (this.finishedAt !== null || t < this.lockedUntil) return false;
    if (this.selected === null) return false;
    this.record(this.selected, t, false);
    return true;
  }

  /** 時刻を進め、出題中の問題の状態を返す。走り終えていたら null */
  tick(now: number): QuestionView | null {
    const t = this.advance(now);
    if (this.finishedAt !== null) return null;

    const item = this.items[this.index] as Item;
    const countdownStartsAt = this.questionStartedAt + item.typingMs;
    const deadlineAt = countdownStartsAt + this.settings.answerWindowMs;
    const typing = t < countdownStartsAt;
    return {
      phase: typing ? 'typing' : 'countdown',
      index: this.index,
      total: this.total,
      question: item.question,
      chars: item.chars,
      choices: item.choices,
      visibleChars: visibleCharCount(t - this.questionStartedAt, item.chars.length, this.settings.msPerChar),
      startedAt: this.questionStartedAt,
      typingMs: item.typingMs,
      countdownStartsAt,
      deadlineAt,
      remainingMs: typing ? this.settings.answerWindowMs : Math.max(0, deadlineAt - t),
      selected: this.selected,
      inputLocked: t < this.lockedUntil,
      correctCount: this.correctCount,
      streak: this.streak,
      lastAnswer: this.answers.length > 0 ? (this.answers[this.answers.length - 1] as Answer) : null,
    };
  }

  /** 走り終えたあとの結果 */
  result(): RunResult {
    if (this.finishedAt === null) {
      throw new Error('RunEngine: run is not finished');
    }
    const totalMs = Math.round(this.finishedAt - this.startedAt);
    const timedOutCount = this.answers.filter((a) => a.timedOut).length;
    return {
      locale: this.locale,
      seed: this.seed,
      settings: this.settings,
      answers: this.answers.slice(),
      totalMs,
      questionCount: this.total,
      correctCount: this.correctCount,
      timedOutCount,
      accuracy: this.correctCount / this.total,
      score: computeScore(this.questionScores, this.total),
    };
  }

  /**
   * 時刻 now までに過ぎた締切を、時間切れとして順に処理する。
   * 次の問題は「締切の時刻」から始める（処理が遅れたぶんを次の問題に持ち越さない）。
   * 渡された時刻が前回より古い場合は、前回の時刻として扱う。
   */
  private advance(now: number): number {
    const t = Math.max(now, this.clock);
    this.clock = t;
    while (this.finishedAt === null) {
      const item = this.items[this.index] as Item;
      const deadlineAt = this.questionStartedAt + item.typingMs + this.settings.answerWindowMs;
      if (t < deadlineAt) break;
      this.record(null, deadlineAt, true);
    }
    return t;
  }

  private record(chosenIndex: number | null, at: number, timedOut: boolean): void {
    const item = this.items[this.index] as Item;
    const correct = chosenIndex !== null && chosenIndex === item.question.answerIndex;
    this.answers.push({
      questionId: item.question.id,
      order: this.index + 1,
      chosenIndex,
      correct,
      timedOut,
      elapsedMs: Math.round(at - this.questionStartedAt),
    });
    if (correct) this.correctCount += 1;
    this.streak = correct ? this.streak + 1 : 0;
    this.questionScores.push(
      questionScore(correct, at - this.questionStartedAt, item.typingMs + this.settings.answerWindowMs),
    );

    this.index += 1;
    this.selected = null;
    this.questionStartedAt = at;
    // 確定の直後だけでなく時間切れの直後も、前の問題のつもりで押した入力を拾わないようにする
    this.lockedUntil = at + this.settings.inputLockMs;
    if (this.index >= this.items.length) {
      this.finishedAt = at;
    }
  }
}
