import { View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useStyles } from '../platform/layout';
import type { Stage } from '../platform/layout';
import { COLORS } from '../theme';

/** 1920×1080 の枠。表示先に合わせて中央に置く（ブラウザ版の Stage） */
export function StageView({ children }: { children: ReactNode }) {
  const stage = useStyles((s) => s);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.outside }}>
      <View
        style={{
          position: 'absolute',
          left: stage.offsetX,
          top: stage.offsetY,
          width: stage.width,
          height: stage.height,
          overflow: 'hidden',
          backgroundColor: COLORS.panel,
        }}
      >
        {children}
      </View>
    </View>
  );
}

const makeScreenStyles = ({ px }: Stage) => ({
  screen: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    // TV では画面の端が切れることがあるので、上下 54px・左右 96px には文字を置かない
    paddingVertical: px(54),
    paddingHorizontal: px(96),
    alignItems: 'center' as const,
    // 画面ごとに背景を塗る。激ムズの画面は色を反転するので、外側の StageView の色に頼らない
    backgroundColor: COLORS.panel,
  },
});

/** 画面1枚ぶんの土台（styles.css の .screen） */
export function Screen({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const s = useStyles(makeScreenStyles);
  return <View style={[s.screen, style]}>{children}</View>;
}
