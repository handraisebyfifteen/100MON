import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { Locale } from '@core';
import { KeyHint } from '../components/KeyHint';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import type { Strings } from '../i18n';
import { ApiError, getLeaderboard } from '../platform/api';
import type { LeaderboardResponse, RankedEntry } from '../platform/api';
import { useRemoteInput } from '../platform/input';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { playSound } from '../platform/sound';
import { COLORS, FONTS } from '../theme';

// ランキング：上位10人と自分（設計書 §10・§13）。TV では行が読めなくなるので、これ以上は出さない。
// ブラウザ版には無い画面（Vega 版だけ）。見た目は記録の画面に合わせる。

interface RankingProps {
  strings: Strings;
  periodLabel: string;
  periodId: string;
  locale: Locale;
  playerId: string;
  onBack: () => void;
}

type Loaded =
  | { status: 'loading' }
  | { status: 'ok'; board: LeaderboardResponse }
  | { status: 'error'; code: string };

/** 列の幅（基準の px）。合わせて 1696 */
const COLUMNS = { rank: 200, name: 816, points: 400, attempts: 280 };

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
  message: { marginTop: px(220), fontFamily: FONTS.text, fontSize: px(48), lineHeight: px(56), color: COLORS.dim },
  messageError: { color: COLORS.timeout },
  table: { width: px(1696), marginTop: px(24) },
  tr: { flexDirection: 'row' as const },
  cell: { paddingVertical: px(4), textAlign: 'center' as const, fontFamily: FONTS.text, fontSize: px(32), lineHeight: px(40) },
  th: { borderBottomWidth: px(4), borderBottomColor: COLORS.blue, color: COLORS.dim },
  nameCell: { textAlign: 'left' as const, paddingLeft: px(32) },
  points: { fontFamily: FONTS.digits, lineHeight: px(44) },
  // 上位10人に入っていない自分の行は、少し離して出す
  gap: { height: px(24) },
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

export function RankingScreen({ strings, periodLabel, periodId, locale, playerId, onBack }: RankingProps) {
  const s = useStyles(makeStyles);
  const { px } = useStyles((stage) => stage);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoaded({ status: 'loading' });
    getLeaderboard({ periodId, locale, playerId })
      .then((board) => {
        if (alive) setLoaded({ status: 'ok', board });
      })
      .catch((error: unknown) => {
        if (alive) setLoaded({ status: 'error', code: error instanceof ApiError ? error.code : 'OFFLINE' });
      });
    return () => {
      alive = false;
    };
  }, [periodId, locale, playerId, reloadKey]);

  const back = useCallback((): void => {
    playSound('back');
    onBack();
  }, [onBack]);

  useRemoteInput((input, _at, repeat) => {
    if (repeat) return;
    if (input === 'left' || input === 'back') back();
    if (input === 'ok' && loaded.status !== 'loading') {
      playSound('decide');
      setReloadKey((k) => k + 1);
    }
  });

  const widths = {
    rank: { width: px(COLUMNS.rank) },
    name: { width: px(COLUMNS.name) },
    points: { width: px(COLUMNS.points) },
    attempts: { width: px(COLUMNS.attempts) },
  };

  const row = (entry: RankedEntry, me: boolean, key: string) => {
    const color = me ? COLORS.gold : COLORS.white;
    return (
      <View key={key} style={s.tr}>
        <Text style={[s.cell, widths.rank, { color }]}>{entry.rank}</Text>
        <Text style={[s.cell, s.nameCell, widths.name, { color }]} numberOfLines={1}>
          {entry.displayName}
          {me ? `　${strings.you}` : ''}
        </Text>
        <Text style={[s.cell, s.points, widths.points, { color }]}>{entry.bestPoints}</Text>
        <Text style={[s.cell, widths.attempts, { color }]}>{entry.attempts}</Text>
      </View>
    );
  };

  const board = loaded.status === 'ok' ? loaded.board : null;
  const me = board?.me ?? null;
  const isMe = (entry: RankedEntry): boolean =>
    me !== null && entry.rank === me.rank && entry.displayName === me.displayName;
  const meInTop = board !== null && board.top.some(isMe);

  return (
    <Screen>
      <Text style={s.h2}>{strings.rankingTitle}</Text>
      <Text style={s.period}>
        {periodLabel}
        {board ? `　・　${strings.entrants(board.entrants)}` : ''}
      </Text>

      {loaded.status === 'loading' && <Text style={s.message}>{strings.loading}</Text>}
      {loaded.status === 'error' && (
        <Text style={[s.message, s.messageError]}>{strings.serverReason(loaded.code)}</Text>
      )}
      {board !== null && board.top.length === 0 && <Text style={s.message}>{strings.noEntries}</Text>}
      {board !== null && board.top.length > 0 && (
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.cell, s.th, widths.rank]}>{strings.colRank}</Text>
            <Text style={[s.cell, s.th, s.nameCell, widths.name]}>{strings.colName}</Text>
            <Text style={[s.cell, s.th, widths.points]}>{strings.colPoints}</Text>
            <Text style={[s.cell, s.th, widths.attempts]}>{strings.colAttempts}</Text>
          </View>
          {board.top.map((entry) => row(entry, isMe(entry), `top-${entry.rank}-${entry.displayName}`))}
          {me !== null && !meInTop && (
            <>
              <View style={s.gap} />
              {row(me, true, 'me')}
            </>
          )}
        </View>
      )}

      <View style={s.actions}>
        <Panel focused style={s.action} innerStyle={s.actionInner}>
          <KeyHint keys={['ok']} label={strings.reload} color={COLORS.ink} iconSize={35} fontSize={48} gap={24} />
        </Panel>
        <Panel style={s.action} innerStyle={s.actionInner}>
          <KeyHint keys={['left']} label={strings.back} iconSize={35} fontSize={48} gap={24} />
        </Panel>
      </View>
    </Screen>
  );
}
