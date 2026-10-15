import { Text } from 'react-native';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { COLORS, FONTS } from '../theme';

const makeStyles = ({ px }: Stage) => ({
  tag: {
    paddingHorizontal: px(16),
    borderWidth: px(4),
    fontFamily: FONTS.text,
    fontSize: px(32),
    lineHeight: px(40),
  },
});

/** 「仮データ」「激ムズ」などの札（styles.css の .tag） */
export function Tag({ text, strong = false }: { text: string; strong?: boolean }) {
  const s = useStyles(makeStyles);
  const color = strong ? COLORS.gold : COLORS.dim;
  return <Text style={[s.tag, { color, borderColor: color }]}>{text}</Text>;
}
