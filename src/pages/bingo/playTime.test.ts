import { describe, expect, it } from "vitest";
import { ODAI_LEVELS, ODAI_LEVEL_KEYS } from "./odaiLogic";
import { playTimeText } from "./playTime";

describe("playTimeText（曲数 → 遊ぶ時間の目安）", () => {
  it("1 曲 4 分として 10 分単位に丸める", () => {
    expect(playTimeText(8)).toBe("約30分");
    expect(playTimeText(15)).toBe("約1時間");
    expect(playTimeText(20)).toBe("約1時間20分");
    expect(playTimeText(30)).toBe("約2時間");
    expect(playTimeText(45)).toBe("約3時間");
    expect(playTimeText(75)).toBe("約5時間");
  });

  it("短くても 10 分より下にはしない", () => {
    expect(playTimeText(1)).toBe("約10分");
  });

  it("難易度ごとの時間はすべて違う（段の見分けがつく）", () => {
    const texts = ODAI_LEVEL_KEYS.map((k) => playTimeText(ODAI_LEVELS[k].songs));
    expect(new Set(texts).size).toBe(texts.length);
  });
});
