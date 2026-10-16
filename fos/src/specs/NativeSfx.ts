import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * 効果音を鳴らす Android 側の部品（android/app/src/main/java/com/hyakumon/SfxModule.kt）の呼び出し口。
 * ここに書いた形から、ビルド時に Java 側の土台（NativeSfxSpec）が生成される。
 */
export interface Spec extends TurboModule {
  /** res/raw にある音を読み込む。読み込めた数を返す */
  load(names: string[]): Promise<number>;
  /** 読み込んだ音を鳴らす。volume は 0〜1 */
  play(name: string, volume: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Sfx');
