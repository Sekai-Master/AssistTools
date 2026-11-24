import { describe, expect, it } from "vitest";
import { pickEventItemReduction } from "./badgeConfig.mjs";

// 並びと項目名はマスタ（Sekai-World/sekai-master-db-diff の configs.json、2026-11-24 取得）のまま
const row = (configKey, value) => ({ configKey, value });
const CONFIGS = [
  row("date_change_hour", "4"),
  row("virtual_item_reduction", "0.01"),
  row("event_item_reduction", "7"),
  row("world_bloom_support_deck_event_item_correction_value", "0.5"),
];

describe("pickEventItemReduction — configs.json から除数を取り出す", () => {
  it("event_item_reduction の文字列を数にする（2026-11-19 から \"7\"）", () => {
    expect(pickEventItemReduction(CONFIGS)).toBe(7);
  });

  it("似た名前の virtual_item_reduction と取り違えない", () => {
    expect(pickEventItemReduction([row("virtual_item_reduction", "0.01")])).toBeNull();
  });

  it("10 に戻っても拾う", () => {
    expect(pickEventItemReduction([row("event_item_reduction", "10")])).toBe(10);
  });

  it.each([
    ["数でない", "abc"],
    ["空文字", ""],
    ["0", "0"],
    ["負の数", "-7"],
    ["null", null],
  ])("値が壊れている（%s）なら null", (_label, value) => {
    expect(pickEventItemReduction([row("event_item_reduction", value)])).toBeNull();
  });

  it("行が無い・配列でないなら null", () => {
    expect(pickEventItemReduction([row("date_change_hour", "4")])).toBeNull();
    expect(pickEventItemReduction([null, row("event_item_reduction", "7")])).toBe(7);
    expect(pickEventItemReduction({ event_item_reduction: "7" })).toBeNull();
    expect(pickEventItemReduction(null)).toBeNull();
  });
});
