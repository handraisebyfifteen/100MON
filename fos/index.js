import { AppRegistry, LogBox } from 'react-native';
import { App } from '../app/src/App';
import { name as appName } from './app.json';

// Vega 版（app/index.js）と同じ。画面とゲームの中身は /app/src をそのまま使う
LogBox.ignoreAllLogs();

AppRegistry.registerComponent(appName, () => App);
