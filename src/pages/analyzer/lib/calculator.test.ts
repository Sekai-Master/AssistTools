import { describe, expect, it } from "vitest";
import {
  ENVY_ID,
  calculatePlanV6,
  calculateUnitBasePtEstimate,
  type MusicData,
} from "./calculator";

/**
 * トップレベル calculatePlanV6 の安全網。
 * ここに固定した恒等式・性質は「実装を整理しても着地が1ptも動かないこと」を保証する。
 *
 * 注記: 個々の式（calcLivePt / マイセカイ単価 / スコア探索 / 入力パース）は
 * それぞれ calcLivePt.test.ts, mySekai.test.ts, scoreSearch.test.ts,
 * inputParsing.test.ts が担保する。ここではそれらを束ねた計算全体の整合を見る。
 * プラン列挙の「本数」やログ文言は実装依存で脆いので、あえて固定しない。
 */

const ENVY_MUSICS: MusicData[] = [{ id: ENVY_ID, basePoint: 100 }];

describe("calculatePlanV6 — ゴールデン（リファクタで動かしてはいけない）", () => {
  const run = () =>
    calculatePlanV6(128_202_307, 128_311_005, 1005, 380_470, 435, true, ENVY_ID, ENVY_MUSICS);

  it("マイセカイ配分と単価", () => {
    const r = run();
    expect(r.unitBasePt).toBe(4500);
    expect(r.totalDiff).toBe(108_698);
    expect(r.adjustableDiff).toBe(107_693);
    expect(r.mySekaiAllocation).toEqual({ countA: 23, countB: 1, countC: 2, totalPt: 107_550 });
  });

  it("ライブ調整の必要ポイント", () => {
    const r = run();
    expect(r.liveAdjustment.status).toBe("OK");
    expect(r.liveAdjustment.requiredPt).toBe(143);
  });

  it("恒等式 現在Pt + マイセカイ + ライブ調整 + ラストラン = 目標Pt", () => {
    const r = run();
    expect(
      r.currentPt + r.mySekaiAllocation.totalPt + r.liveAdjustment.requiredPt + r.finalRunPt
    ).toBe(r.targetPt);
    expect(r.isVerified).toBe(true);
  });

  it("ワールドパス無しでも同じ着地になる（配分だけ変わる）", () => {
    const r = calculatePlanV6(
      128_202_307,
      128_311_005,
      1005,
      380_470,
      435,
      false,
      ENVY_ID,
      ENVY_MUSICS
    );
    expect(r.unitBasePt).toBe(900);
    expect(r.mySekaiAllocation.totalPt).toBe(107_550);
    expect(r.liveAdjustment.requiredPt).toBe(143);
    expect(r.isVerified).toBe(true);
  });

  it("探索上限はユーザーの現在ボーナス。それを超えるプランは出さない", () => {
    const r = calculatePlanV6(1_000_000, 1_001_005, 1005, 380_470, 120, false, ENVY_ID, ENVY_MUSICS);
    expect(r.finalRunPlans.every((p) => p.bonus <= 120)).toBe(true);
    expect(r.liveAdjustment.adjustmentPlans?.every((p) => p.bonus <= 120) ?? true).toBe(true);
  });

  it("ワールドリンク級の高ボーナスでも435%で打ち切られない", () => {
    const r = calculatePlanV6(1_000_000, 1_001_005, 1005, 380_470, 700, false, ENVY_ID, ENVY_MUSICS);
    expect(r.finalRunPlans.some((p) => p.bonus > 435)).toBe(true);
  });
});

describe("calculatePlanV6 — 基礎点の解決（ミューテーション検出）", () => {
  const musics: MusicData[] = [
    { id: "685", basePoint: 116 },
    { id: "144", basePoint: 114 },
  ];

  it("楽曲の基礎点が calculatePlanV6 まで届いている", () => {
    expect(
      calculatePlanV6(1_000_000, 1_120_005, 1005, 380_470, 416, false, "685", musics).finalBase
    ).toBe(116);
    expect(
      calculatePlanV6(1_000_000, 1_120_005, 1005, 380_470, 416, false, "144", musics).finalBase
    ).toBe(114);
    // 未知のIDは既定値100にフォールバック
    expect(
      calculatePlanV6(1_000_000, 1_120_005, 1005, 380_470, 416, false, "999", musics).finalBase
    ).toBe(100);
  });

  it("基礎点の違いがラストランのプランに反映される", () => {
    const a = calculatePlanV6(1_000_000, 1_120_005, 1005, 380_470, 416, false, "685", [
      { id: "685", basePoint: 116 },
    ]);
    const b = calculatePlanV6(1_000_000, 1_120_005, 1005, 380_470, 416, false, "685", [
      { id: "685", basePoint: 100 },
    ]);
    expect(a.finalRunPlans).not.toEqual(b.finalRunPlans);
  });
});

describe("calculatePlanV6 — 破壊者パスで見つかった経路", () => {
  it("ライブ調整が不要なとき（マイセカイ＋ラストランで着地）を NG にしない", () => {
    // calcLivePt の最小値は 100 なので「0 Pt を獲得するスコア」は存在しない。
    // ラストラン一本で端数を着地させるのは本ツールの主用途で、NG にしてはいけない。
    const r = calculatePlanV6(10_000_000, 10_000_946, 946, 350_000, 250, false, ENVY_ID, ENVY_MUSICS);
    expect(r.adjustableDiff).toBe(0);
    expect(r.liveAdjustment.requiredPt).toBe(0);
    expect(r.liveAdjustment.status).toBe("OK");
    expect(r.isVerified).toBe(true);
    expect(r.finalRunPlans.length).toBeGreaterThan(0);
  });

  it("単価が0になる入力でも無限ループしない", () => {
    // ボーナスが -50% 以下だと単価が0になり capacity が Infinity になりうる経路。
    expect(calculateUnitBasePtEstimate(350_000, -50, false)).toBe(0);
    const r = calculatePlanV6(1_000, 6_000, 0, 350_000, -50, false, ENVY_ID, ENVY_MUSICS);
    expect(r.mySekaiAllocation).toEqual({ countA: 0, countB: 0, countC: 0, totalPt: 0 });
  });

  it("ボーナスに桁ミスの巨大値が来ても探索が爆発しない", () => {
    // ボーナス欄は総合力欄と横並びで、総合力の値を誤入力しうる。探索が膨れると
    // 同期実行なので UI が固まる。上限で頭打ちにしていることを時間で確認する。
    const r = calculatePlanV6(1_000_000, 1_001_005, 1005, 350_000, 350_000, false, ENVY_ID, ENVY_MUSICS);
    expect(r.finalRunPlans.every((p) => p.bonus <= 1000)).toBe(true);
  });
});

describe("calculatePlanV6 — 性質", () => {
  it("恒等式が広い入力域で成立する", () => {
    const broken: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const current = 1_000_000 + i * 97_531;
      const target = current + 50_000 + i * 1_234;
      const finalRun = i % 3 === 0 ? 1005 : 0;
      const r = calculatePlanV6(
        current,
        target,
        finalRun,
        300_000 + i * 500,
        200 + i,
        i % 2 === 0,
        ENVY_ID,
        ENVY_MUSICS
      );
      const sum =
        r.currentPt + r.mySekaiAllocation.totalPt + r.liveAdjustment.requiredPt + r.finalRunPt;
      if (sum !== r.targetPt) broken.push(`i=${i}: ${sum} != ${r.targetPt}`);
    }
    expect(broken).toEqual([]);
  }, 30_000);

  it("マイセカイ配分の合計ポイントが配分内容と一致する", () => {
    for (let i = 0; i < 50; i += 1) {
      const r = calculatePlanV6(
        1_000_000,
        1_000_000 + 10_000 + i * 3_331,
        0,
        380_470,
        435,
        i % 2 === 0,
        ENVY_ID,
        ENVY_MUSICS
      );
      const { countA, countB, countC, totalPt } = r.mySekaiAllocation;
      const memories10x = countA * 10 + countB * 5 + countC * 2;
      expect(totalPt).toBe(Math.floor((memories10x * r.unitBasePt) / 10));
    }
  });

  it("配分後の残りがライブ調整で埋まるべき量と一致する", () => {
    for (let i = 0; i < 50; i += 1) {
      const r = calculatePlanV6(
        1_000_000,
        1_000_000 + 10_000 + i * 3_331,
        0,
        380_470,
        435,
        false,
        ENVY_ID,
        ENVY_MUSICS
      );
      expect(r.liveAdjustment.requiredPt).toBeGreaterThanOrEqual(0);
      expect(r.mySekaiAllocation.totalPt + r.liveAdjustment.requiredPt).toBe(r.adjustableDiff);
    }
  });
});
