/**
 * カードの進み具合（埋めたマス・リーチ・BINGO）。曲名・お題の両方で使う。
 * FREE は埋まっている扱い。縦・横・斜めの 12 本を見る。
 */

export const BINGO_LINES: readonly (readonly number[])[] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

/** 縦・横・斜めのどれか 1 本がそろっているか。 */
export function hasBingo(filled: readonly boolean[]): boolean {
  return BINGO_LINES.some((line) => line.every((i) => filled[i]));
}

type AnyCell = "FREE" | { cleared: boolean };

export interface Progress {
  /** 埋めたマスの数（FREE は数えない）。 */
  filled: number;
  /** 埋められるマスの数（ふつう 24。中央が曲なら 25）。 */
  total: number;
  /** あと 1 マスでそろう列の数。 */
  reach: number;
  /** そろった列（BINGO_LINES の番号）。 */
  lines: number[];
  bingo: boolean;
}

export function progressOf(card: readonly AnyCell[]): Progress {
  const filledFlags = card.map((c) => c === "FREE" || c.cleared);
  const cells = card.filter((c): c is Exclude<AnyCell, "FREE"> => c !== "FREE");
  const counts = BINGO_LINES.map((line) => line.filter((i) => filledFlags[i]).length);
  const lines = counts.flatMap((n, i) => (n === 5 ? [i] : []));
  return {
    filled: cells.filter((c) => c.cleared).length,
    total: cells.length,
    reach: counts.filter((n) => n === 4).length,
    lines,
    bingo: lines.length > 0,
  };
}

/** 指定したマスを埋める／戻す（新しいカードを返す）。FREE は変えない。 */
export function withCleared<T extends { cleared: boolean }>(
  card: readonly (T | "FREE")[],
  index: number,
  cleared: boolean
): (T | "FREE")[] {
  return card.map((c, i) => (i === index && c !== "FREE" ? { ...c, cleared } : c));
}

/** 複数のマスをまとめて埋める（新しいカードを返す）。遊んだ曲の逆引きで使う。 */
export function withClearedAll<T extends { cleared: boolean }>(
  card: readonly (T | "FREE")[],
  indices: readonly number[]
): (T | "FREE")[] {
  const targets = new Set(indices);
  return card.map((c, i) => (targets.has(i) && c !== "FREE" ? { ...c, cleared: true } : c));
}
