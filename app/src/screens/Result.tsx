import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { scoreToPoints } from '@core';
import type { RunResult } from '@core';
import { KeyHint } from '../components/KeyHint';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { Tag } from '../components/Tag';
import { formatDuration } from '../format';
import type { Strings } from '../i18n';
import { now, useRemoteInput } from '../platform/input';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { playSound } from '../platform/sound';
import { COLORS, FONTS } from '../theme';

/** 最後の問題の連打で、そのまま次の走行が始まってしまわないようにする */
const INPUT_LOCK_MS = 700;

/** サーバー（ランキング）から見た、この走行の扱い */
export type ServerResult =
  /** サーバーに申告しない走行（お試し・自動再生・online オフ） */
  | { status: 'none' }
  /** 申告できなかった（つながらない・期間外・回数切れなど）。端末内の記録だけ */
  | { status: 'offline'; reason: string }
  | { status: 'pending' }
  | { status: 'ok'; rank: number; entrants: number; isNewBest: boolean }
  | { status: 'error'; code: string };

interface ResultProps {
  strings: Strings;
  result: RunResult;
  /** 何回目の挑戦か。記録に残さない走行では null */
  attemptNumber: number | null;
  isNewBest: boolean;
  server: ServerResult;
  /** 自動再生のとき、この時間が過ぎたら次の走行へ進む */
  autoContinueMs: number | null;
  onRetry: () => void;
  onTitle: () => void;
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
  badges: { minHeight: px(48), marginTop: px(16), flexDirection: 'row' as const },
  badge: { marginRight: px(24) },
  score: { marginTop: px(20), alignItems: 'center' as const },
  scoreLabel: { fontFamily: FONTS.text, fontSize: px(48), color: COLORS.sky },
  scoreRow: { marginTop: px(8), flexDirection: 'row' as const, alignItems: 'flex-end' as const },
  scoreValue: {
    fontFamily: FONTS.digits,
    fontSize: px(176),
    lineHeight: px(176),
    color: COLORS.gold,
    textShadowColor: '#7c3c00',
    textShadowOffset: { width: px(8), height: px(8) },
    textShadowRadius: 0,
  },
  scoreMax: { marginLeft: px(16), fontFamily: FONTS.digits, fontSize: px(40), lineHeight: px(56), color: COLORS.dim },
  statRow: { marginTop: px(44), flexDirection: 'row' as const },
  stat: { width: px(480), height: px(176), marginHorizontal: px(20) },
  statInner: { alignItems: 'center' as const, justifyContent: 'center' as const },
  statLabel: { fontFamily: FONTS.text, fontSize: px(32), color: COLORS.dim },
  statValueRow: { marginTop: px(8), flexDirection: 'row' as const, alignItems: 'flex-end' as const },
  statValue: { fontFamily: FONTS.digits, fontSize: px(64), lineHeight: px(70), color: COLORS.white },
  statSmall: { marginLeft: px(8), fontFamily: FONTS.digits, fontSize: px(32), lineHeight: px(44), color: COLORS.dim },
  server: { marginTop: px(40), fontFamily: FONTS.text, fontSize: px(40), lineHeight: px(48) },
  actions: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: px(54),
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
  },
  action: { marginHorizontal: px(20) },
  actionInner: { paddingVertical: px(20), paddingHorizontal: px(44) },
});

export function ResultScreen(props: ResultProps) {
  const { strings, result, attemptNumber, isNewBest, server, autoContinueMs, onRetry, onTitle } = props;
  const s = useStyles(makeStyles);
  const shownAt = useRef(now());
  const retry = useRef(onRetry);
  useEffect(() => {
    retry.current = onRetry;
  });

  useEffect(() => {
    if (autoContinueMs === null) return;
    const timer = setTimeout(() => retry.current(), autoContinueMs);
    return () => clearTimeout(timer);
  }, [autoContinueMs]);

  const act = (input: 'retry' | 'title', at: number): void => {
    if (at - shownAt.current < INPUT_LOCK_MS) return;
    if (input === 'retry') {
      onRetry();
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

  // サーバーの順位の行。申告しない走行では出さない
  const serverLine = ((): { text: string; color: string } | null => {
    switch (server.status) {
      case 'none':
        return null;
      case 'pending':
        return { text: strings.rankPending, color: COLORS.dim };
      case 'ok':
        return { text: strings.rankLine(server.rank, server.entrants), color: COLORS.gold };
      case 'error':
        return { text: strings.rankFailed(server.code), color: COLORS.timeout };
      case 'offline':
        return { text: strings.notRanked(strings.serverReason(server.reason)), color: COLORS.dim };
    }
  })();

  return (
    <Screen>
      <Text style={s.h2}>{strings.resultTitle}</Text>
      <View style={s.badges}>
        <View style={s.badge}>
          <Tag text={attemptNumber !== null ? strings.attempt(attemptNumber) : strings.notRecorded} />
        </View>
        {isNewBest && (
          <View style={s.badge}>
            <Tag text={strings.newBest} strong />
          </View>
        )}
      </View>

      <View style={s.score}>
        <Text style={s.scoreLabel}>{strings.score}</Text>
        <View style={s.scoreRow}>
          <Text style={s.scoreValue}>{scoreToPoints(result.score)}</Text>
          <Text style={s.scoreMax}>{strings.scoreMax}</Text>
        </View>
      </View>

      <View style={s.statRow}>
        <Panel style={s.stat} innerStyle={s.statInner}>
          <Text style={s.statLabel}>{strings.time}</Text>
          <View style={s.statValueRow}>
            <Text style={s.statValue}>{formatDuration(result.totalMs)}</Text>
          </View>
        </Panel>
        <Panel style={s.stat} innerStyle={s.statInner}>
          <Text style={s.statLabel}>{strings.correctCount}</Text>
          <View style={s.statValueRow}>
            <Text style={s.statValue}>{result.correctCount}</Text>
            <Text style={s.statSmall}>/{result.questionCount}</Text>
          </View>
        </Panel>
        <Panel style={s.stat} innerStyle={s.statInner}>
          <Text style={s.statLabel}>{strings.timeouts}</Text>
          <View style={s.statValueRow}>
            <Text style={s.statValue}>{result.timedOutCount}</Text>
          </View>
        </Panel>
      </View>
      {serverLine !== null && <Text style={[s.server, { color: serverLine.color }]}>{serverLine.text}</Text>}

      <View style={s.actions}>
        <Panel focused style={s.action} innerStyle={s.actionInner}>
          <KeyHint keys={['ok']} label={strings.retry} color={COLORS.ink} iconSize={35} fontSize={48} gap={24} />
        </Panel>
        <Panel style={s.action} innerStyle={s.actionInner}>
          <KeyHint keys={['left']} label={strings.toTitle} iconSize={35} fontSize={48} gap={24} />
        </Panel>
      </View>
    </Screen>
  );
}
