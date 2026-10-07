import { useState } from 'react';
import { LOCALES } from '@core';
import type { Locale, PaceEstimate } from '@core';
import { KeyHint } from '../components/KeyHint';
import { PixelIcon } from '../components/PixelIcon';
import { STRINGS } from '../i18n';
import type { Strings } from '../i18n';
import { SPEED_MAX, SPEED_MIN } from '../params';
import { playSound, SOUND_NAMES } from '../sound';
import type { SoundName, SoundSettings } from '../sound';
import { useRemoteInput } from '../input';

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

export function SettingsScreen(props: SettingsProps) {
  const { strings, locale, msPerChar, sound, pace, onLocale, onSpeed, onSound, onBack } = props;
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
    <section className="screen settings">
      <h2>{strings.settings}</h2>

      <PixelIcon name="arrow" className={`arrow arrow-up scroll-mark${hasAbove ? '' : ' is-hidden'}`} />
      <div className="menu settings-menu">
        {rows.slice(top, top + VISIBLE_ROWS).map((row, offset) => {
          const i = top + offset;
          const focused = i === focus;
          const classes = [
            'menu-row',
            focused ? 'is-focused' : '',
            row.value === undefined ? 'is-action' : '',
            row.sub ? 'is-sub' : '',
            row.dimmed ? 'is-dimmed' : '',
          ];
          return (
            <div
              key={row.key}
              role="button"
              className={classes.filter(Boolean).join(' ')}
              onPointerDown={() => {
                setFocus(i);
                if (row.value === undefined) row.activate();
              }}
            >
              <span className="menu-label">{row.label}</span>
              {row.value !== undefined && (
                <span className="menu-value">
                  <span
                    className="menu-arrow"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setFocus(i);
                      change(row, -1);
                    }}
                  >
                    <PixelIcon name="arrow" className="arrow arrow-left" />
                  </span>
                  <span className="menu-current">{row.value}</span>
                  <span
                    className="menu-arrow"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setFocus(i);
                      change(row, 1);
                    }}
                  >
                    <PixelIcon name="arrow" className="arrow arrow-right" />
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <PixelIcon name="arrow" className={`arrow arrow-down scroll-mark${hasBelow ? '' : ' is-hidden'}`} />

      <p className="pace">
        {strings.paceLongest((pace.longestTypingMs / 1000).toFixed(1))}
        {'　・　'}
        {strings.paceAllTimeout((pace.allTimeoutMs / 60_000).toFixed(1))}
      </p>
      {overCount > 0 && <p className="pace is-warning">！ {strings.paceOver(overCount)}</p>}

      <footer className="hint">
        <KeyHint keys={['up', 'down']} label={strings.hintMove} />
        <KeyHint keys={['left', 'right']} label={strings.hintChange} />
        <KeyHint keys={['ok']} label={strings.hintSelect} />
      </footer>
    </section>
  );
}
