import { describe, expect, it } from "vitest";
import {
  ADJUST_LIVE_OVERHEAD_SEC,
  DEFAULT_MAX_SCORE,
  DEFAULT_MAX_SCORE_N,
  MAX_SCORE_CLIP,
  MAX_SCORE_N,
  SCORE_STEP,
  maxScoreNOf,
  normalizeMaxScore,
} from "./constants";

/**
 * スコア上限まわり（R3-0）の安全網。
 *
 * normalizeMaxScore はユーザー入力（環境設定パネル）とロジックの境界なので、
 * 不正値の落とし先（既定値・クリップ・下限底上げ）を1つずつ凍結する。
 * ここが緩むと「400万点のソロライブを6回」のような実行不能プランが
 * 検証済みとして復活する。
 */

describe("normalizeMaxScore", () => {
  it("未指定・非数・0以下は既定値 1,100,000 に落ちる", () => {
    expect(normalizeMaxScore(undefined)).toBe(DEFAULT_MAX_SCORE);
    expect(normalizeMaxScore(NaN)).toBe(DEFAULT_MAX_SCORE);
    expect(normalizeMaxScore(Infinity)).toBe(DEFAULT_MAX_SCORE);
    expect(normalizeMaxScore(-Infinity)).toBe(DEFAULT_MAX_SCORE);
    expect(normalizeMaxScore(0)).toBe(DEFAULT_MAX_SCORE);
    expect(normalizeMaxScore(-1)).toBe(DEFAULT_MAX_SCORE);
    expect(normalizeMaxScore(-1_100_000)).toBe(DEFAULT_MAX_SCORE);
  });

  it("既定値そのものは素通しになる", () => {
    expect(normalizeMaxScore(DEFAULT_MAX_SCORE)).toBe(DEFAULT_MAX_SCORE);
  });

  it("過大値は 3,000,000 にクリップされる（桁ミス対策の安全弁）", () => {
    expect(normalizeMaxScore(30_000_000)).toBe(MAX_SCORE_CLIP);
    expect(normalizeMaxScore(MAX_SCORE_CLIP + 1)).toBe(MAX_SCORE_CLIP);
    expect(normalizeMaxScore(MAX_SCORE_CLIP)).toBe(MAX_SCORE_CLIP);
  });

  it("SCORE_STEP 未満は SCORE_STEP に底上げされる（スコア帯ゼロ探索の防止）", () => {
    expect(normalizeMaxScore(1)).toBe(SCORE_STEP);
    expect(normalizeMaxScore(SCORE_STEP - 1)).toBe(SCORE_STEP);
    expect(normalizeMaxScore(SCORE_STEP)).toBe(SCORE_STEP);
  });

  it("小数は floor される", () => {
    expect(normalizeMaxScore(1_234_567.9)).toBe(1_234_567);
    expect(normalizeMaxScore(SCORE_STEP + 0.5)).toBe(SCORE_STEP);
  });
});

describe("maxScoreNOf", () => {
  it("既定 1,100,000 は N=55、クリップ値 3,000,000 は N=150 になる", () => {
    // N のスコア帯は [N*STEP, (N+1)*STEP-1] なので、上限ちょうどが下端の帯まで許す
    expect(maxScoreNOf(1_100_000)).toBe(55);
    expect(maxScoreNOf(3_000_000)).toBe(150);
  });

  it("DEFAULT_MAX_SCORE_N は既定スコア上限から導出された 55", () => {
    expect(DEFAULT_MAX_SCORE_N).toBe(55);
    expect(DEFAULT_MAX_SCORE_N).toBe(maxScoreNOf(DEFAULT_MAX_SCORE));
  });

  it("帯の下端が上限以下になる N まで許す（floor）", () => {
    expect(maxScoreNOf(SCORE_STEP)).toBe(1);
    expect(maxScoreNOf(2 * SCORE_STEP - 1)).toBe(1);
    expect(maxScoreNOf(2 * SCORE_STEP)).toBe(2);
  });

  it("歴史的な絶対上限 MAX_SCORE_N(=200) を超えない", () => {
    // normalizeMaxScore を通さず巨大値を直接渡しても絶対上限で頭打ち
    expect(maxScoreNOf(100_000_000)).toBe(MAX_SCORE_N);
    expect(maxScoreNOf(MAX_SCORE_N * SCORE_STEP * 10)).toBe(MAX_SCORE_N);
  });
});

describe("ADJUST_LIVE_OVERHEAD_SEC", () => {
  it("実測値 47 秒で凍結されている", () => {
    // 所要時間表示（planDuration.ts）の基準。ここが黙って動くと
    // 「約N分」が全プランで一斉にズレるので、実測値そのものを固定する。
    expect(ADJUST_LIVE_OVERHEAD_SEC).toBe(47);
  });
});
