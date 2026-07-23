import { describe, expect, it } from "vitest";
import { FULL_POWER_BAND_MARGIN, scoreBandBadge } from "./scoreBandBadge";
import { DEFAULT_MAX_SCORE, SCORE_STEP, maxScoreNOf } from "./constants";

/**
 * スコア帯の実行難易度バッジ（P1-4、弱点5で「全力」範囲を見直し）の安全網。
 *
 * ブリーフの3値（放置・全力・狙い撃ち）を、SCORE_STEP・maxScoreNOf という
 * 既存の定数導出＋ FULL_POWER_BAND_MARGIN（提示ポリシー定数）だけで
 * 判定できることを固定する（マジックナンバーの散在禁止）。
 */
describe("scoreBandBadge", () => {
  it("minScore 0（帯 0〜19,999）は放置", () => {
    expect(scoreBandBadge({ minScore: 0 }, DEFAULT_MAX_SCORE)).toBe("放置");
  });

  it("ユーザー設定のスコア上限が属する帯（最上帯）は全力", () => {
    const topN = maxScoreNOf(DEFAULT_MAX_SCORE);
    expect(scoreBandBadge({ minScore: topN * SCORE_STEP }, DEFAULT_MAX_SCORE)).toBe("全力");
    // 上限の帯を超える（探索上は起こらないが、防御的に境界より上でも全力のままとする）
    expect(scoreBandBadge({ minScore: (topN + 1) * SCORE_STEP }, DEFAULT_MAX_SCORE)).toBe("全力");
  });

  it("弱点5の解消: 最上帯のすぐ下（マージン1帯）も全力", () => {
    // 実測例: 上限110万のとき帯 1,080,000〜1,099,999。ここは実質全力プレイが要るのに
    // 最上帯限定の旧実装では「狙い撃ち」になっていた。
    const topN = maxScoreNOf(DEFAULT_MAX_SCORE);
    expect(FULL_POWER_BAND_MARGIN).toBe(1);
    expect(scoreBandBadge({ minScore: (topN - FULL_POWER_BAND_MARGIN) * SCORE_STEP }, DEFAULT_MAX_SCORE)).toBe(
      "全力"
    );
    expect((topN - 1) * SCORE_STEP).toBe(1_080_000);
  });

  it("放置でも全力でもない中間帯は狙い撃ち（マージンの外側）", () => {
    const topN = maxScoreNOf(DEFAULT_MAX_SCORE);
    // ブリーフ実測例: スコア 700,000〜719,999（bonus990%・80,527Pt ケースの副ユニット）
    expect(scoreBandBadge({ minScore: 700_000 }, DEFAULT_MAX_SCORE)).toBe("狙い撃ち");
    expect(topN * SCORE_STEP).toBeGreaterThan(700_000); // このケースが中間帯である前提の裏取り
    // マージンのすぐ外（topN - margin - 1）は狙い撃ちのまま
    expect(
      scoreBandBadge({ minScore: (topN - FULL_POWER_BAND_MARGIN - 1) * SCORE_STEP }, DEFAULT_MAX_SCORE)
    ).toBe("狙い撃ち");
  });

  it("スコア上限を変えると全力/狙い撃ちの境界が動く（動的計算であることの担保）", () => {
    const lowCap = SCORE_STEP * 3; // 上限が低いユーザー設定
    const topN = maxScoreNOf(lowCap);
    expect(scoreBandBadge({ minScore: topN * SCORE_STEP }, lowCap)).toBe("全力");
    expect(scoreBandBadge({ minScore: (topN - FULL_POWER_BAND_MARGIN) * SCORE_STEP }, lowCap)).toBe("全力");
    expect(scoreBandBadge({ minScore: (topN - FULL_POWER_BAND_MARGIN - 1) * SCORE_STEP }, lowCap)).toBe(
      "狙い撃ち"
    );
  });

  it("上限設定自体が最小帯（放置帯）のときも矛盾なく判定する", () => {
    // スコア上限がSCORE_STEP未満に丸められるような極端な設定でも、
    // 放置帯の判定（minScore<=0）が全力判定より先に効く。
    expect(scoreBandBadge({ minScore: 0 }, SCORE_STEP)).toBe("放置");
  });
});
