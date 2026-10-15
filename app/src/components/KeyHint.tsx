import { Text, View } from 'react-native';
import type { Direction } from '@core';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { COLORS, FONTS } from '../theme';
import { PixelIcon } from './PixelIcon';

interface KeyHintProps {
  /** 使うボタン。方向キーか中央ボタン */
  keys: ReadonlyArray<Direction | 'ok'>;
  label: string;
  /** 文字と矢印の色。既定は案内の薄い色 */
  color?: string;
  /** 矢印の大きさ（基準の px）。既定は案内の 28px */
  iconSize?: number;
  /** 文字の大きさ（基準の px） */
  fontSize?: number;
  /** ボタンと文字の間（基準の px） */
  gap?: number;
}

const makeStyles = ({ px }: Stage) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const },
  keys: { flexDirection: 'row' as const, alignItems: 'center' as const },
  key: { marginRight: px(6) },
  keycap: {
    paddingHorizontal: px(8),
    borderWidth: px(4),
    fontFamily: FONTS.digits,
    fontSize: px(24),
    lineHeight: px(32),
  },
  label: { fontFamily: FONTS.text },
});

/** 「このボタンで何ができるか」の案内 */
export function KeyHint({ keys, label, color = COLORS.dim, iconSize = 28, fontSize = 32, gap = 16 }: KeyHintProps) {
  const s = useStyles(makeStyles);
  const { px } = useStyles((stage) => stage);
  return (
    <View style={s.row}>
      <View style={[s.keys, { marginRight: px(gap) }]}>
        {keys.map((key) =>
          key === 'ok' ? (
            <Text key={key} style={[s.keycap, s.key, { color, borderColor: color }]}>
              OK
            </Text>
          ) : (
            <View key={key} style={s.key}>
              <PixelIcon name="arrow" size={px(iconSize)} color={color} direction={key} />
            </View>
          ),
        )}
      </View>
      <Text style={[s.label, { color, fontSize: px(fontSize) }]}>{label}</Text>
    </View>
  );
}
