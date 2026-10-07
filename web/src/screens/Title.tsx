import { useState } from 'react';
import { KeyHint } from '../components/KeyHint';
import type { Strings } from '../i18n';
import { eventTime, useRemoteInput } from '../input';
import { playSound } from '../sound';

type Row = 'start' | 'records' | 'settings';
const ROWS: readonly Row[] = ['start', 'records', 'settings'];

interface TitleProps {
  strings: Strings;
  periodLabel: string;
  tags: readonly string[];
  bestPoints: number | null;
  onStart: (at: number) => void;
  onRecords: () => void;
  onSettings: () => void;
}

export function TitleScreen(props: TitleProps) {
  const { strings, onStart, onRecords, onSettings } = props;
  // 中央ボタン1回で走り出せるよう、最初は「スタート」に合わせておく
  const [focus, setFocus] = useState(ROWS.indexOf('start'));

  const moveTo = (index: number): void => {
    const next = Math.min(ROWS.length - 1, Math.max(0, index));
    if (next === focus) return;
    setFocus(next);
    playSound('cursor');
  };

  const activate = (row: Row, at: number): void => {
    // スタートは、走り出す前の合図がこのあと鳴る
    if (row !== 'start') playSound('decide');
    if (row === 'start') onStart(at);
    if (row === 'records') onRecords();
    if (row === 'settings') onSettings();
  };

  useRemoteInput((input, at, repeat) => {
    if (input === 'up') moveTo(focus - 1);
    if (input === 'down') moveTo(focus + 1);
    if (input === 'ok' && !repeat) activate(ROWS[focus] as Row, at);
  });

  const labels: Record<Row, string> = {
    start: strings.start,
    records: strings.records,
    settings: strings.settings,
  };

  return (
    <section className="screen title">
      <h1>
        {strings.appTitle}
        <small className="tag">{strings.workingTitle}</small>
      </h1>
      <p className="tagline">{strings.tagline}</p>
      <p className="period-line">
        <span>{props.periodLabel}</span>
        {props.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
        {props.bestPoints !== null && (
          <span className="best">
            {strings.best} {props.bestPoints}
          </span>
        )}
      </p>

      <div className="menu">
        {ROWS.map((row, i) => (
          <div
            key={row}
            role="button"
            className={`menu-row is-action${i === focus ? ' is-focused' : ''}`}
            onPointerDown={(event) => {
              setFocus(i);
              activate(row, eventTime(event));
            }}
          >
            <span className="menu-label">{labels[row]}</span>
          </div>
        ))}
      </div>

      <footer className="hint">
        <KeyHint keys={['up', 'down']} label={strings.hintMove} />
        <KeyHint keys={['ok']} label={strings.hintSelect} />
      </footer>
    </section>
  );
}
