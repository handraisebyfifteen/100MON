// Fire OS 版（Android）でビルドするときは、こちらが sound.ts の代わりに読まれる（Metro のプラットフォーム別ファイル）。
// 中身は /fos/src/platform/sound.ts にある。Vega 版のビルド（platform は kepler）はこのファイルを見ない
export * from '../../../fos/src/platform/sound';
