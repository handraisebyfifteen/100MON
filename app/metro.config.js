const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// /app は /core と /data の外にあるので、Metro に見せる場所を足す（vega-port.md §5）
const repoRoot = path.resolve(__dirname, '..');

/** @type {import('metro-config').MetroConfig} */
const config = {
  watchFolders: [path.join(repoRoot, 'core'), path.join(repoRoot, 'data')],
  resolver: {
    // ブラウザ版と同じ `@core` で /core/src/index.ts を読む
    extraNodeModules: {
      '@core': path.join(repoRoot, 'core', 'src'),
    },
    // /core のファイルが使う @babel/runtime などを、/app/node_modules から探す
    nodeModulesPaths: [path.join(__dirname, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
