import { describe, expect, it } from "vitest";
import { completeTargetSuffix, parseAmount } from "./inputParsing";

describe("parseAmount", () => {
  it("カンマを落として整数化する", () => {
    expect(parseAmount("1,234,567")).toBe(1234567);
  });

  it("前後の空白を無視する", () => {
    expect(parseAmount("  100 ")).toBe(100);
  });

  it("空文字は0", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("   ")).toBe(0);
  });

  it("数値でない入力は0にフォールバック", () => {
    expect(parseAmount("abc")).toBe(0);
    expect(parseAmount("--")).toBe(0);
  });

  it("既定では小数を切り捨て、allowDecimalで許可する", () => {
    expect(parseAmount("12.5")).toBe(12);
    expect(parseAmount("12.5", true)).toBe(12.5);
  });

  it("nullやundefinedを渡しても落ちない", () => {
    // 実行時に想定外の値が来る可能性に対する防御。
    expect(parseAmount(undefined as unknown as string)).toBe(0);
    expect(parseAmount(null as unknown as string)).toBe(0);
  });
});

describe("completeTargetSuffix", () => {
  it("下位桁を現在ポイントの上位桁で補完する", () => {
    // 現在 1,000,000 に対し下4桁 5000 → 1,005,000
    expect(completeTargetSuffix("1,000,000", "5000")).toBe("1005000");
  });

  it("補完結果が現在ポイント以下なら次の桁上がりを採る", () => {
    // 現在 1,005,000 に対し 3000 → 1,003,000 は現在以下なので 1,013,000
    expect(completeTargetSuffix("1,005,000", "3000")).toBe("1013000");
  });

  it("等しくなる場合も次の桁上がりを採る", () => {
    // 補完結果がちょうど現在ポイントに一致 → 一つ上へ
    expect(completeTargetSuffix("128,311,005", "311005")).toBe("129311005");
  });

  it("フル桁で入力したときは補完しない（勝手に書き換えない）", () => {
    expect(completeTargetSuffix("1,000,000", "1200000")).toBeNull();
    expect(completeTargetSuffix("1,000,000", "9999999")).toBeNull();
  });

  it("現在・目標のどちらかが空なら補完しない", () => {
    expect(completeTargetSuffix("", "5000")).toBeNull();
    expect(completeTargetSuffix("1,000,000", "")).toBeNull();
  });

  it("数値でない入力は補完しない", () => {
    expect(completeTargetSuffix("abc", "5000")).toBeNull();
    expect(completeTargetSuffix("1,000,000", "xy")).toBeNull();
  });
});
