import { describe, expect, it } from "vitest";
import { parseMotionSetting, readMotionSetting } from "./settingsStore";
import { MOTION_SETTINGS } from "./plan";

describe("parseMotionSetting", () => {
  it("既知の設定値はそのまま通す", () => {
    for (const setting of MOTION_SETTINGS) {
      expect(parseMotionSetting(setting)).toBe(setting);
    }
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["数値", 1],
    ["配列", ["rich"]],
    ["オブジェクト", { level: "rich" }],
    ["未知の文字列", "ultra"],
    ["大文字", "RICH"],
    ["空文字", ""],
    ["JSONゴミ", '{"level":"rich"}'],
  ])("%s は既定(auto)に落とす", (_label, raw) => {
    expect(parseMotionSetting(raw)).toBe("auto");
  });
});

describe("readMotionSetting", () => {
  it("保存済みの値を読める", () => {
    const storage = { getItem: () => "subtle" };
    expect(readMotionSetting(storage)).toBe("subtle");
  });

  it("未保存なら既定(auto)", () => {
    const storage = { getItem: () => null };
    expect(readMotionSetting(storage)).toBe("auto");
  });

  it("storage が無くても既定(auto)を返す", () => {
    expect(readMotionSetting(undefined)).toBe("auto");
  });

  it("getItem が throw しても既定(auto)を返す（プライベートモード）", () => {
    const storage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readMotionSetting(storage)).toBe("auto");
  });
});
