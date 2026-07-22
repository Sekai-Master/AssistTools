import { describe, expect, it } from "vitest";
import { byBonusDesc, byDistanceTo, recommendPlans } from "./recommendPlans";

const p = (bonus: number, minScore = 0) => ({ bonus, minScore });

describe("recommendPlans", () => {
  it("25%刻み → 5%刻み → その他 の順に選ぶ", () => {
    const plans = [p(3), p(5), p(25), p(10), p(50)];
    expect(recommendPlans(plans, byBonusDesc).map((x) => x.bonus)).toEqual([50, 25, 10, 5]);
  });

  it("0.5%刻みのプランしか無くても、おすすめが空にならない", () => {
    // 整数刻み前提の実装ではここが空配列になり、
    // 「プランはあるのにおすすめが1件も出ない」状態になっていた
    const plans = [p(12.5), p(17.5), p(2.5)];
    expect(recommendPlans(plans, byBonusDesc).map((x) => x.bonus)).toEqual([17.5, 12.5, 2.5]);
  });

  it("グループをまたいでも件数の上限を守る", () => {
    const plans = [p(25), p(50), p(75), p(100), p(5), p(1.5)];
    expect(recommendPlans(plans, byBonusDesc)).toHaveLength(4);
    expect(recommendPlans(plans, byBonusDesc, 6)).toHaveLength(6);
  });

  it("同じグループ内では入力ボーナスに近い順に並ぶ", () => {
    // 25/50/100 はいずれも25%刻みなので同一グループ。60 からの距離は 50<25<100
    const plans = [p(25), p(100), p(50)];
    expect(recommendPlans(plans, byDistanceTo(60)).map((x) => x.bonus)).toEqual([50, 25, 100]);
  });

  it("距離が近くてもグループの優先度が勝つ", () => {
    // 62.5 のほうが 60 に近いが、25%刻みの 50 が先に来る
    const plans = [p(62.5), p(50)];
    expect(recommendPlans(plans, byDistanceTo(60)).map((x) => x.bonus)).toEqual([50, 62.5]);
  });

  it("元の配列を破壊しない", () => {
    const plans = [p(5), p(25), p(50)];
    const snapshot = plans.map((x) => x.bonus);
    recommendPlans(plans, byBonusDesc);
    expect(plans.map((x) => x.bonus)).toEqual(snapshot);
  });

  it("空配列でも落ちない", () => {
    expect(recommendPlans([], byBonusDesc)).toEqual([]);
  });

  it("ボーナスが同じなら必要スコアが低い順に並ぶ", () => {
    // タイブレークが無いと Array.prototype.sort の安定性により push 順が残り、
    // push 順は消費ライブボーナスの昇順（＝必要スコアが高い順）なので、
    // 「1個多く炊けば低いスコアで済む案」が下に隠れてしまう。
    const plans = [p(400, 2_020_000), p(400, 0), p(400, 500_000)];
    expect(recommendPlans(plans, byBonusDesc).map((x) => x.minScore)).toEqual([
      0, 500_000, 2_020_000,
    ]);
    expect(recommendPlans(plans, byDistanceTo(435)).map((x) => x.minScore)).toEqual([
      0, 500_000, 2_020_000,
    ]);
  });

  it("スコアのタイブレークはグループ優先度を覆さない", () => {
    const plans = [p(400, 2_000_000), p(402.5, 0)];
    expect(recommendPlans(plans, byBonusDesc).map((x) => x.bonus)).toEqual([400, 402.5]);
  });
});
