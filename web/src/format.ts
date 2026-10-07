/** 3:42.5 の形 */
export function formatDuration(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100));
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** 87.5% の形 */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** 2026-10-19 の形（UTC） */
function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ピリオドの期間。終わりの時刻は含まないので、最終日は1ミリ秒前の日付 */
export function formatPeriodRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const last = new Date(new Date(endsAt).getTime() - 1);
  return `${utcDate(start)} – ${utcDate(last).slice(5)} UTC`;
}

/**
 * 表示したときの幅を、全角1文字ぶんを 1 として数える。
 * ドット文字の書体は全角が 1、半角がちょうど半分の幅なので、この数え方で幅が決まる。
 */
export function displayUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    units += (ch.codePointAt(0) ?? 0) > 0xff ? 1 : 0.5;
  }
  return units;
}

// 文字の大きさは 16 の倍数にする（16ドットの書体なので、1ドットがちょうど整数ピクセルになる）

export type QuestionSize = 'lg' | 'md' | 'sm';

/** 問題文の文字サイズ。途中で変わらないよう、全文の長さで決める */
export function questionSize(text: string): QuestionSize {
  const units = displayUnits(text);
  if (units <= 19) return 'lg'; // 80px で1行
  if (units <= 40) return 'md'; // 64px で2行まで
  return 'sm'; // 48px で3行まで
}

export type ChoiceSize = 'xl' | 'lg' | 'sm';

/** 選択肢の文字サイズ。4つの大きさが揃うよう、一番長いものに合わせる */
export function choiceSize(choices: readonly string[]): ChoiceSize {
  const longest = Math.max(...choices.map(displayUnits));
  if (longest <= 7.5) return 'xl'; // 64px
  if (longest <= 10.5) return 'lg'; // 48px
  return 'sm'; // 32px。長いものは2行に折り返す
}
