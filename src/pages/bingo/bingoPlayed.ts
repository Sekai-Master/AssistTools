/**
 * 遊んだ曲からの逆引き。曲を 1 つ入れると、カードのどのマスが当てはまるかを返す。
 * お題はお題の test、曲名は同じ曲かどうかで見る。
 * 1 曲で当てはまるマスは全部埋めてよい（お題の難しさの目安もこの前提で測ってある。odaiLogic.test.ts の bingoRate）。
 */
import type { BingoMusic, Cell } from "./bingoLogic";
import type { OdaiCell } from "./odaiLogic";

/** 当てはまるマスの番号（カードの番号順）。FREE は数えない。 */
export function matchingCells(card: readonly (OdaiCell | Cell)[], music: BingoMusic): number[] {
  return card.flatMap((c, i) => {
    if (c === "FREE") return [];
    const hit = "odai" in c ? c.odai.test(music) : c.id === music.id;
    return hit ? [i] : [];
  });
}
