import { describe, expect, it } from "vitest";
import { fitOdaiText, layoutChunks, maxLinesAt } from "./odaiCanvas";

// 1 字 = 大きさ × 1 の幅とみなす（canvas の measureText の代わり）
const measureAt = (size: number) => (s: string) => [...s].length * size;

describe("layoutChunks", () => {
  it("区切りの中では折らず、入るだけ同じ行に詰める", () => {
    expect(layoutChunks(["ひらがな", "だけ"], 100, measureAt(10))).toEqual(["ひらがなだけ"]);
    expect(layoutChunks(["ひらがな", "だけ"], 50, measureAt(10))).toEqual(["ひらがな", "だけ"]);
  });

  it("1 つの区切りが幅を超えるときだけ字の単位で折る", () => {
    expect(layoutChunks(["ピノキオピー"], 40, measureAt(10))).toEqual(["ピノキオ", "ピー"]);
  });
});

describe("fitOdaiText", () => {
  it("2 行以内に収まるいちばん大きい字の大きさを選ぶ", () => {
    const fit = fitOdaiText(["2:30", "以上"], 88, (size) => measureAt(size));
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    for (const line of fit.lines) expect(measureAt(fit.size)(line)).toBeLessThanOrEqual(88);
    // 22px なら「2:30以上」(6字=132) は 1 行に入らず、「2:30」(88) と「以上」の 2 行に入る
    expect(fit.size).toBe(22);
    expect(fit.lines).toEqual(["2:30", "以上"]);
  });

  it("長い名前は字を小さくして収める", () => {
    const fit = fitOdaiText(["cosMo@", "暴走P"], 88, (size) => measureAt(size));
    expect(fit.size).toBeLessThan(22);
    for (const line of fit.lines) expect(measureAt(fit.size)(line)).toBeLessThanOrEqual(88);
  });
});

describe("名前の長いお題（入れたいお題・差し替えで選べる作者）", () => {
  // 半角は 0.55 字ぶんとみなす（英字の名前の幅を、全角 1 字の測り方より実物に近くする）
  const measureMixed = (size: number) => (s: string) =>
    [...s].reduce((acc, ch) => acc + (ch.charCodeAt(0) < 0x80 ? 0.55 : 1), 0) * size;

  it("幅を超える区切りは、空白の後ろで折り、それでも超える語だけ字の単位で折る。行の端の空白は外す", () => {
    expect(layoutChunks(["OSTER project feat.", " 初音", "ミク"], 70, measureMixed(10))).toEqual([
      "OSTER",
      "project",
      "feat. 初音",
      "ミク",
    ]);
    expect(layoutChunks(["nyanyannya"], 30, measureMixed(10))).toEqual(["nyany", "annya"]);
  });

  it.each([
    [["雄之助 & CircusP feat.", " Hatsune Miku"]],
    [["さつき が てんこもり feat.", " 初音", "ミク"]],
    [["Ado×Giga、TeddyLoid & DECO*", "27"]],
    [["ワンダフル☆オポチュニティ！"]],
    [["1640mP", "（164×40mP）"]],
  ])("%j: どの行も幅に収まり、マスの高さに収まる行の数", (chunks) => {
    const fit = fitOdaiText(chunks, 88, measureMixed);
    for (const line of fit.lines) expect(measureMixed(fit.size)(line)).toBeLessThanOrEqual(88);
    expect(fit.lines.length).toBeLessThanOrEqual(fit.size >= 12 ? 3 : maxLinesAt(fit.size));
    expect(fit.size).toBeGreaterThanOrEqual(8);
    // 字を詰めて文言が欠けていない（空白だけが落ちる）
    expect(fit.lines.join("").replace(/\s/g, "")).toBe(chunks.join("").replace(/\s/g, ""));
  });
});
