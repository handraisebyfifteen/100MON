import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { CHOICE_DIRECTIONS, choiceIndexOf } from '@core';
import type { Answer, Direction, QuestionView, RunEngine, RunResult } from '@core';
import { FrameTimer } from '../components/FrameTimer';
import { KeyHint } from '../components/KeyHint';
import { Panel } from '../components/Panel';
import { PixelIcon } from '../components/PixelIcon';
import { Screen } from '../components/Screen';
import { useBlink, useSteps } from '../components/steps';
import { Tag } from '../components/Tag';
import type { DemoBot } from '../demo';
import { DEV_PARAMS } from '../devParams';
import { choiceSize, questionSize } from '../format';
import type { Strings } from '../i18n';
import { startFrameLoop } from '../platform/frame';
import { now, useRemoteInput } from '../platform/input';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { playSound } from '../platform/sound';
import { COLORS, FONTS } from '../theme';

// ブラウザ版の web/src/screens/Game.tsx と同じ進行・同じ演出。
// CSS の animation は、useSteps / useBlink で段階的に state を切り替えて再現している（時刻は styles.css の keyframes から）。
// まだ無いもの：枠の角の欠け、枠タイマーの目盛りの縞模様（§10-4）。

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

const VERDICT_COLOR: Record<Verdict, string> = {
  correct: COLORS.correct,
  wrong: COLORS.wrong,
  timeout: COLORS.timeout,
};

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

// 十字の4択の置き場所（styles.css の .cross のグリッドを座標にしたもの）
const CHOICE_W = 660;
const CHOICE_H = 142;
const CROSS_W = CHOICE_W * 2 + 30 + 150 + 30;
const CROSS_H = CHOICE_H * 3 + 20 * 2;
const OK_SIZE = 132;
const CHOICE_POS: Record<Direction, { left: number; top: number }> = {
  up: { left: (CROSS_W - CHOICE_W) / 2, top: 0 },
  left: { left: 0, top: CHOICE_H + 20 },
  right: { left: CROSS_W - CHOICE_W, top: CHOICE_H + 20 },
  down: { left: (CROSS_W - CHOICE_W) / 2, top: (CHOICE_H + 20) * 2 },
};

const VERDICT_SIZE = 208;

const QUESTION_FONT = { lg: 80, md: 64, sm: 48 } as const;
const CHOICE_FONT = { xl: 64, lg: 48, sm: 32 } as const;

// 演出の段の切り替わる時刻（ms）。styles.css の keyframes の % を時間にしたもの
/** 判定の色を枠の中に1回だけ出し、4段階で消す（flash-out 480ms steps(4)） */
const FLASH_STEPS = [120, 240, 360, 480] as const;
/** 正解：大きく出て止まる（verdict-pop 720ms：0% 1.3倍 → 14% 等倍 → 100% 消える） */
const POP_STEPS = [100, 720] as const;
/** 不正解・時間切れ：左右に揺れる（verdict-shake 720ms：0/11/22/33/44% で -24/+24/-16/+16/0） */
const SHAKE_STEPS = [79, 158, 238, 317, 720] as const;
const SHAKE_X = [-24, 24, -16, 16, 0] as const;
/** 正解数が増えた瞬間だけ光らせる（tally-bump 480ms：0% 緑1.3倍 → 50% 緑等倍 → 100% 白） */
const BUMP_STEPS = [240, 480] as const;
/** 連続正解の跳ね（streak-pop 480ms：0% 1.3倍 → 34% 等倍） */
const STREAK_STEPS = [163] as const;
/** 節目：大きく出して数回点滅（streak-milestone 1200ms：白1.5 → 金1.25 → 白1.1 → 金1 → 白1 → 金1） */
const MILESTONE_STEPS = [180, 360, 540, 720, 900] as const;
const MILESTONE_COLOR = [COLORS.white, COLORS.gold, COLORS.white, COLORS.gold, COLORS.white, COLORS.gold] as const;
const MILESTONE_SCALE = [1.5, 1.25, 1.1, 1, 1, 1] as const;

const makeStyles = ({ px }: Stage) => ({
  screen: { alignItems: 'stretch' as const },
  head: {
    height: px(76),
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  progress: { minWidth: px(480), flexDirection: 'row' as const, alignItems: 'flex-end' as const },
  progressNow: { fontFamily: FONTS.digits, fontSize: px(56), lineHeight: px(60), color: COLORS.white },
  progressTotal: {
    marginLeft: px(8),
    fontFamily: FONTS.digits,
    fontSize: px(32),
    lineHeight: px(44),
    color: COLORS.dim,
  },
  center: { flexDirection: 'row' as const, alignItems: 'center' as const },
  periodText: { fontFamily: FONTS.text, fontSize: px(32), color: COLORS.dim, marginRight: px(16) },
  tagItem: { marginRight: px(16) },
  streak: {
    fontFamily: FONTS.text,
    fontSize: px(48),
    letterSpacing: px(4),
    color: COLORS.correct,
    textShadowColor: '#005800',
    textShadowOffset: { width: px(4), height: px(4) },
    textShadowRadius: 0,
  },
  streakMilestone: { fontSize: px(64), color: COLORS.gold, textShadowColor: '#7c3c00' },
  tally: {
    minWidth: px(480),
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
  },
  mark: { flexDirection: 'row' as const, alignItems: 'center' as const, marginRight: px(16) },
  markText: { marginLeft: px(12), fontFamily: FONTS.text, fontSize: px(32) },
  tallyLabel: { fontFamily: FONTS.text, fontSize: px(32), color: COLORS.dim, marginRight: px(16) },
  tallyCount: {
    minWidth: px(112),
    fontFamily: FONTS.digits,
    fontSize: px(56),
    lineHeight: px(60),
    color: COLORS.white,
    textAlign: 'right' as const,
  },

  flash: { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 },
  ready: {
    fontFamily: FONTS.digits,
    fontSize: px(96),
    lineHeight: px(104),
    letterSpacing: px(8),
    color: COLORS.white,
  },
  qText: { fontFamily: FONTS.question, color: COLORS.white, textAlign: 'center' as const },
  // まだ出ていない文字も場所だけ取っておき、表示の途中で行が動かないようにする
  pending: { color: 'transparent' },

  cross: { alignSelf: 'center' as const, width: px(CROSS_W), height: px(CROSS_H), marginTop: px(30) },
  choice: { position: 'absolute' as const, width: px(CHOICE_W), height: px(CHOICE_H) },
  choiceInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: px(24),
    paddingRight: px(28),
  },
  badge: {
    width: px(64),
    height: px(64),
    marginRight: px(20),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  choiceLabel: { flex: 1, fontFamily: FONTS.question, textAlign: 'center' as const },
  ok: {
    position: 'absolute' as const,
    left: px((CROSS_W - OK_SIZE) / 2),
    top: px(CHOICE_H + 20 + (CHOICE_H - OK_SIZE) / 2),
    width: px(OK_SIZE),
    height: px(OK_SIZE),
    borderWidth: px(8),
    borderColor: COLORS.blue,
    backgroundColor: COLORS.panel,
  },
  okInner: { flex: 1, borderWidth: px(8), alignItems: 'center' as const, justifyContent: 'center' as const },
  okText: { fontFamily: FONTS.digits, fontSize: px(40), lineHeight: px(48) },
  // 直前の判定を、4つの選択肢の真ん中に大きく出す。形（丸・バツ）と色と動きで分かる
  verdict: {
    position: 'absolute' as const,
    left: px((CROSS_W - VERDICT_SIZE) / 2),
    top: px(CHOICE_H + 20 + (CHOICE_H - VERDICT_SIZE) / 2),
    width: px(VERDICT_SIZE),
    height: px(VERDICT_SIZE),
    zIndex: 3,
    borderWidth: px(8),
    backgroundColor: '#000',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  hint: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: px(50),
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
  },
  hintGap: { width: px(72) },
});

export function GameScreen({ engine, strings, periodLabel, tags, bot, onFinish, onAbort }: GameProps) {
  const s = useStyles(makeStyles);
  const { px } = useStyles((stage) => stage);
  const [shown, setShown] = useState<Shown | null>(() => {
    const at = now();
    const view = engine.tick(at);
    return view ? { view, urgent: false, waiting: at < engine.startedAt } : null;
  });
  const step = useRef<(at: number) => void>(() => {});
  // どこまで音を鳴らしたか。画面の描き直しとは別に覚えておく
  const heard = useRef({ ready: false, index: -1, chars: 0, selected: null as number | null, urgent: false });
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  });

  // 進行は RunEngine が時刻だけで決める。ここは毎フレーム状態を聞いて、変わったときだけ描き直す
  useEffect(() => {
    let stopped = false;
    let lastKey = '';

    // debug のとき、フレームの間隔を数えて問題ごとにログに出す（引っかかりの切り分け用）
    const stats = { lastAt: 0, frames: 0, slow: 0, max: 0, index: -1 };
    const report = (label: string): void => {
      console.warn(`[qth] frames q=${label} n=${stats.frames} slow(>50ms)=${stats.slow} max=${stats.max.toFixed(0)}ms`);
      stats.frames = 0;
      stats.slow = 0;
      stats.max = 0;
    };
    const measure = (at: number, index: number): void => {
      if (stats.lastAt > 0) {
        const gap = at - stats.lastAt;
        stats.frames++;
        if (gap > 50) stats.slow++;
        if (gap > stats.max) stats.max = gap;
      }
      stats.lastAt = at;
      if (index !== stats.index) {
        if (stats.index >= 0) report(String(stats.index + 1));
        stats.index = index;
      }
    };

    const run = (at: number): void => {
      if (stopped) return;
      let view = engine.tick(at);
      if (DEV_PARAMS.debug) measure(at, view ? view.index : -1);
      if (view && bot) {
        bot(engine, view, at);
        view = engine.tick(at);
      }
      if (!view) {
        stopped = true;
        if (DEV_PARAMS.debug) report('end');
        const result = engine.result();
        const last = result.answers[result.answers.length - 1];
        if (last) playVerdict(last, trailingStreak(result.answers));
        finish.current(result);
        return;
      }
      const urgent = view.phase === 'countdown' && view.remainingMs <= URGENT_MS;
      const waiting = at < engine.startedAt;

      const h = heard.current;
      if (waiting && !h.ready) playSound('ready');
      h.ready = true;
      if (view.index !== h.index) {
        if (h.index >= 0 && view.lastAnswer) playVerdict(view.lastAnswer, view.streak);
        heard.current = { ready: true, index: view.index, chars: 0, selected: null, urgent: false };
      }
      const sound = heard.current;
      if (!waiting && view.visibleChars > sound.chars) playSound('type');
      if (view.selected !== null && view.selected !== sound.selected) playSound('select');
      if (urgent && !sound.urgent) playSound('urgent');
      sound.chars = view.visibleChars;
      sound.selected = view.selected;
      sound.urgent = urgent;
      const key = `${view.index}|${view.visibleChars}|${view.selected}|${urgent}|${waiting}`;
      if (key !== lastKey) {
        lastKey = key;
        setShown({ view, urgent, waiting });
      }
    };
    step.current = run;

    const stop = startFrameLoop((at) => {
      run(at);
      if (stopped) stop();
    });
    return () => {
      stopped = true;
      stop();
    };
  }, [engine, bot]);

  const select = (choiceIndex: number, at: number): void => {
    if (bot) return;
    engine.select(choiceIndex, at);
    step.current(now());
  };
  const confirm = (at: number): void => {
    if (bot) return;
    engine.confirm(at);
    step.current(now());
  };

  useRemoteInput((input, at, repeat) => {
    if (repeat) return;
    if (input === 'back') {
      playSound('back');
      onAbort();
    } else if (input === 'ok') confirm(at);
    else select(choiceIndexOf(input), at);
  });

  // フックは毎回同じ順で呼ぶ。shown が無いときのために、既定の値で呼んでおく
  const view = shown?.view ?? null;
  const urgent = shown?.urgent ?? false;
  const waiting = shown?.waiting ?? false;
  const verdict = view?.lastAnswer ? verdictOf(view.lastAnswer) : null;
  const questionKey = view?.index ?? -1;
  const streak = view !== null && view.streak >= STREAK_SHOW_FROM ? view.streak : 0;
  const milestone = streak > 0 && streak % STREAK_MILESTONE === 0;

  // 演出の段。答えるたび（問題が進むたび）に出し直す
  const flashPhase = useSteps(questionKey, FLASH_STEPS);
  const popPhase = useSteps(questionKey, POP_STEPS);
  const shakePhase = useSteps(questionKey, SHAKE_STEPS);
  const bumpPhase = useSteps(view?.correctCount ?? 0, BUMP_STEPS);
  const streakPhase = useSteps(streak, STREAK_STEPS);
  const milestonePhase = useSteps(streak, MILESTONE_STEPS);
  // 点滅
  const readyOn = useBlink(300, waiting);
  const selectedOn = useBlink(400, view?.selected !== null);
  const okOn = useBlink(400, view?.selected !== null);

  if (!view) return null;
  const text = view.chars.join('');
  const visible = view.chars.slice(0, view.visibleChars).join('');
  const pending = view.chars.slice(view.visibleChars).join('');
  const verdictIcon = verdict === 'correct' ? strings.correctIcon : 'cross';
  const labelSize = choiceSize(view.choices);
  const qFont = QUESTION_FONT[questionSize(text)];
  const cFont = CHOICE_FONT[labelSize];

  // 判定の大きな表示。正解は「大きく出て止まる」、不正解と時間切れは「左右に揺れる」
  let verdictStyle: { opacity: number; transform: Array<{ scale: number } | { translateX: number }> } | null = null;
  if (verdict === 'correct' && popPhase < POP_STEPS.length) {
    verdictStyle = { opacity: 1, transform: [{ scale: popPhase === 0 ? 1.3 : 1 }] };
  } else if (verdict !== null && verdict !== 'correct' && shakePhase < SHAKE_STEPS.length) {
    verdictStyle = { opacity: 1, transform: [{ translateX: px(SHAKE_X[shakePhase] ?? 0) }] };
  }
  const flashOpacity = verdict !== null ? Math.max(0, 0.6 - 0.15 * flashPhase) : 0;
  const bumping = view.correctCount > 0 && bumpPhase < BUMP_STEPS.length;
  const streakStyle = milestone
    ? {
        color: MILESTONE_COLOR[milestonePhase] ?? COLORS.gold,
        transform: [{ scale: MILESTONE_SCALE[milestonePhase] ?? 1 }],
      }
    : { transform: [{ scale: streakPhase === 0 ? 1.3 : 1 }] };

  return (
    <Screen style={s.screen}>
      <View style={s.head}>
        <View style={s.progress}>
          <Text style={s.progressNow}>{view.index + 1}</Text>
          <Text style={s.progressTotal}>/{view.total}</Text>
        </View>
        {streak > 0 ? (
          // 連続正解の間は、ピリオド名の代わりに出す。正解するたびに跳ねる
          <Text style={[s.streak, milestone && s.streakMilestone, streakStyle]}>{strings.streak(streak)}</Text>
        ) : (
          <View style={s.center}>
            <Text style={s.periodText}>{periodLabel}</Text>
            {tags.map((tag) => (
              <View key={tag} style={s.tagItem}>
                <Tag text={tag} />
              </View>
            ))}
          </View>
        )}
        <View style={s.tally}>
          {/* 直前の判定は、次に答えるまで右上に残しておく */}
          {verdict && (
            <View style={s.mark}>
              <PixelIcon name={verdictIcon} size={px(44)} color={VERDICT_COLOR[verdict]} />
              {verdict === 'timeout' && (
                <Text style={[s.markText, { color: VERDICT_COLOR[verdict] }]}>{strings.timeUp}</Text>
              )}
            </View>
          )}
          <Text style={s.tallyLabel}>{strings.correct}</Text>
          {/* 正解が増えた瞬間だけ数字を光らせる */}
          <Text
            style={[
              s.tallyCount,
              bumping && { color: COLORS.correct, transform: [{ scale: bumpPhase === 0 ? 1.3 : 1 }] },
            ]}
          >
            {view.correctCount}
          </Text>
        </View>
      </View>

      <FrameTimer
        startedAt={view.startedAt}
        typingMs={view.typingMs}
        windowMs={engine.settings.answerWindowMs}
        urgent={urgent}
      >
        {/* 判定の色を、次の問題の枠の中に一瞬だけ出す */}
        {verdict !== null && flashOpacity > 0 && (
          <View style={[s.flash, { backgroundColor: VERDICT_COLOR[verdict], opacity: flashOpacity }]} />
        )}
        {waiting ? (
          <Text style={[s.ready, { opacity: readyOn ? 1 : 0 }]}>READY</Text>
        ) : (
          <Text style={[s.qText, { fontSize: px(qFont), lineHeight: px(qFont * 1.25) }]}>
            {visible}
            <Text style={s.pending}>{pending}</Text>
          </Text>
        )}
      </FrameTimer>

      <View style={s.cross}>
        {CHOICE_DIRECTIONS.map((direction, i) => {
          const selected = view.selected === i;
          const pos = CHOICE_POS[direction];
          return (
            <Panel
              key={direction}
              focused={selected}
              outerColor={selected ? (selectedOn ? COLORS.white : COLORS.gold) : undefined}
              style={[
                s.choice,
                { left: px(pos.left), top: px(pos.top) },
                selected && { transform: [{ scale: 1.08 }], zIndex: 1 },
              ]}
              innerStyle={s.choiceInner}
            >
              <View style={[s.badge, { backgroundColor: selected ? COLORS.ink : COLORS.blue }]}>
                <PixelIcon
                  name="arrow"
                  size={px(42)}
                  color={selected ? COLORS.select : COLORS.white}
                  direction={direction}
                />
              </View>
              {/* 走り出す前は、選択肢の中身を見せない */}
              <Text
                style={[
                  s.choiceLabel,
                  { fontSize: px(cFont), lineHeight: px(cFont * 1.2), color: selected ? COLORS.ink : COLORS.white },
                  waiting && { color: 'transparent' },
                ]}
              >
                {view.choices[i] ?? ''}
              </Text>
            </Panel>
          );
        })}
        {/* どれかを選ぶと、確定できることを中央の OK が示す（金と白で点滅） */}
        {(() => {
          const ready = view.selected !== null;
          const okColor = ready ? (okOn ? COLORS.gold : COLORS.white) : COLORS.dim;
          return (
            <View style={[s.ok, ready && { transform: [{ scale: 1.08 }], borderColor: okColor }]}>
              <View style={[s.okInner, { borderColor: ready ? COLORS.blue : COLORS.deep }]}>
                <Text style={[s.okText, { color: okColor }]}>OK</Text>
              </View>
            </View>
          );
        })()}
        {/* 4つの選択肢の真ん中に、直前の判定を大きく出す */}
        {verdict !== null && verdictStyle !== null && (
          <View style={[s.verdict, { borderColor: VERDICT_COLOR[verdict] }, verdictStyle]}>
            <PixelIcon name={verdictIcon} size={px(132)} color={VERDICT_COLOR[verdict]} />
          </View>
        )}
      </View>

      <View style={s.hint}>
        <KeyHint keys={['up', 'left', 'right', 'down']} label={strings.hintChoose} />
        <View style={s.hintGap} />
        <KeyHint keys={['ok']} label={strings.hintConfirm} />
      </View>
    </Screen>
  );
}
