import { useState } from 'react';
import { Text, View } from 'react-native';
import { KeyHint } from '../components/KeyHint';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { useBlink } from '../components/steps';
import { EXHIBITION_LEVELS } from '../data';
import type { ExhibitionLevel } from '../data';
import type { Strings } from '../i18n';
import { useRemoteInput } from '../platform/input';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { playSound } from '../platform/sound';
import { COLORS, FONTS } from '../theme';

/** エキシビジョンで選べる問題数 */
export const EXHIBITION_COUNTS: readonly number[] = [100, 50, 25, 10];

interface ExhibitionProps {
  strings: Strings;
  /** 難易度ごとの、出題のもとになる問題の数 */
  poolSizes: Record<ExhibitionLevel, number>;
  /** 問題数の画面から戻ったときなど、最初に合わせておく難易度 */
  initialLevel: ExhibitionLevel | null;
  onStart: (level: ExhibitionLevel, count: number) => void;
  onBack: () => void;
}

const makeStyles = ({ px }: Stage) => ({
  h2: {
    // 箱を枠いっぱいに広げて中央ぞろえ（Records.tsx と同じ）
    alignSelf: 'stretch' as const,
    textAlign: 'center' as const,
    marginTop: px(6),
    fontFamily: FONTS.text,
    fontSize: px(64),
    lineHeight: px(80),
    letterSpacing: px(8),
    color: COLORS.white,
    textShadowColor: COLORS.blue,
    textShadowOffset: { width: px(4), height: px(4) },
    textShadowRadius: 0,
  },
  note: { marginTop: px(16), fontFamily: FONTS.text, fontSize: px(32), lineHeight: px(40), color: COLORS.dim },
  pool: { marginTop: px(8), fontFamily: FONTS.text, fontSize: px(32), lineHeight: px(40), color: COLORS.sky },
  menu: { width: px(1056), marginTop: px(48) },
  menuRow: { height: px(92), marginBottom: px(16) },
  menuRowInner: { alignItems: 'center' as const, justifyContent: 'center' as const },
  menuLabel: { fontFamily: FONTS.text, fontSize: px(48), lineHeight: px(56) },
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

/** いちばん少ない問題数にも足りない難易度は選べない */
const MIN_COUNT = Math.min(...EXHIBITION_COUNTS);

export function ExhibitionScreen({ strings, poolSizes, initialLevel, onStart, onBack }: ExhibitionProps) {
  const s = useStyles(makeStyles);
  const blinkOn = useBlink(400, true);
  // 選んだ難易度。null のあいだは難易度を選ぶ段
  const [level, setLevel] = useState<ExhibitionLevel | null>(null);
  const [levelFocus, setLevelFocus] = useState(() => {
    const preferred = initialLevel !== null ? EXHIBITION_LEVELS.indexOf(initialLevel) : -1;
    if (preferred >= 0 && poolSizes[initialLevel as ExhibitionLevel] >= MIN_COUNT) return preferred;
    return Math.max(0, EXHIBITION_LEVELS.findIndex((l) => poolSizes[l] >= MIN_COUNT));
  });
  const [countFocus, setCountFocus] = useState(0);

  // 問題より多い問題数は選べない（同じ問題を2回出さない）
  const counts = level === null ? [] : EXHIBITION_COUNTS.filter((count) => count <= poolSizes[level]);
  const playable = (l: ExhibitionLevel): boolean => poolSizes[l] >= MIN_COUNT;

  const back = (): void => {
    playSound('back');
    if (level !== null) {
      setLevel(null);
      return;
    }
    onBack();
  };

  useRemoteInput((input, _at, repeat) => {
    if (input === 'back' || input === 'left') {
      back();
      return;
    }
    if (level === null) {
      // 選べない難易度は飛ばして動く
      const step = input === 'up' ? -1 : input === 'down' ? 1 : 0;
      if (step !== 0) {
        let next = levelFocus + step;
        while (next >= 0 && next < EXHIBITION_LEVELS.length && !playable(EXHIBITION_LEVELS[next] as ExhibitionLevel)) {
          next += step;
        }
        if (next >= 0 && next < EXHIBITION_LEVELS.length) {
          setLevelFocus(next);
          playSound('cursor');
        }
      }
      if ((input === 'ok' || input === 'right') && !repeat) {
        const chosen = EXHIBITION_LEVELS[levelFocus] as ExhibitionLevel;
        if (!playable(chosen)) return;
        playSound('decide');
        setLevel(chosen);
        setCountFocus(0);
      }
      return;
    }
    if (input === 'up' && countFocus > 0) {
      setCountFocus(countFocus - 1);
      playSound('cursor');
    }
    if (input === 'down' && countFocus < counts.length - 1) {
      setCountFocus(countFocus + 1);
      playSound('cursor');
    }
    // 走り出す前の合図がこのあと鳴るので、決定の音は鳴らさない（タイトルの公式戦と同じ）
    if (input === 'ok' && !repeat) onStart(level, counts[countFocus] as number);
  });

  const rows =
    level === null
      ? EXHIBITION_LEVELS.map((l) => ({ key: l, label: strings.levelNames[l], enabled: playable(l) }))
      : counts.map((count) => ({ key: String(count), label: strings.questionCount(count), enabled: true }));
  const focus = level === null ? levelFocus : countFocus;
  const anyPlayable = EXHIBITION_LEVELS.some(playable);

  return (
    <Screen>
      <Text style={s.h2}>{level === null ? strings.exhibition : `${strings.exhibition}　${strings.levelNames[level]}`}</Text>
      <Text style={s.note}>{strings.exhibitionNote}</Text>
      {level !== null && <Text style={s.pool}>{strings.exhibitionPool(poolSizes[level])}</Text>}
      {level === null && !anyPlayable && <Text style={s.pool}>{strings.exhibitionEmpty}</Text>}
      <View style={s.menu}>
        {rows.map((row, i) => {
          const focused = row.enabled && i === focus;
          return (
            <Panel
              key={row.key}
              focused={focused}
              outerColor={focused ? (blinkOn ? COLORS.white : COLORS.gold) : undefined}
              style={[s.menuRow, focused && { transform: [{ scale: 1.06 }] }, !row.enabled && { opacity: 0.4 }]}
              innerStyle={s.menuRowInner}
            >
              <Text style={[s.menuLabel, { color: focused ? COLORS.ink : COLORS.white }]}>{row.label}</Text>
            </Panel>
          );
        })}
      </View>

      <View style={s.hint}>
        {anyPlayable && (
          <>
            <KeyHint keys={['up', 'down']} label={strings.hintMove} />
            <View style={s.hintGap} />
            <KeyHint keys={['ok']} label={strings.hintSelect} />
            <View style={s.hintGap} />
          </>
        )}
        <KeyHint keys={['left']} label={strings.back} />
      </View>
    </Screen>
  );
}
