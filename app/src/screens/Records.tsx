import { Text, View } from 'react-native';
import { scoreToPoints } from '@core';
import type { PeriodEntry, RunRecord } from '@core';
import { KeyHint } from '../components/KeyHint';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { formatDuration, formatPercent } from '../format';
import type { Strings } from '../i18n';
import { useRemoteInput } from '../platform/input';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { playSound } from '../platform/sound';
import { COLORS, FONTS } from '../theme';

// ブラウザ版の web/src/screens/Records.tsx と同じ。表は View を並べて作る（RN に table は無い）。

const RECENT_ROWS = 5;

/** 表の列数。幅は等分 */
const COLUMNS = 6;

interface RecordsProps {
  strings: Strings;
  periodLabel: string;
  /** このピリオド・この言語の集計。走行が無ければ null */
  entry: PeriodEntry | null;
  /** このピリオド・この言語の走行 */
  runs: readonly RunRecord[];
  /** いまの表示速度と回答の猶予で走った走行の、タイムの中央値 */
  medianMs: number | null;
  medianCount: number;
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
  period: { marginTop: px(8), fontFamily: FONTS.text, fontSize: px(32), lineHeight: px(40), color: COLORS.dim },
  empty: { marginTop: px(220), fontFamily: FONTS.text, fontSize: px(48), lineHeight: px(56), color: COLORS.dim },
  cards: { width: px(1696), marginTop: px(20), flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  card: { width: px(552), height: px(152), marginRight: px(20), marginBottom: px(20) },
  cardLast: { marginRight: 0 },
  cardInner: { alignItems: 'center' as const, justifyContent: 'center' as const },
  statLabel: { fontFamily: FONTS.text, fontSize: px(32), lineHeight: px(40), color: COLORS.dim },
  statValue: { marginTop: px(8), fontFamily: FONTS.digits, fontSize: px(48), lineHeight: px(53), color: COLORS.white },
  table: { width: px(1696), marginTop: px(24) - px(20) },
  tr: { flexDirection: 'row' as const },
  th: {
    flex: 1,
    paddingVertical: px(4),
    borderBottomWidth: px(4),
    borderBottomColor: COLORS.blue,
    textAlign: 'center' as const,
    fontFamily: FONTS.text,
    fontSize: px(32),
    lineHeight: px(40),
    color: COLORS.dim,
  },
  td: {
    flex: 1,
    paddingVertical: px(4),
    textAlign: 'center' as const,
    fontFamily: FONTS.text,
    fontSize: px(32),
    lineHeight: px(40),
    color: COLORS.white,
  },
  actions: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: px(54),
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
  },
  actionInner: { paddingVertical: px(20), paddingHorizontal: px(44) },
});

export function RecordsScreen({ strings, periodLabel, entry, runs, medianMs, medianCount, onBack }: RecordsProps) {
  const s = useStyles(makeStyles);

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

  const cards: Array<[string, string | number]> = entry
    ? [
        [strings.bestScore, scoreToPoints(entry.bestScore)],
        [strings.firstScore, scoreToPoints(entry.firstScore)],
        [strings.accuracyAll, formatPercent(entry.totalCorrect / entry.totalAnswered)],
        [strings.attempts, entry.attempts],
        [strings.medianTime(medianCount), medianMs === null ? '-' : formatDuration(medianMs)],
        [strings.totalAnswered, entry.totalAnswered],
      ]
    : [];
  const headers = [strings.colAttempt, strings.score, strings.time, strings.correctCount, strings.timeouts, strings.colSpeed];

  return (
    <Screen>
      <Text style={s.h2}>{strings.recordsTitle}</Text>
      <Text style={s.period}>{periodLabel}</Text>

      {entry === null ? (
        <Text style={s.empty}>{strings.noRuns}</Text>
      ) : (
        <>
          <View style={s.cards}>
            {cards.map(([label, value], i) => (
              <Panel key={label} style={[s.card, (i + 1) % 3 === 0 && s.cardLast]} innerStyle={s.cardInner}>
                <Text style={s.statLabel}>{label}</Text>
                <Text style={s.statValue}>{value}</Text>
              </Panel>
            ))}
          </View>

          <View style={s.table}>
            <View style={s.tr}>
              {headers.slice(0, COLUMNS).map((header) => (
                <Text key={header} style={s.th}>
                  {header}
                </Text>
              ))}
            </View>
            {recent.map((run) => {
              const best = run.id === entry.bestRunId;
              const cells = [
                `${run.attemptNumber}${best ? ` ${strings.best}` : ''}`,
                scoreToPoints(run.score),
                formatDuration(run.totalMs),
                run.answers.filter((a) => a.correct).length,
                run.answers.filter((a) => a.timedOut).length,
                run.settings.msPerChar,
              ];
              return (
                <View key={run.id} style={s.tr}>
                  {cells.map((cell, i) => (
                    <Text key={i} style={[s.td, best && { color: COLORS.gold }]}>
                      {cell}
                    </Text>
                  ))}
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={s.actions}>
        <Panel focused innerStyle={s.actionInner}>
          <KeyHint keys={['ok', 'left']} label={strings.back} color={COLORS.ink} iconSize={35} fontSize={48} gap={24} />
        </Panel>
      </View>
    </Screen>
  );
}
