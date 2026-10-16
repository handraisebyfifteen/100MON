import { useState } from 'react';
import { Text, View } from 'react-native';
import { KeyHint } from '../components/KeyHint';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { useBlink } from '../components/steps';
import { Tag } from '../components/Tag';
import type { Strings } from '../i18n';
import { exitApp, useRemoteInput } from '../platform/input';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { playSound } from '../platform/sound';
import { COLORS, FONTS } from '../theme';

type Row = 'start' | 'ranking' | 'records' | 'settings';
const ROWS: readonly Row[] = ['start', 'ranking', 'records', 'settings'];

interface TitleProps {
  strings: Strings;
  periodLabel: string;
  tags: readonly string[];
  bestPoints: number | null;
  /** サーバーに走行開始を申告している間。案内を出し、入力を受け付けない */
  busy: boolean;
  onStart: () => void;
  onRanking: () => void;
  onRecords: () => void;
  onSettings: () => void;
}

const makeStyles = ({ px }: Stage) => ({
  h1Row: { marginTop: px(8), flexDirection: 'row' as const, alignItems: 'center' as const },
  // 名前は英数字なので、言語に関係なく数字の書体で出す
  h1: {
    fontFamily: FONTS.digits,
    fontSize: px(88),
    lineHeight: px(148),
    color: COLORS.white,
    textShadowColor: COLORS.blue,
    textShadowOffset: { width: px(8), height: px(8) },
    textShadowRadius: 0,
  },
  tagline: { marginTop: px(4), fontFamily: FONTS.text, fontSize: px(48), color: COLORS.sky },
  periodLine: { marginTop: px(20), flexDirection: 'row' as const, alignItems: 'center' as const },
  periodItem: { marginRight: px(24) },
  periodText: { fontFamily: FONTS.text, fontSize: px(32), color: COLORS.white },
  best: { fontFamily: FONTS.text, fontSize: px(32), color: COLORS.gold },
  menu: { width: px(1056), marginTop: px(32) },
  menuRow: { height: px(100), marginBottom: px(20) },
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
  status: { marginTop: px(24), fontFamily: FONTS.text, fontSize: px(32), lineHeight: px(40), color: COLORS.dim },
});

export function TitleScreen(props: TitleProps) {
  const { strings, busy, onStart, onRanking, onRecords, onSettings } = props;
  const s = useStyles(makeStyles);
  // 中央ボタン1回で走り出せるよう、最初は「スタート」に合わせておく
  const [focus, setFocus] = useState(ROWS.indexOf('start'));
  // 選んでいる行の外枠は白と金で点滅する（styles.css の frame-blink）
  const blinkOn = useBlink(400, true);

  const moveTo = (index: number): void => {
    const next = Math.min(ROWS.length - 1, Math.max(0, index));
    if (next === focus) return;
    setFocus(next);
    playSound('cursor');
  };

  const activate = (row: Row): void => {
    // スタートは、走り出す前の合図がこのあと鳴る
    if (row !== 'start') playSound('decide');
    if (row === 'start') onStart();
    if (row === 'ranking') onRanking();
    if (row === 'records') onRecords();
    if (row === 'settings') onSettings();
  };

  useRemoteInput((input, _at, repeat) => {
    if (busy) return;
    if (input === 'up') moveTo(focus - 1);
    if (input === 'down') moveTo(focus + 1);
    if (input === 'ok' && !repeat) activate(ROWS[focus] as Row);
    // タイトルで「戻る」はアプリの終了
    if (input === 'back') exitApp();
  });

  const labels: Record<Row, string> = {
    start: strings.start,
    ranking: strings.ranking,
    records: strings.records,
    settings: strings.settings,
  };

  return (
    <Screen>
      <View style={s.h1Row}>
        <Text style={s.h1}>{strings.appTitle}</Text>
      </View>
      <Text style={s.tagline}>{strings.tagline}</Text>
      <View style={s.periodLine}>
        <Text style={[s.periodText, s.periodItem]}>{props.periodLabel}</Text>
        {props.tags.map((tag) => (
          <View key={tag} style={s.periodItem}>
            <Tag text={tag} />
          </View>
        ))}
        {props.bestPoints !== null && (
          <Text style={s.best}>
            {strings.best} {props.bestPoints}
          </Text>
        )}
      </View>

      <View style={s.menu}>
        {ROWS.map((row, i) => {
          const focused = i === focus;
          return (
            <Panel
              key={row}
              focused={focused}
              outerColor={focused ? (blinkOn ? COLORS.white : COLORS.gold) : undefined}
              style={[s.menuRow, focused && { transform: [{ scale: 1.06 }] }]}
              innerStyle={s.menuRowInner}
            >
              <Text style={[s.menuLabel, { color: focused ? COLORS.ink : COLORS.white }]}>{labels[row]}</Text>
            </Panel>
          );
        })}
      </View>
      {busy && <Text style={s.status}>{strings.connecting}</Text>}

      <View style={s.hint}>
        <KeyHint keys={['up', 'down']} label={strings.hintMove} />
        <View style={s.hintGap} />
        <KeyHint keys={['ok']} label={strings.hintSelect} />
      </View>
    </Screen>
  );
}
