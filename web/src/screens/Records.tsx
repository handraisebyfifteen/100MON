import { scoreToPoints } from '@core';
import type { PeriodEntry, RunRecord } from '@core';
import { KeyHint } from '../components/KeyHint';
import { formatDuration, formatPercent } from '../format';
import type { Strings } from '../i18n';
import { useRemoteInput } from '../input';
import { playSound } from '../sound';

const RECENT_ROWS = 5;

interface RecordsProps {
  strings: Strings;
  periodLabel: string;
  /** このピリオド・この言語の集計。走行が無ければ null */
  entry: PeriodEntry | null;
  /** このピリオド・この言語の走行 */
  runs: readonly RunRecord[];
  /** いまの表示速度と回答の猶予で走った走行の、タイムの中央値（基準時間を決める材料） */
  medianMs: number | null;
  medianCount: number;
  onBack: () => void;
}

export function RecordsScreen({ strings, periodLabel, entry, runs, medianMs, medianCount, onBack }: RecordsProps) {
  const back = (): void => {
    playSound('back');
    onBack();
  };

  useRemoteInput((input, _at, repeat) => {
    if (repeat) return;
    if (input === 'ok' || input === 'left' || input === 'back') back();
  });

  const recent = runs
    .slice()
    .sort((a, b) => b.attemptNumber - a.attemptNumber)
    .slice(0, RECENT_ROWS);

  return (
    <section className="screen records">
      <h2>{strings.recordsTitle}</h2>
      <p className="records-period">{periodLabel}</p>

      {entry === null ? (
        <p className="empty">{strings.noRuns}</p>
      ) : (
        <>
          <div className="cards">
            <div className="card">
              <span className="stat-label">{strings.bestScore}</span>
              <span className="stat-value">{scoreToPoints(entry.bestScore)}</span>
            </div>
            <div className="card">
              <span className="stat-label">{strings.firstScore}</span>
              <span className="stat-value">{scoreToPoints(entry.firstScore)}</span>
            </div>
            <div className="card">
              <span className="stat-label">{strings.accuracyAll}</span>
              <span className="stat-value">{formatPercent(entry.totalCorrect / entry.totalAnswered)}</span>
            </div>
            <div className="card">
              <span className="stat-label">{strings.attempts}</span>
              <span className="stat-value">{entry.attempts}</span>
            </div>
            <div className="card">
              <span className="stat-label">{strings.medianTime(medianCount)}</span>
              <span className="stat-value">{medianMs === null ? '-' : formatDuration(medianMs)}</span>
            </div>
            <div className="card">
              <span className="stat-label">{strings.totalAnswered}</span>
              <span className="stat-value">{entry.totalAnswered}</span>
            </div>
          </div>

          <table className="runs">
            <thead>
              <tr>
                <th>{strings.colAttempt}</th>
                <th>{strings.score}</th>
                <th>{strings.time}</th>
                <th>{strings.correctCount}</th>
                <th>{strings.timeouts}</th>
                <th>{strings.colSpeed}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((run) => (
                <tr key={run.id} className={run.id === entry.bestRunId ? 'is-best' : undefined}>
                  <td>
                    {run.attemptNumber}
                    {run.id === entry.bestRunId ? ` ${strings.best}` : ''}
                  </td>
                  <td>{scoreToPoints(run.score)}</td>
                  <td>{formatDuration(run.totalMs)}</td>
                  <td>{run.answers.filter((a) => a.correct).length}</td>
                  <td>{run.answers.filter((a) => a.timedOut).length}</td>
                  <td>{run.settings.msPerChar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <footer className="actions">
        <div role="button" className="action is-primary" onPointerDown={back}>
          <KeyHint keys={['ok', 'left']} label={strings.back} />
        </div>
      </footer>
    </section>
  );
}
