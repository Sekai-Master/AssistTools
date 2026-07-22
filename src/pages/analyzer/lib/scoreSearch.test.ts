import { describe, expect, it } from "vitest";
import { collectScorePlans, findScoreStep } from "./scoreSearch";
import { calcLivePt } from "./calcLivePt";
import { SCORE_STEP } from "./constants";

describe("findScoreStep", () => {
  it("target になる最初のスコア帯Nを返す", () => {
    // base=100, bonus=0, lb=0, score=0 → 100 Pt。よって target=100 は N=0。
    expect(findScoreStep(100, 0, 0, 100)).toBe(0);
  });

  it("見つからなければ -1", () => {
    // 最小100なので50は存在しない。
    expect(findScoreStep(100, 0, 0, 50)).toBe(-1);
  });

  it("返したNのスコア帯で実際に target になる", () => {
    const target = 150;
    const n = findScoreStep(100, 0, 0, target);
    if (n !== -1) {
      expect(calcLivePt(100, 0, n * SCORE_STEP, 0)).toBe(target);
    }
  });
});

describe("collectScorePlans", () => {
  it("target になる組み合わせをすべて挙げ、各プランが実際に成立する", () => {
    const plans = collectScorePlans({
      base: 100,
      target: 100,
      liveBonuses: [0, 1],
      bonusMax10x: 100,
      bonusStep10x: 5,
      bonusOuter: false,
    });
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      expect(calcLivePt(100, p.bonus, p.minScore, p.liveBonus)).toBe(100);
    }
  });

  it("bonusOuter でpush順が変わる（提示順の互換性の担保）", () => {
    const opts = {
      base: 100,
      target: 500,
      liveBonuses: [0, 1],
      bonusMax10x: 200,
      bonusStep10x: 5,
    };
    const bonusFirst = collectScorePlans({ ...opts, bonusOuter: true });
    const lbFirst = collectScorePlans({ ...opts, bonusOuter: false });
    // 中身（集合）は同じだが、並びは異なりうる。
    expect([...bonusFirst].sort(cmp)).toEqual([...lbFirst].sort(cmp));
  });

  it("pruneByMultiplier は結果を変えない（枝刈りの健全性）", () => {
    const opts = {
      base: 100,
      target: 500,
      liveBonuses: [0, 1, 2, 5],
      bonusMax10x: 300,
      bonusStep10x: 5,
      bonusOuter: true,
    };
    const pruned = collectScorePlans({ ...opts, pruneByMultiplier: true });
    const full = collectScorePlans({ ...opts, pruneByMultiplier: false });
    expect(pruned).toEqual(full);
  });
});

function cmp(
  a: { liveBonus: number; bonus: number; minScore: number },
  b: { liveBonus: number; bonus: number; minScore: number }
): number {
  return a.liveBonus - b.liveBonus || a.bonus - b.bonus || a.minScore - b.minScore;
}
