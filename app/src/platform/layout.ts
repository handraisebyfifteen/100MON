import { useMemo } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';

/** 画面は 1920×1080 を基準に組む（ブラウザ版の Stage と同じ） */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

export interface Stage {
  /** 基準の px を、いまの画面の大きさに換算する。styles.css の 64px は px(64) と書く */
  px: (value: number) => number;
  scale: number;
  /** 画面の中で、基準の枠が置かれる位置と大きさ */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

function makeStage(windowWidth: number, windowHeight: number): Stage {
  const scale = Math.min(windowWidth / STAGE_WIDTH, windowHeight / STAGE_HEIGHT);
  const width = STAGE_WIDTH * scale;
  const height = STAGE_HEIGHT * scale;
  return {
    // 実画素に揃える（1080p の TV では scale 0.5 なので、基準の 2px が 1 実画素）
    px: (value) => PixelRatio.roundToNearestPixel(value * scale),
    scale,
    offsetX: (windowWidth - width) / 2,
    offsetY: (windowHeight - height) / 2,
    width,
    height,
  };
}

/**
 * 表示先に合わせた換算。Vega の useWindowDimensions は 1080p の TV で 960×540（scale 2）を返す。
 * どの値でも上の式で動く（§10-0 で確認）。
 */
export function useStage(): Stage {
  const { width, height } = useWindowDimensions();
  return useMemo(() => makeStage(width, height), [width, height]);
}

/** 画面の大きさが変わったときだけ作り直すスタイル */
export function useStyles<T>(factory: (stage: Stage) => T): T {
  const stage = useStage();
  return useMemo(() => factory(stage), [factory, stage]);
}
