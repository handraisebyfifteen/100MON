// React Native には performance.now() があるが、@react-native/typescript-config の lib に DOM が無いので型だけ足す
declare const performance: { now(): number };
