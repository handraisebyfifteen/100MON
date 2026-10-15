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
  /** 角の欠けの色。枠の後ろにある地の色に合わせる。既定は画面の地 */
  notchColor?: string;
  style?: StyleProp<ViewStyle>;
  /** 中身の並べ方 */
  innerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** 角を欠く大きさ（styles.css の --notch と同じ 8px） */
const NOTCH = 8;

/**
 * 二重線の枠。外が明るい青、内が濃い青（styles.css の .choice / .menu-row / .stat / .action）。
 * CSS の border + box-shadow: inset を、View を2枚重ねて再現する（vega-port.md §3）。
 * 角を 8px 欠く clip-path は、地の色の小さな View を4隅にかぶせて再現する。
 */
export function Panel({ focused = false, outerColor, notchColor = COLORS.panel, style, innerStyle, children }: PanelProps) {
  const { px } = useStyles((stage) => stage);
  const border = px(8);
  const notch = px(NOTCH);
  // 絶対配置の原点は枠の内側なので、枠の太さぶん外へ出して外側の角に重ねる
  const corner = { position: 'absolute' as const, width: notch, height: notch, backgroundColor: notchColor };
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
      <View style={[corner, { left: -border, top: -border }]} />
      <View style={[corner, { right: -border, top: -border }]} />
      <View style={[corner, { left: -border, bottom: -border }]} />
      <View style={[corner, { right: -border, bottom: -border }]} />
    </View>
  );
}
