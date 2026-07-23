import { describe, expect, it } from "vitest";
import {
  ENVY_ID,
  calcLivePt,
  calculatePlanV6,
  calculateUnitBasePtEstimate,
  type MusicData,
} from "./calculator";
import { MAX_LIVE_BONUS, MAX_SCORE_N, SCORE_STEP } from "./constants";

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

describe("calculatePlanV6 — マイセカイ不使用モード", () => {
  /** 端数調整曲（独りんぼエンヴィー）の基礎点。 */
  const ADJUST_BASE = 100;
  /** 既存ゴールデンと同じ引数。ON経路のリグレッション凍結に使う。 */
  const GOLDEN_ARGS = [
    128_202_307,
    128_311_005,
    1005,
    380_470,
    435,
    true,
    ENVY_ID,
    ENVY_MUSICS,
  ] as const;

  it("ON リグレッション凍結: options 省略と { useMySekai: true } 明示が完全一致する", () => {
    const omitted = calculatePlanV6(...GOLDEN_ARGS);
    const explicit = calculatePlanV6(...GOLDEN_ARGS, { useMySekai: true });
    expect(explicit).toEqual(omitted);
    expect(omitted.useMySekai).toBe(true);
    // ON時の調整ライブは従来どおり LB 0〜1 に縛られる
    expect(omitted.liveAdjustment.maxLiveBonus).toBe(1);
    expect(omitted.liveAdjustment.maxAdjustablePt).toBe(
      calcLivePt(ADJUST_BASE, 435, MAX_SCORE_N * SCORE_STEP, 1)
    );
  });

  it("OFF・着地可能: マイセカイ0のまま調整ライブ1本で差分を吸収する", () => {
    const current = 1_000_000;
    const finalRunPt = 1005;
    const bonus = 435;
    // 調整ライブで到達可能なPtを式から導出する（LB2・スコア10万点。
    // ON時ならマイセカイ配分が走る 100 Pt 超の差分にしてモード差を露出させる）
    const adjustPt = calcLivePt(ADJUST_BASE, bonus, 100_000, 2);
    expect(adjustPt).toBeGreaterThan(100);
    const target = current + adjustPt + finalRunPt;

    const r = calculatePlanV6(current, target, finalRunPt, 380_470, bonus, true, ENVY_ID, ENVY_MUSICS, {
      useMySekai: false,
    });
    expect(r.useMySekai).toBe(false);
    expect(r.mySekaiAllocation.totalPt).toBe(0);
    // OFF時は liveRequired = adjustableDiff（マイセカイが何も吸収しない）
    expect(r.liveAdjustment.requiredPt).toBe(r.adjustableDiff);
    expect(r.adjustableDiff).toBe(adjustPt);
    expect(r.liveAdjustment.status).toBe("OK");
    expect(r.liveAdjustment.maxLiveBonus).toBe(MAX_LIVE_BONUS);
    expect(r.isVerified).toBe(true);
  });

  it("OFF・着地不能: 上限超の差分は NG になり、吸収上限Pt が案内に使える", () => {
    // adjustableDiff = 1,000,000 は調整ライブ1本の上限（LB10でも数万Pt）を大きく超える
    const args = [1_000_000, 2_001_005, 1005, 380_470, 435, true, ENVY_ID, ENVY_MUSICS] as const;
    const off = calculatePlanV6(...args, { useMySekai: false });
    expect(off.liveAdjustment.status).toBe("NG");
    expect(off.isVerified).toBe(false);
    expect(off.liveAdjustment.maxAdjustablePt).toBeGreaterThan(0);
    expect(off.liveAdjustment.maxAdjustablePt).toBe(
      calcLivePt(ADJUST_BASE, 435, MAX_SCORE_N * SCORE_STEP, MAX_LIVE_BONUS)
    );
    expect(off.adjustableDiff).toBeGreaterThan(off.liveAdjustment.maxAdjustablePt);

    // 同じ入力でも ON ならマイセカイが吸収して着地できる（モード差のコントラスト）
    const on = calculatePlanV6(...args);
    expect(on.isVerified).toBe(true);
  });

  it("OFF・ラストラン一本（adjustableDiff = 0）を NG にしない", () => {
    // ON側の破壊者パステストと同じシナリオ。OFFでも主用途を壊さないこと
    const r = calculatePlanV6(10_000_000, 10_000_946, 946, 350_000, 250, false, ENVY_ID, ENVY_MUSICS, {
      useMySekai: false,
    });
    expect(r.adjustableDiff).toBe(0);
    expect(r.mySekaiAllocation.totalPt).toBe(0);
    expect(r.liveAdjustment.requiredPt).toBe(0);
    expect(r.liveAdjustment.status).toBe("OK");
    expect(r.isVerified).toBe(true);
  });

  it("OFF・恒等式: isVerified なら 現在Pt + 0 + ライブ調整 + ラストラン = 目標Pt", () => {
    // LB解放域（2以上）を含む各消費数で、到達可能な差分を式から導出して着地させる
    for (const lb of [0, 1, 5, 7, 10]) {
      const adjustPt = calcLivePt(ADJUST_BASE, 435, 400_000, lb);
      const target = 1_000_000 + adjustPt + 1005;
      const r = calculatePlanV6(1_000_000, target, 1005, 380_470, 435, false, ENVY_ID, ENVY_MUSICS, {
        useMySekai: false,
      });
      expect(r.isVerified).toBe(true);
      expect(r.mySekaiAllocation.totalPt).toBe(0);
      expect(
        r.currentPt + r.mySekaiAllocation.totalPt + r.liveAdjustment.requiredPt + r.finalRunPt
      ).toBe(r.targetPt);
    }
  }, 30_000);
});
