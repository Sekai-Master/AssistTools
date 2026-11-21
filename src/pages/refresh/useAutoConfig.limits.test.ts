/**
 * @vitest-environment jsdom
 *
 * 休憩中オートの焚き数と「今日すでに回した回数」を、ゲームの決まりに収める（2026-11-21 Nori 指摘）。
 *
 * ★ オートは 0 焚きができない（下限 1）。保存したプランに 0 が残っていても 1 として扱う。
 * ★ 今日すでに回した回数は、カラフルパスの 1 日の上限（なし／BASIC と DELUXE は 10、PRECIOUS は 99）を超えない。
 *   パスを下げたら上限に収める。プランの呼び出しは「パス → 回数」の順に同じ描画の中で入れるので、
 *   回数を古いパスの上限で切らない（PRECIOUS の 50 回が 10 回になる、にしない）。
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoConfig } from "./useAutoConfig";

// オートを使っていない（楽曲データを読みに行かない）状態で、入力の持ち方だけを見る
const useConfig = () => useAutoConfig({ enabled: false, power: 0, bonus: 0 });

describe("オートの焚き数は 1 から", () => {
  it("0 を入れても（保存したプランの 0 も）1 として持ち、計算にも 1 を渡す", () => {
    const { result } = renderHook(useConfig);
    act(() => result.current.setTaki(0));
    expect(result.current.taki).toBe(1);
    expect(result.current.runtime.taki).toBe(1);
  });
});

describe("今日すでに回した回数は 1 日の上限まで", () => {
  it("上限を超えた値は上限で持つ（なし／BASIC は 10）", () => {
    const { result } = renderHook(useConfig);
    act(() => result.current.setUsedToday("150"));
    expect(result.current.usedToday).toBe("10");
    expect(result.current.runtime.usedToday).toBe(10);
  });

  it("プランの呼び出し（パスと回数を同時に入れる）では新しいパスの上限で見る。パスを下げたら収める", () => {
    const { result } = renderHook(useConfig);
    act(() => {
      result.current.setCourse("precious");
      result.current.setUsedToday("50");
    });
    expect(result.current.usedToday).toBe("50");
    expect(result.current.runtime.usedToday).toBe(50);
    act(() => result.current.setCourse("none"));
    expect(result.current.usedToday).toBe("10");
    expect(result.current.runtime.usedToday).toBe(10);
  });
});
