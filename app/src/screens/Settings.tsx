import { useState } from 'react';
import { Text, View } from 'react-native';
import { LOCALES } from '@core';
import type { Locale, PaceEstimate } from '@core';
import { KeyHint } from '../components/KeyHint';
import { Panel } from '../components/Panel';
import { PixelIcon } from '../components/PixelIcon';
import { Screen } from '../components/Screen';
import { SPEED_MAX, SPEED_MIN } from '../devParams';
import { STRINGS } from '../i18n';
import type { Strings } from '../i18n';
import { useRemoteInput } from '../platform/input';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { playSound, SOUND_NAMES } from '../platform/sound';
import type { SoundName, SoundSettings } from '../platform/sound';
import { COLORS, FONTS } from '../theme';

// ブラウザ版の web/src/screens/Settings.tsx と同じ。ポインタ操作は無い。

const SPEED_STEP = 10;

/** 一度に見せる行数。はみ出すぶんは、選んでいる行に合わせて送る */
const VISIBLE_ROWS = 7;

interface Row {
  key: string;
  label: string;
  /** 値を持つ行だけ。無い行は押すと動く（戻る） */
  value?: string;
  /** 効果音ごとの行。全体がオフのあいだは薄く出す */
  sub?: boolean;
  dimmed?: boolean;
  /** 左右で値を変える。変わったら true */
  change?: (step: number) => boolean;
  /** 中央ボタン */
  activate: () => void;
  /** 値を変えたあとに鳴らす音。指定が無ければ「設定の変更」 */
  preview?: SoundName;
}

interface SettingsProps {
  strings: Strings;
  locale: Locale;
  msPerChar: number;
  sound: SoundSettings;
  pace: PaceEstimate;
  onLocale: (locale: Locale) => void;
  onSpeed: (msPerChar: number) => void;
  onSound: (sound: SoundSettings) => void;
  onBack: () => void;
}

const makeStyles = ({ px }: Stage) => ({
  h2: {
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
  scrollMark: { height: px(32), marginVertical: px(8) },
  menu: { width: px(1056) },
  menuRow: { height: px(84), marginBottom: px(12) },
  menuRowInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: px(48 - 8),
  },
  menuRowAction: { justifyContent: 'center' as const },
  menuRowSub: { paddingLeft: px(112 - 8) },
  menuLabel: { fontFamily: FONTS.text, fontSize: px(48), lineHeight: px(56) },
  menuValue: { width: px(520), flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  menuArrow: { padding: px(12) },
  menuCurrent: { minWidth: px(400), textAlign: 'center' as const, fontFamily: FONTS.text, fontSize: px(48), lineHeight: px(56) },
  pace: { marginTop: px(4), fontFamily: FONTS.text, fontSize: px(32), lineHeight: px(40), color: COLORS.dim },
  paceWarning: { marginTop: px(8), fontFamily: FONTS.text, fontSize: px(32), lineHeight: px(40), color: COLORS.timeout },
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

export function SettingsScreen(props: SettingsProps) {
  const { strings, locale, msPerChar, sound, pace, onLocale, onSpeed, onSound, onBack } = props;
  const s = useStyles(makeStyles);
  const { px } = useStyles((stage) => stage);
  const [focus, setFocus] = useState(0);
  const [top, setTop] = useState(0);

  const cycleLocale = (step: number): boolean => {
    const next = (LOCALES.indexOf(locale) + step + LOCALES.length) % LOCALES.length;
    onLocale(LOCALES[next] as Locale);
    return true;
  };
  const changeSpeed = (step: number): boolean => {
    const next = Math.min(SPEED_MAX, Math.max(SPEED_MIN, msPerChar + step * SPEED_STEP));
    if (next === msPerChar) return false;
    onSpeed(next);
    return true;
  };
  const toggleAll = (): boolean => {
    onSound({ ...sound, enabled: !sound.enabled });
    return true;
  };
  const toggleOne = (name: SoundName): boolean => {
    onSound({ ...sound, events: { ...sound.events, [name]: !sound.events[name] } });
    return true;
  };
  const onOff = (on: boolean): string => (on ? strings.on : strings.off);
  const back = (): void => {
    playSound('back');
    onBack();
  };

  const rows: Row[] = [
    {
      key: 'language',
      label: strings.language,
      value: STRINGS[locale].languageName,
      change: cycleLocale,
      activate: () => cycleLocale(1),
    },
    {
      key: 'speed',
      label: strings.speed,
      value: `${msPerChar} ${strings.speedUnit}`,
      change: changeSpeed,
      activate: () => {},
    },
    {
      key: 'sound',
      label: strings.sound,
      value: onOff(sound.enabled),
      change: toggleAll,
      activate: toggleAll,
    },
    ...SOUND_NAMES.map(
      (name): Row => ({
        key: `sound-${name}`,
        label: strings.soundNames[name],
        value: onOff(sound.events[name]),
        sub: true,
        dimmed: !sound.enabled,
        change: () => toggleOne(name),
        activate: () => toggleOne(name),
        // オンにしたら、その音を鳴らして聞かせる
        preview: name,
      }),
    ),
    { key: 'back', label: strings.back, activate: back },
  ];

  const moveTo = (index: number): void => {
    const next = (index + rows.length) % rows.length;
    if (next === focus) return;
    setFocus(next);
    setTop((t) => Math.min(next, Math.max(t, next - VISIBLE_ROWS + 1)));
    playSound('cursor');
  };

  // 設定は App がその場で反映するので、変えた直後の音は新しい設定で鳴る（オフにした音は鳴らない）
  const change = (row: Row, step: number): void => {
    if (row.change?.(step)) playSound(row.preview ?? 'change');
  };
  const activate = (row: Row): void => {
    const before = row.value;
    row.activate();
    if (before !== undefined && row.key !== 'speed') playSound(row.preview ?? 'change');
  };

  useRemoteInput((input, _at, repeat) => {
    const row = rows[focus] as Row;
    if (input === 'up') moveTo(focus - 1);
    if (input === 'down') moveTo(focus + 1);
    if (input === 'left') change(row, -1);
    if (input === 'right') change(row, 1);
    if (input === 'ok' && !repeat) activate(row);
    if (input === 'back' && !repeat) back();
  });

  const overCount = pace.overLimitIds.length;
  const hasAbove = top > 0;
  const hasBelow = top + VISIBLE_ROWS < rows.length;

  return (
    <Screen>
      <Text style={s.h2}>{strings.settings}</Text>

      <View style={[s.scrollMark, !hasAbove && { opacity: 0 }]}>
        <PixelIcon name="arrow" size={px(32)} color={COLORS.sky} direction="up" />
      </View>
      <View style={s.menu}>
        {rows.slice(top, top + VISIBLE_ROWS).map((row, offset) => {
          const i = top + offset;
          const focused = i === focus;
          const isAction = row.value === undefined;
          const textColor = focused ? COLORS.ink : row.dimmed ? COLORS.dim : COLORS.white;
          const arrowColor = focused ? COLORS.ink : COLORS.sky;
          return (
            <Panel
              key={row.key}
              focused={focused}
              style={[s.menuRow, focused && { transform: [{ scale: 1.06 }] }]}
              innerStyle={[s.menuRowInner, isAction && s.menuRowAction, row.sub && s.menuRowSub]}
            >
              <Text style={[s.menuLabel, { color: textColor }]} numberOfLines={1}>
                {row.label}
              </Text>
              {row.value !== undefined && (
                <View style={s.menuValue}>
                  <View style={s.menuArrow}>
                    <PixelIcon name="arrow" size={px(35)} color={arrowColor} direction="left" />
                  </View>
                  <Text style={[s.menuCurrent, { color: textColor }]} numberOfLines={1}>
                    {row.value}
                  </Text>
                  <View style={s.menuArrow}>
                    <PixelIcon name="arrow" size={px(35)} color={arrowColor} direction="right" />
                  </View>
                </View>
              )}
            </Panel>
          );
        })}
      </View>
      <View style={[s.scrollMark, !hasBelow && { opacity: 0 }]}>
        <PixelIcon name="arrow" size={px(32)} color={COLORS.sky} direction="down" />
      </View>

      <Text style={s.pace}>
        {strings.paceLongest((pace.longestTypingMs / 1000).toFixed(1))}
        {'　・　'}
        {strings.paceAllTimeout((pace.allTimeoutMs / 60_000).toFixed(1))}
      </Text>
      {overCount > 0 && <Text style={s.paceWarning}>！ {strings.paceOver(overCount)}</Text>}

      <View style={s.hint}>
        <KeyHint keys={['up', 'down']} label={strings.hintMove} />
        <View style={s.hintGap} />
        <KeyHint keys={['left', 'right']} label={strings.hintChange} />
        <View style={s.hintGap} />
        <KeyHint keys={['ok']} label={strings.hintSelect} />
      </View>
    </Screen>
  );
}
