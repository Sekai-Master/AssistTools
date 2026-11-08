import { describe, expect, it } from "vitest";
import { BINGO_LINES, progressOf, withCleared } from "./bingoProgress";

type C = "FREE" | { id: number; cleared: boolean };

/** filled に入れた位置だけ埋めたカード（中央は FREE）。 */
function cardWith(filled: number[]): C[] {
  return Array.from({ length: 25 }, (_, i) => (i === 12 ? "FREE" : { id: i, cleared: filled.includes(i) }));
}

describe("progressOf（埋めたマス・リーチ・BINGO）", () => {
  it("何も埋めていなければ 0。FREE は数えない（24 マス中）", () => {
    const p = progressOf(cardWith([]));
    expect(p).toMatchObject({ filled: 0, total: 24, reach: 0, bingo: false, lines: [] });
  });

  it("FREE は埋まっている扱い: 中央を通る列は 4 マス埋めると BINGO", () => {
    const p = progressOf(cardWith([2, 7, 17, 22])); // 縦の真ん中
    expect(p.bingo).toBe(true);
    expect(p.lines).toHaveLength(1);
    expect(BINGO_LINES[p.lines[0]]).toEqual([2, 7, 12, 17, 22]);
    expect(p.filled).toBe(4);
  });

  it("あと 1 マスの列をリーチとして数える（列の数）", () => {
    // 横の 1 行目に 4 つ → リーチ 1。中央の列に 3 つ（＋FREE）→ リーチ 2
    const p = progressOf(cardWith([0, 1, 2, 3, 10, 11, 13]));
    expect(p.bingo).toBe(false);
    expect(p.reach).toBe(2);
  });

  it("縦・横・斜めの 12 本を見る。そろった列はリーチに数えない", () => {
    expect(BINGO_LINES).toHaveLength(12);
    const diag = progressOf(cardWith([0, 6, 18, 24]));
    expect(diag.bingo).toBe(true);
    expect(diag.reach).toBe(0);
    const two = progressOf(cardWith([0, 1, 2, 3, 4, 5, 10, 15, 20]));
    expect(two.lines).toHaveLength(2);
  });

  it("中央が曲（FREE でない）のカードは 25 マス中で数える", () => {
    const card: C[] = Array.from({ length: 25 }, (_, i) => ({ id: i, cleared: i < 5 }));
    const p = progressOf(card);
    expect(p).toMatchObject({ filled: 5, total: 25, bingo: true });
  });
});

describe("withCleared", () => {
  it("指定したマスだけ変え、元は変えない。FREE は変えない", () => {
    const card = cardWith([]);
    const next = withCleared(card, 0, true);
    expect(next[0]).toEqual({ id: 0, cleared: true });
    expect(card[0]).toEqual({ id: 0, cleared: false });
    expect(withCleared(card, 12, true)[12]).toBe("FREE");
  });
});
