/**
 * 表示名の自動生成（設計書 §11）。例：SwiftFalcon-4821
 * 匿名IDから決まるので、保存しなくても毎回同じ名前になる。
 * 自由入力にしないのは、公開ランキングが投稿コンテンツ扱いになるのを避けるため。
 */

const ADJECTIVES = [
  'Swift', 'Brave', 'Calm', 'Clever', 'Quick', 'Bright', 'Bold', 'Keen',
  'Lucky', 'Merry', 'Nimble', 'Proud', 'Quiet', 'Rapid', 'Sharp', 'Sunny',
  'Wise', 'Witty', 'Zesty', 'Agile', 'Cosmic', 'Daring', 'Eager', 'Fancy',
  'Gentle', 'Happy', 'Icy', 'Jolly', 'Kind', 'Lively', 'Mighty', 'Noble',
];

const ANIMALS = [
  'Falcon', 'Otter', 'Tiger', 'Panda', 'Koala', 'Eagle', 'Rabbit', 'Wolf',
  'Fox', 'Lynx', 'Heron', 'Dolphin', 'Badger', 'Crane', 'Gecko', 'Hawk',
  'Ibis', 'Jaguar', 'Kestrel', 'Lemur', 'Moose', 'Newt', 'Owl', 'Puffin',
  'Quokka', 'Raven', 'Seal', 'Toucan', 'Urchin', 'Viper', 'Walrus', 'Yak',
];

/** FNV-1a（32ビット）。暗号用ではなく、文字列からばらついた数を作るだけ */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function displayNameFor(playerId: string): string {
  const h1 = fnv1a(playerId);
  const h2 = fnv1a(`${playerId}#2`);
  const adjective = ADJECTIVES[h1 % ADJECTIVES.length] as string;
  const animal = ANIMALS[(h1 >>> 8) % ANIMALS.length] as string;
  const digits = String(h2 % 10_000).padStart(4, '0');
  return `${adjective}${animal}-${digits}`;
}
