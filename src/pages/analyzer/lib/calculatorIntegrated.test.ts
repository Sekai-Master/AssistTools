import { describe, expect, it } from "vitest";
import { ENVY_ID, calculatePlanV6, type MusicData } from "./calculator";

/**
 * integrated 経路（R5 / docs §2・§3）の安全網。
 *
 * 守るべき性質:
 *   1. options.integrated を渡さないレガシー経路は従来どおり（appliedReserve なし・
 *      ON では multi undefined）。凍結ゴールデンは calculator.test.ts が担保するので、
 *      ここでは「integrated を足しても省略時の結果が変わらない」ことだけ確認する。
 *   2. integrated では ON/OFF に関わらず A（adjustmentPlans）と B（multi）を両方計算する。
 *   3. 合成 status は A∨B。isVerified 時は恒等式が保たれる。
 *   4. ON の integrated は appliedReserve を動的確保額として載せる。
 */

const ENVY_MUSICS: MusicData[] = [
  { id: ENVY_ID, basePoint: 100 },
  { id: "melt", basePoint: 130 },
];
const INTEGRATED = { integrated: { step2ABase: 100 } } as const;

describe("integrated — レガシー経路の不変", () => {
  it("省略時と { integrated } 無しは同一（integrated は opt-in）", () => {
    const args = [1_000_000, 1_101_005, 1005, 380_470, 990, false, ENVY_ID, ENVY_MUSICS] as const;
    const legacyOff = calculatePlanV6(...args, { useMySekai: false });
    // integrated を渡さない限り appliedReserve は付かない
    expect(legacyOff.mySekaiAllocation.appliedReserve).toBeUndefined();
    const legacyOn = calculatePlanV6(...args);
    expect(legacyOn.liveAdjustment.multi).toBeUndefined();
    expect(legacyOn.mySekaiAllocation.appliedReserve).toBeUndefined();
  });

  it("レガシー経路では multiAKeep キー自体が存在しない（凍結ゴールデン形状の維持）", () => {
    const args = [1_000_000, 1_101_005, 1005, 380_470, 990, false, ENVY_ID, ENVY_MUSICS] as const;
    // 条件付きスプレッドなので undefined ではなく「キー欠如」を確認する
    expect("multiAKeep" in calculatePlanV6(...args).liveAdjustment).toBe(false);
    expect(
      "multiAKeep" in calculatePlanV6(...args, { useMySekai: false }).liveAdjustment
    ).toBe(false);
  });
});

describe("integrated — A/B 両方の計算と合成status", () => {
  it("ON: multi(B) と adjustmentPlans(A) が両方載り、appliedReserve が付く", () => {
    const r = calculatePlanV6(
      1_000_000,
      1_100_000,
      0,
      380_470,
      990,
      true,
      ENVY_ID,
      ENVY_MUSICS,
      INTEGRATED
    );
    // B は ON でも必ず計算される
    expect(r.liveAdjustment.multi).toBeDefined();
    // A（曲固定・ボーナス掃引）の結果も同居する
    expect(r.liveAdjustment.adjustmentPlans).toBeDefined();
    // モードA複数回化（現ボーナス固定）の結果も載る（R6 §1-3）
    expect(r.liveAdjustment.multiA).toBeDefined();
    expect(r.liveAdjustment.multiAKeep).toBeDefined();
    // 動的確保額が載る
    expect(typeof r.mySekaiAllocation.appliedReserve).toBe("number");
    expect(r.mySekaiAllocation.appliedReserve!).toBeGreaterThan(0);
  });

  it("ON: 着地したとき恒等式 現在+マイセカイ+調整+ラストプレイ = 目標", () => {
    for (const diff of [80_000, 130_000, 250_000, 470_000]) {
      const r = calculatePlanV6(
        1_000_000,
        1_000_000 + diff,
        0,
        380_470,
        990,
        true,
        ENVY_ID,
        ENVY_MUSICS,
        INTEGRATED
      );
      expect(r.isVerified).toBe(true);
      expect(
        r.currentPt + r.mySekaiAllocation.totalPt + r.liveAdjustment.requiredPt + r.finalRunPt
      ).toBe(r.targetPt);
      // Step2 が着地不能域に落ちていない（取りすぎ防止の効き）
      expect(r.liveAdjustment.status).toBe("OK");
    }
  }, 30_000);

  it("合成status は A∨B: B が解けているなら status OK", () => {
    const r = calculatePlanV6(
      1_000_000,
      2_000_000,
      0,
      380_470,
      990,
      true,
      ENVY_ID,
      ENVY_MUSICS,
      INTEGRATED
    );
    const multiOk = r.liveAdjustment.multi?.status === "OK";
    if (multiOk) expect(r.liveAdjustment.status).toBe("OK");
  });

  it("OFF integrated: multi は計算されるが appliedReserve は付かない（動的確保はON専用）", () => {
    const r = calculatePlanV6(
      1_000_000,
      1_470_000,
      0,
      380_470,
      990,
      true,
      ENVY_ID,
      ENVY_MUSICS,
      { useMySekai: false, integrated: { step2ABase: 100 } }
    );
    expect(r.mySekaiAllocation.totalPt).toBe(0);
    expect(r.mySekaiAllocation.appliedReserve).toBeUndefined();
    expect(r.liveAdjustment.multi).toBeDefined();
    // OFF は差分すべてが Step2 残額
    expect(r.liveAdjustment.requiredPt).toBe(r.adjustableDiff);
  });
});
