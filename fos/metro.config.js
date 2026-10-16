const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// Fire OS 版は、画面とゲームの中身を Vega 版と同じ /app/src から読む（/core と /data も）。
// 違うのは platform/ の入力と音だけで、それは *.android.ts が fos/src/platform/ に振り分ける。
const repoRoot = path.resolve(__dirname, '..');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  watchFolders: [path.join(repoRoot, 'app', 'src'), path.join(repoRoot, 'core'), path.join(repoRoot, 'data')],
  resolver: {
    extraNodeModules: {
      '@core': path.join(repoRoot, 'core', 'src'),
    },
    // /app/src や /core のファイルが使う react-native などは、fos/node_modules のもの（react-native-tvos）を使う
    nodeModulesPaths: [path.join(__dirname, 'node_modules')],
    // Vega 版の /app/node_modules とブラウザ版の /node_modules は拾わない（watchFolders の外なので元々見えないが、明示しておく）。
    // disableHierarchicalLookup は使わない：react-native-tvos が自分の中に抱える部品（@react-native-tvos/virtualized-lists）まで見えなくなる
    blockList: [
      new RegExp(`^${escapeRegExp(path.join(repoRoot, 'app', 'node_modules'))}/.*`),
      new RegExp(`^${escapeRegExp(path.join(repoRoot, 'node_modules'))}/.*`),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
