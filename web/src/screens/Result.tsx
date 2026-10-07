import { useEffect, useRef } from 'react';
import { scoreToPoints } from '@core';
import type { RunResult } from '@core';
import { KeyHint } from '../components/KeyHint';
import { formatDuration } from '../format';
import type { Strings } from '../i18n';
import { eventTime, useRemoteInput } from '../input';
import { playSound } from '../sound';

/** 最後の問題の連打で、そのまま次の走行が始まってしまわないようにする */
const INPUT_LOCK_MS = 700;

interface ResultProps {
  strings: Strings;
  result: RunResult;
  /** 何回目の挑戦か。記録に残さない走行では null */
  attemptNumber: number | null;
  isNewBest: boolean;
  /** 自動再生のとき、この時間が過ぎたら次の走行へ進む */
  autoContinueMs: number | null;
  onRetry: (at: number) => void;
  onTitle: () => void;
}

export function ResultScreen(props: ResultProps) {
  const { strings, result, attemptNumber, isNewBest, autoContinueMs, onRetry, onTitle } = props;
  const shownAt = useRef(performance.now());
  const retry = useRef(onRetry);
  useEffect(() => {
    retry.current = onRetry;
  });

  useEffect(() => {
    if (autoContinueMs === null) return;
    const timer = window.setTimeout(() => retry.current(performance.now()), autoContinueMs);
    return () => window.clearTimeout(timer);
  }, [autoContinueMs]);

  const act = (input: 'retry' | 'title', at: number): void => {
    if (at - shownAt.current < INPUT_LOCK_MS) return;
    if (input === 'retry') {
      onRetry(at);
    } else {
      playSound('back');
      onTitle();
    }
  };

  useRemoteInput((input, at, repeat) => {
    if (repeat) return;
    if (input === 'ok') act('retry', at);
    if (input === 'left' || input === 'back') act('title', at);
  });

  return (
    <section className="screen result">
      <h2>{strings.resultTitle}</h2>
      <div className="result-badges">
        {attemptNumber !== null && <span className="tag">{strings.attempt(attemptNumber)}</span>}
        {attemptNumber === null && <span className="tag">{strings.notRecorded}</span>}
        {isNewBest && <span className="tag is-strong">{strings.newBest}</span>}
      </div>

      <div className="score">
        <span className="score-label">{strings.score}</span>
        <span className="score-value">{scoreToPoints(result.score)}</span>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">{strings.time}</span>
          <span className="stat-value">{formatDuration(result.totalMs)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{strings.correctCount}</span>
          <span className="stat-value">
            {result.correctCount}
            <small>/{result.questionCount}</small>
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{strings.timeouts}</span>
          <span className="stat-value">{result.timedOutCount}</span>
        </div>
      </div>

      <footer className="actions">
        <div role="button" className="action is-primary" onPointerDown={(event) => act('retry', eventTime(event))}>
          <KeyHint keys={['ok']} label={strings.retry} />
        </div>
        <div role="button" className="action" onPointerDown={(event) => act('title', eventTime(event))}>
          <KeyHint keys={['left']} label={strings.toTitle} />
        </div>
      </footer>
    </section>
  );
}
