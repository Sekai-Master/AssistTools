import { describe, expect, it } from "vitest";
import { scoreBandBadge } from "./scoreBandBadge";
import { SCORE_STEP } from "./constants";

/**
 * スコア帯バッジ（R5 で2値化）の安全網。
 *
 * 「全力」を廃したので判定は minScore 一つだけに依存する（maxScore 引数は削除）。
 * 境界（minScore=0 は放置 / minScore=SCORE_STEP は狙い撃ち）を凍結する。
 */
describe("scoreBandBadge", () => {
  it("minScore 0（帯 0〜19,999）は放置", () => {
    expect(scoreBandBadge({ minScore: 0 })).toBe("放置");
  });

  it("負の minScore も放置（<=0 判定の防御）", () => {
    expect(scoreBandBadge({ minScore: -1 })).toBe("放置");
  });

  it("最小の非ゼロ帯（minScore=SCORE_STEP）は狙い撃ち", () => {
    expect(scoreBandBadge({ minScore: SCORE_STEP })).toBe("狙い撃ち");
  });

  it("中間帯・上限付近はいずれも狙い撃ち（全力の廃止）", () => {
    // 旧実装で「全力」だった上限付近も、2値化後はすべて狙い撃ちに畳まれる。
    expect(scoreBandBadge({ minScore: 700_000 })).toBe("狙い撃ち");
    expect(scoreBandBadge({ minScore: 1_080_000 })).toBe("狙い撃ち");
    expect(scoreBandBadge({ minScore: 1_100_000 })).toBe("狙い撃ち");
  });
});
