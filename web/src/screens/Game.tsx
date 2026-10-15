import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { CHOICE_DIRECTIONS, choiceIndexOf } from '@core';
import type { Answer, QuestionView, RunEngine, RunResult } from '@core';
import { FrameTimer } from '../components/FrameTimer';
import { KeyHint } from '../components/KeyHint';
import { PixelIcon } from '../components/PixelIcon';
import type { DemoBot } from '../demo';
import { choiceSize, questionSize } from '../format';
import type { Strings } from '../i18n';
import { eventTime, useRemoteInput } from '../input';
import { playSound } from '../sound';

/** 枠の色を変える残り時間。色は補助で、残り時間そのものは枠の長さで伝える */
const URGENT_MS = 1500;
/** 連続正解をこの数から出す */
const STREAK_SHOW_FROM = 5;
/** 連続正解がこの数の倍数になるたびに、特別な音と演出を出す */
const STREAK_MILESTONE = 10;

interface GameProps {
  engine: RunEngine;
  strings: Strings;
  periodLabel: string;
  tags: readonly string[];
  /** 自動再生の操作役。通常は null */
  bot: DemoBot | null;
  onFinish: (result: RunResult) => void;
  onAbort: () => void;
}

interface Shown {
  view: QuestionView;
  urgent: boolean;
  /** 走り出す前の「READY」を出している間 */
  waiting: boolean;
}

/** 直前の問題の判定 */
type Verdict = 'correct' | 'wrong' | 'timeout';

function verdictOf(answer: Answer): Verdict {
  if (answer.timedOut) return 'timeout';
  return answer.correct ? 'correct' : 'wrong';
}

/** 判定の音。連続正解の節目では、正解の音の代わりに特別な音を鳴らす */
function playVerdict(answer: Answer, streak: number): void {
  if (answer.correct && streak > 0 && streak % STREAK_MILESTONE === 0) playSound('streak');
  else playSound(verdictOf(answer));
}

/** 末尾から数えた連続正解の数 */
function trailingStreak(answers: readonly Answer[]): number {
  let n = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i]?.correct; i--) n++;
  return n;
}

export function GameScreen({ engine, strings, periodLabel, tags, bot, onFinish, onAbort }: GameProps) {
  const [shown, setShown] = useState<Shown | null>(() => {
    const now = performance.now();
    const view = engine.tick(now);
    return view ? { view, urgent: false, waiting: now < engine.startedAt } : null;
  });
  const step = useRef<(now: number) => void>(() => {});
  // どこまで音を鳴らしたか。画面の描き直しとは別に覚えておく
  const heard = useRef({ ready: false, index: -1, chars: 0, selected: null as number | null, urgent: false });
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  });

  // 進行は RunEngine が時刻だけで決める。ここは毎フレーム状態を聞いて、変わったときだけ描き直す
  useEffect(() => {
    let raf = 0;
    let stopped = false;
    let lastKey = '';

    const run = (now: number): void => {
      if (stopped) return;
      let view = engine.tick(now);
      if (view && bot) {
        bot(engine, view, now);
        view = engine.tick(now);
      }
      if (!view) {
        stopped = true;
        const result = engine.result();
        const last = result.answers[result.answers.length - 1];
        if (last) playVerdict(last, trailingStreak(result.answers));
        finish.current(result);
        return;
      }
      const urgent = view.phase === 'countdown' && view.remainingMs <= URGENT_MS;
      const waiting = now < engine.startedAt;

      const h = heard.current;
      if (waiting && !h.ready) playSound('ready');
      h.ready = true;
      if (view.index !== h.index) {
        if (h.index >= 0 && view.lastAnswer) playVerdict(view.lastAnswer, view.streak);
        heard.current = { ready: true, index: view.index, chars: 0, selected: null, urgent: false };
      }
      const s = heard.current;
      if (!waiting && view.visibleChars > s.chars) playSound('type');
      if (view.selected !== null && view.selected !== s.selected) playSound('select');
      if (urgent && !s.urgent) playSound('urgent');
      s.chars = view.visibleChars;
      s.selected = view.selected;
      s.urgent = urgent;
      const key = `${view.index}|${view.visibleChars}|${view.selected}|${urgent}|${waiting}`;
      if (key !== lastKey) {
        lastKey = key;
        setShown({ view, urgent, waiting });
      }
    };
    step.current = run;

    const frame = (): void => {
      run(performance.now());
      if (!stopped) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [engine, bot]);

  const select = (choiceIndex: number, at: number): void => {
    if (bot) return;
    engine.select(choiceIndex, at);
    step.current(performance.now());
  };
  const confirm = (at: number): void => {
    if (bot) return;
    engine.confirm(at);
    step.current(performance.now());
  };

  useRemoteInput((input, at, repeat) => {
    if (repeat) return;
    if (input === 'back') {
      playSound('back');
      onAbort();
    }
    else if (input === 'ok') confirm(at);
    else select(choiceIndexOf(input), at);
  });

  if (!shown) return null;
  const { view, urgent, waiting } = shown;
  const text = view.chars.join('');
  const visible = view.chars.slice(0, view.visibleChars).join('');
  const pending = view.chars.slice(view.visibleChars).join('');
  const verdict = view.lastAnswer ? verdictOf(view.lastAnswer) : null;
  const verdictIcon = verdict === 'correct' ? strings.correctIcon : 'cross';
  const labelSize = choiceSize(view.choices);
  const streak = view.streak >= STREAK_SHOW_FROM ? view.streak : 0;
  const milestone = streak > 0 && streak % STREAK_MILESTONE === 0;

  // カーソルやタッチで操作する場合：選択肢を押して選び、もう一度押すか OK で確定
  const pressChoice = (choiceIndex: number, event: PointerEvent): void => {
    const at = eventTime(event);
    if (view.selected === choiceIndex) confirm(at);
    else select(choiceIndex, at);
  };

  return (
    <section className="screen game">
      <header className="game-head">
        <div className="progress">
          <span className="progress-now">{view.index + 1}</span>
          <span className="progress-total">/{view.total}</span>
        </div>
        {streak > 0 ? (
          // 連続正解の間は、ピリオド名の代わりに出す。正解するたびに出し直して跳ねさせる
          <div key={streak} className={`streak${milestone ? ' is-milestone' : ''}`}>
            {strings.streak(streak)}
          </div>
        ) : (
          <div className="game-period">
            <span>{periodLabel}</span>
            {tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="tally">
          {/* 直前の判定は、次に答えるまで右上に残しておく */}
          {verdict && (
            <span className={`mark mark-${verdict}`}>
              <PixelIcon name={verdictIcon} />
              {verdict === 'timeout' && <span className="mark-text">{strings.timeUp}</span>}
            </span>
          )}
          <span className="tally-label">{strings.correct}</span>
          {/* 正解が増えた瞬間だけ数字を光らせる */}
          <span key={view.correctCount} className={`tally-count${view.correctCount > 0 ? ' is-bump' : ''}`}>
            {view.correctCount}
          </span>
        </div>
      </header>

      <FrameTimer
        startedAt={view.startedAt}
        typingMs={view.typingMs}
        windowMs={engine.settings.answerWindowMs}
        urgent={urgent}
      >
        {/* 判定の色を、次の問題の枠の中に一瞬だけ出す。答えるたびに出し直す */}
        {verdict && <span key={view.index} className={`flash flash-${verdict}`} aria-hidden="true" />}
        {waiting ? (
          <p className="ready">READY</p>
        ) : (
          <p className={`q-text size-${questionSize(text)}`}>
            <span>{visible}</span>
            <span className="pending" aria-hidden="true">
              {pending}
            </span>
          </p>
        )}
      </FrameTimer>

      <div className={`cross${waiting ? ' is-waiting' : ''}`}>
        {CHOICE_DIRECTIONS.map((direction, i) => (
          <div
            key={direction}
            role="button"
            className={`choice dir-${direction}${view.selected === i ? ' is-selected' : ''}`}
            onPointerDown={(event) => pressChoice(i, event)}
          >
            <span className="badge">
              <PixelIcon name="arrow" className={`arrow arrow-${direction}`} />
            </span>
            <span className={`choice-label size-${labelSize}`}>{view.choices[i] ?? ''}</span>
          </div>
        ))}
        <div
          role="button"
          className={`ok${view.selected !== null ? ' is-ready' : ''}`}
          onPointerDown={(event) => confirm(eventTime(event))}
        >
          OK
        </div>
        {/* 4つの選択肢の真ん中に、直前の判定を大きく出す */}
        {verdict && (
          <div key={view.index} className={`verdict verdict-${verdict}`} aria-hidden="true">
            <PixelIcon name={verdictIcon} />
          </div>
        )}
      </div>

      <footer className="hint">
        <KeyHint keys={['up', 'left', 'right', 'down']} label={strings.hintChoose} />
        <KeyHint keys={['ok']} label={strings.hintConfirm} />
      </footer>
    </section>
  );
}
