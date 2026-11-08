import { describe, expect, it } from "vitest";
import { fitOdaiText, layoutChunks } from "./odaiCanvas";

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
