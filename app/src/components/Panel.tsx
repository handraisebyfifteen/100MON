import { View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useStyles } from '../platform/layout';
import { COLORS } from '../theme';

interface PanelProps {
  /** 選択中：塗りと枠の色が変わる */
  focused?: boolean;
  /** 外側の枠の色を一時的に変える（選択中の点滅） */
  outerColor?: string;
  style?: StyleProp<ViewStyle>;
  /** 中身の並べ方 */
  innerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * 二重線の枠。外が明るい青、内が濃い青（styles.css の .choice / .menu-row / .stat / .action）。
 * CSS の border + box-shadow: inset を、View を2枚重ねて再現する（vega-port.md §3）。
 * 角を1ドット欠く clip-path は後回し。
 */
export function Panel({ focused = false, outerColor, style, innerStyle, children }: PanelProps) {
  const { px } = useStyles((stage) => stage);
  const border = px(8);
  return (
    <View
      style={[
        {
          borderWidth: border,
          borderColor: outerColor ?? (focused ? COLORS.white : COLORS.sky),
          backgroundColor: focused ? COLORS.select : COLORS.panel,
        },
        style,
      ]}
    >
      <View
        style={[
          { flex: 1, borderWidth: border, borderColor: focused ? COLORS.gold : COLORS.blue },
          innerStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
