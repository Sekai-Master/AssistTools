import { describe, expect, it } from "vitest";
import { planScoreZeroFinish } from "./scoreZeroFinish";
import { scoreBandBadge } from "./scoreBandBadge";
import { calcLivePt } from "./calcLivePt";
import { DEFAULT_MAX_SCORE, MAX_LIVE_BONUS, SCORE_STEP } from "./constants";
import { buildReachablePtTable, planFromReachablePtTable } from "./multiLiveAdjust";

/**
 * planScoreZeroFinish（スコア0イベ乙）の安全網。
 * 仕様: docs/point-adjust-score-zero-finish.md
 *
 * 守るべき性質:
 *   1. 締めの値は calcLivePt(基礎点, bonus, 0, LB) から導出（ハードコード禁止）
 *   2. full.totalPt が liveRequired と厳密一致する
 *   3. liveRequired<=0 は成立しない（締めが必ず正のPtを生むため）
 *   4. 残額が締め値そのものなら regular が0本の空プラン
 */
const BONUS = 990;
const REAL_BASES = [100, 103, 114, 116, 130] as const;

describe("planScoreZeroFinish — 締めの値の導出（ハードコード禁止）", () => {
  it("bonus990%・base100・LB0の締め値は1,090（ドキュメントの実測値と一致）", () => {
    expect(calcLivePt(100, BONUS, 0, 0)).toBe(1_090);
  });

  it("残額が締め値ちょうど（1,090）なら regular は0本、liveCount=1", () => {
    const r = planScoreZeroFinish(1_090, BONUS, [100, 130]);
    expect(r.status).toBe("OK");
    expect(r.plan!.regular).toEqual({ units: [], liveCount: 0, lbCost: 0, totalPt: 0 });
    expect(r.plan!.finish.pt).toBe(1_090);
    expect(r.plan!.finish.basePoint).toBe(100);
    expect(r.plan!.finish.liveBonus).toBe(0);
    expect(r.plan!.full.liveCount).toBe(1);
    expect(r.plan!.full.totalPt).toBe(1_090);
  });

  it("LBを上げると締め値が上がる（ドキュメント記載の1,090/5,450/10,900/16,350系列）", () => {
    const base = 100;
    expect(calcLivePt(base, BONUS, 0, 0)).toBe(1_090);
    expect(calcLivePt(base, BONUS, 0, 1)).toBe(5_450);
    expect(calcLivePt(base, BONUS, 0, 2)).toBe(10_900);
    expect(calcLivePt(base, BONUS, 0, 3)).toBe(16_350);
  });

  it("締めの基礎点・LBが変われば calcLivePt から再計算される（式からの導出であることの確認）", () => {
    for (const base of [100, 114, 130]) {
      for (let lb = 0; lb <= MAX_LIVE_BONUS; lb += 1) {
        const req = calcLivePt(base, BONUS, 0, lb) + 1; // ちょうどの1本上乗せで単発解を作る
        const r = planScoreZeroFinish(req, BONUS, [base]);
        if (r.status !== "OK") continue; // 残りが1Ptで解けない組合せは対象外
        expect(r.plan!.finish.pt).toBe(calcLivePt(r.plan!.finish.basePoint, BONUS, 0, r.plan!.finish.liveBonus));
      }
    }
  });
});

describe("planScoreZeroFinish — 厳密一致とプラン整合性", () => {
  it.each([7_000, 12_345, 25_000, 60_000, 100_000])(
    "残額 %i Pt は通常探索+締め1本で厳密着地する（ドキュメントの被覆域）",
    (req) => {
      const r = planScoreZeroFinish(req, BONUS, REAL_BASES);
      expect(r.status).toBe("OK");
      const plan = r.plan!;
      expect(plan.full.totalPt).toBe(req);
      expect(plan.full.liveCount).toBe(plan.regular.liveCount + 1);
      expect(plan.full.lbCost).toBe(plan.regular.lbCost + plan.finish.liveBonus);
      // full.units は regular.units + finish の連結
      expect(plan.full.units).toEqual([...plan.regular.units, plan.finish]);
      // 締めユニット自体の整合性
      expect(plan.finish.count).toBe(1);
      expect(plan.finish.minScore).toBe(0);
      expect(plan.finish.maxScore).toBe(SCORE_STEP - 1);
      expect(plan.finish.pt).toBe(calcLivePt(plan.finish.basePoint, BONUS, 0, plan.finish.liveBonus));
      // regular 側も厳密一致（通常探索の既存保証を継承していることの確認）
      const regularSum = plan.regular.units.reduce((s, u) => s + u.pt * u.count, 0);
      expect(regularSum).toBe(plan.regular.totalPt);
      expect(plan.regular.totalPt + plan.finish.pt).toBe(req);
    }
  );

  it("締めユニットは scoreBandBadge で必ず「放置」になる（スコア0固定の整合性）", () => {
    const r = planScoreZeroFinish(25_000, BONUS, REAL_BASES);
    expect(r.status).toBe("OK");
    expect(scoreBandBadge(r.plan!.finish, DEFAULT_MAX_SCORE)).toBe("放置");
  });

  it("総本数が最小になる締め候補を選ぶ（総本数→総LBの優先順位）", () => {
    // liveRequired を締めLB1のちょうどの値にすると「締め1本のみ」(liveCount=1) が
    // 作れる。締めLB0を使って残り1本を別途探索する2本構成も存在しうるが、
    // 本数が少ない方（1本）が優先されるべきケース。
    const finishLb1 = calcLivePt(100, BONUS, 0, 1);
    const r = planScoreZeroFinish(finishLb1, BONUS, [100]);
    expect(r.status).toBe("OK");
    expect(r.plan!.full.liveCount).toBe(1);
    expect(r.plan!.finish.liveBonus).toBe(1);
    expect(r.plan!.finish.pt).toBe(finishLb1);
  });
});

describe("planScoreZeroFinish — 境界（liveRequired<=0・締め値未満）", () => {
  it("liveRequired が0のときは NG（締めた瞬間に超過するため成立しない）", () => {
    const r = planScoreZeroFinish(0, BONUS, REAL_BASES);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("NO_EXACT");
  });

  it("負の liveRequired は NG", () => {
    const r = planScoreZeroFinish(-500, BONUS, REAL_BASES);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("NO_EXACT");
  });

  it("最小の締め値未満の残額は NG（どの締めもオーバーするため候補が0件）", () => {
    const minFinish = calcLivePt(100, BONUS, 0, 0); // 1,090
    const r = planScoreZeroFinish(minFinish - 1, BONUS, [100]);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("NO_EXACT");
  });

  it("NaN/Infinity は NG（無効入力を成立させない）", () => {
    expect(planScoreZeroFinish(NaN, BONUS, REAL_BASES).status).toBe("NG");
    expect(planScoreZeroFinish(Infinity, BONUS, REAL_BASES).status).toBe("NG");
  });
});

describe("planScoreZeroFinish — basePoints の既定退避", () => {
  it("basePoints が空なら既定基礎点100に退避する", () => {
    const req = calcLivePt(100, BONUS, 0, 0);
    const r = planScoreZeroFinish(req, BONUS, []);
    expect(r.status).toBe("OK");
    expect(r.plan!.finish.basePoint).toBe(100);
  });
});

/**
 * 現実的な基礎点セット（28種）でも壊れないことの確認（1回だけの重い呼び出し）。
 * ループでの多点走査はしない（各呼び出しが基礎点×LB通りの通常探索を伴うため）。
 */
describe("planScoreZeroFinish — 実データ規模の基礎点セット", () => {
  const BRIEF_BASES = [
    100, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
    121, 122, 123, 124, 125, 126, 127, 128, 130,
  ] as const;

  it(
    "28基礎点・残額52,437Ptでも厳密着地する",
    () => {
      const req = 52_437;
      const r = planScoreZeroFinish(req, BONUS, BRIEF_BASES);
      expect(r.status).toBe("OK");
      expect(r.plan!.full.totalPt).toBe(req);
      expect(r.plan!.finish.pt).toBe(
        calcLivePt(r.plan!.finish.basePoint, BONUS, 0, r.plan!.finish.liveBonus)
      );
    },
    30_000
  );
});

/**
 * 弱点3対応: 到達可能Pt表の使い回し最適化が結果を変えていないことの固定。
 *
 * planScoreZeroFinish 内部の実装（buildReachablePtTable を1回だけ構築して
 * 締め候補全員で使い回す）とは完全に独立に、「表を候補ごとに毎回作り直す」
 * 素朴な再実装をオラクルとして用意し、実データ規模で突き合わせる。
 * 一致すれば、最適化（表の共有）が探索結果を1件も変えていないことの
 * 直接証拠になる。
 */
describe("planScoreZeroFinish — 最適化（表の使い回し）が結果を変えないことの固定（弱点3）", () => {
  const BRIEF_BASES = [
    100, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
    121, 122, 123, 124, 125, 126, 127, 128, 130,
  ] as const;

  /** planScoreZeroFinish と同じアルゴリズムを、表の使い回しを一切せずに再実装したオラクル。 */
  function naiveScoreZeroFinish(liveRequired: number, bonus: number, basePoints: readonly number[]) {
    if (!Number.isFinite(liveRequired) || liveRequired <= 0) return null;
    const bases = basePoints.length > 0 ? basePoints : [100];
    const finishByPt = new Map<number, { basePoint: number; liveBonus: number }>();
    for (const basePoint of bases) {
      for (let liveBonus = 0; liveBonus <= MAX_LIVE_BONUS; liveBonus += 1) {
        const pt = calcLivePt(basePoint, bonus, 0, liveBonus);
        if (pt <= 0 || pt > liveRequired) continue;
        const existing = finishByPt.get(pt);
        const better =
          !existing ||
          liveBonus < existing.liveBonus ||
          (liveBonus === existing.liveBonus && basePoint < existing.basePoint);
        if (better) finishByPt.set(pt, { basePoint, liveBonus });
      }
    }
    let best: { liveCount: number; lbCost: number; finishPt: number } | null = null;
    for (const [pt, finish] of finishByPt) {
      const remaining = liveRequired - pt;
      // 表を使い回さず、候補ごとに毎回新しい表を構築する（最適化前と同じ経路）。
      const table = buildReachablePtTable(bonus, bases);
      const r = planFromReachablePtTable(remaining, table);
      if (r.status !== "OK") continue;
      const regular = r.plans[0] ?? { liveCount: 0, lbCost: 0 };
      const liveCount = regular.liveCount + 1;
      const lbCost = regular.lbCost + finish.liveBonus;
      if (best && (liveCount > best.liveCount || (liveCount === best.liveCount && lbCost >= best.lbCost))) {
        continue;
      }
      best = { liveCount, lbCost, finishPt: pt };
    }
    return best;
  }

  it.each([7_000, 12_345, 25_000, 60_000, 100_000, 52_437, 199_999])(
    "残額 %i Pt は最適化版・素朴再実装のどちらも同じ本数・LB・締め値を返す",
    (req) => {
      const optimized = planScoreZeroFinish(req, 990, BRIEF_BASES);
      const naive = naiveScoreZeroFinish(req, 990, BRIEF_BASES);
      expect(optimized.status).toBe(naive ? "OK" : "NG");
      if (optimized.status === "OK" && naive) {
        expect(optimized.plan!.full.liveCount).toBe(naive.liveCount);
        expect(optimized.plan!.full.lbCost).toBe(naive.lbCost);
        expect(optimized.plan!.finish.pt).toBe(naive.finishPt);
      }
    },
    30_000
  );
});
