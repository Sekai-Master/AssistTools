import { describe, expect, it } from "vitest";
import {
  ENVY_ID,
  calcLivePt,
  calculatePlanV6,
  calculateUnitBasePtEstimate,
  type MusicData,
} from "./calculator";
import {
  DEFAULT_MAX_SCORE,
  DEFAULT_MAX_SCORE_N,
  MAX_LIVE_BONUS,
  MAX_SCORE_CLIP,
  SCORE_STEP,
  maxScoreNOf,
} from "./constants";

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
    // R3-0 改訂: 旧値 946 Pt はボーナス250%だとスコア110万超（旧上限400万の圏内）で
    // しか取れず、既定スコア上限の導入で finalRunPlans が空になる。ラストランPtを
    // 「上限内で実際に取れる値」として式から導出するよう改めた（テストの主旨は不変）。
    const finalRunPt = calcLivePt(100, 250, 900_000, 0);
    const r = calculatePlanV6(
      10_000_000,
      10_000_000 + finalRunPt,
      finalRunPt,
      350_000,
      250,
      false,
      ENVY_ID,
      ENVY_MUSICS
    );
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
  // R2で複数回ライブが解禁されたため、単発上限を前提にした旧アサーションを改訂した。
  // OFF時は liveAdjustment.multi（曲側探索・複数回・LB0〜10）が第1候補になり、
  // 従来の単発・編成組み替え経路（adjustmentPlans）は第2候補として残る。
  // status は「multi が OK か、第2候補が OK なら OK」の合成。ON時 multi は undefined。

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
    // R3-4 改訂: liveAdjustment.maxAdjustablePt のアサーションを削除した。
    // どのコンポーネントも読んでおらず、ADJUST_BASE=100 固定で OFF 第1候補
    // （基礎点130まで使う）と値が食い違うため、フィールド自体が結果型から削除された。
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

  it("OFF・百万Pt差分: R1では単発上限超でNGだったが、R2は複数回で厳密着地する", () => {
    // adjustableDiff = 1,000,000。単発（第2候補）の上限は超えるが、
    // multi（第1候補）が複数回ライブで解くので合成 status は OK になる。
    // この値が multi 側で可解なことは multiLiveAdjust.test.ts の
    // 「基礎点100のみ〜百万Ptを厳密着地する」が担保している。
    const args = [1_000_000, 2_001_005, 1005, 380_470, 435, true, ENVY_ID, ENVY_MUSICS] as const;
    const off = calculatePlanV6(...args, { useMySekai: false });
    expect(off.adjustableDiff).toBe(1_000_000);
    expect(off.liveAdjustment.status).toBe("OK");
    expect(off.isVerified).toBe(true);

    const multi = off.liveAdjustment.multi;
    expect(multi).toBeDefined();
    expect(multi!.status).toBe("OK");
    expect(multi!.plans.length).toBeGreaterThan(0);
    for (const plan of multi!.plans) {
      // 「ちょうど着地」の根幹保証: 全プランの合計が adjustableDiff に厳密一致
      expect(plan.totalPt).toBe(off.adjustableDiff);
      expect(plan.units.reduce((sum, u) => sum + u.pt * u.count, 0)).toBe(off.adjustableDiff);
    }

    // R3-4 改訂: 「第2候補の単発上限（maxAdjustablePt）が式どおり」のアサーションを削除。
    // フィールドが死んでいた（未使用かつ ADJUST_BASE=100 固定で不正確）ため
    // 結果型から削除された。第2候補の存在自体は adjustmentPlans で引き続き確認できる。

    // 同じ入力でも ON ならマイセカイが吸収して着地できる（モード差のコントラスト）
    const on = calculatePlanV6(...args);
    expect(on.isVerified).toBe(true);
  });

  it("OFF・回数上限超過: OVER_CAP で NG になり、必要回数が案内に使える", () => {
    // adjustableDiff = 10,000,000 は上限50回 × 1回上限Pt（基礎点100・LB10で約5.6万）を超える
    const r = calculatePlanV6(
      1_000_000,
      11_001_005,
      1005,
      380_470,
      435,
      true,
      ENVY_ID,
      ENVY_MUSICS,
      { useMySekai: false }
    );
    expect(r.adjustableDiff).toBe(10_000_000);
    expect(r.liveAdjustment.status).toBe("NG");
    expect(r.isVerified).toBe(false);

    const multi = r.liveAdjustment.multi;
    expect(multi).toBeDefined();
    expect(multi!.status).toBe("NG");
    expect(multi!.reason).toBe("OVER_CAP");
    expect(multi!.plans).toEqual([]);
    // 無言NGの禁止: UIが「あと何回必要か」を出せるよう、理論最小回数が ceil どおり返る
    expect(multi!.requiredLiveCount).toBe(Math.ceil(10_000_000 / multi!.maxPtPerLive));
    expect(multi!.requiredLiveCount!).toBeGreaterThan(multi!.liveCountCap);
  });

  it("ON時は liveAdjustment.multi が undefined（複数回探索はOFF専用）", () => {
    const omitted = calculatePlanV6(...GOLDEN_ARGS);
    const explicit = calculatePlanV6(...GOLDEN_ARGS, { useMySekai: true });
    expect(omitted.liveAdjustment.multi).toBeUndefined();
    expect(explicit.liveAdjustment.multi).toBeUndefined();
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

  // R3-0/R3-7 新規: スコア上限（options.maxScore）の正規化と、全探索経路への適用。
  it("maxScore 省略時は既定 1,100,000 に正規化されて結果に載る", () => {
    const r = calculatePlanV6(...GOLDEN_ARGS);
    expect(r.maxScore).toBe(DEFAULT_MAX_SCORE);
    const explicit = calculatePlanV6(...GOLDEN_ARGS, { maxScore: DEFAULT_MAX_SCORE });
    expect(explicit).toEqual(r);
  });

  it("maxScore の桁ミス（30,000,000）は 3,000,000 にクリップされる", () => {
    const r = calculatePlanV6(...GOLDEN_ARGS, { maxScore: 30_000_000 });
    expect(r.maxScore).toBe(MAX_SCORE_CLIP);
  });

  it("maxScore の不正値（0・負・NaN）は既定値に落ちる", () => {
    for (const bad of [0, -1, NaN]) {
      expect(calculatePlanV6(...GOLDEN_ARGS, { maxScore: bad }).maxScore).toBe(DEFAULT_MAX_SCORE);
    }
  });

  it("finalRunPlans / adjustmentPlans は maxScore を超えるスコア帯を要求しない", () => {
    // 到達不能なスコアの要求はモードに関係なく禁止（ON経路にも適用。R3-0 の確定事項）。
    // スコア帯の下端（minScore）が上限以下であることを、既定と明示指定の両方で見る。
    const cases = [
      calculatePlanV6(...GOLDEN_ARGS),
      calculatePlanV6(1_000_000, 1_001_005, 1005, 380_470, 435, false, ENVY_ID, ENVY_MUSICS, {
        maxScore: 500_000,
      }),
    ];
    for (const r of cases) {
      expect(r.finalRunPlans.length).toBeGreaterThan(0);
      expect(r.finalRunPlans.every((p) => p.minScore <= r.maxScore)).toBe(true);
      expect(r.liveAdjustment.adjustmentPlans?.every((p) => p.minScore <= r.maxScore) ?? true).toBe(
        true
      );
    }
  });

  it("R3-7 中核: isVerified が true のとき multi.plans の全ユニットが maxScore 以下", () => {
    // 「検証済み」を名乗るプランに到達不能スコアが混ざらないこと（受け入れ条件の本丸）。
    // 既定上限と明示上限の両方で、OFF・複数回経路の全ユニットを確認する。
    for (const options of [{ useMySekai: false }, { useMySekai: false, maxScore: 2_000_000 }]) {
      const r = calculatePlanV6(
        1_000_000,
        2_001_005,
        1005,
        380_470,
        435,
        true,
        ENVY_ID,
        ENVY_MUSICS,
        options
      );
      expect(r.isVerified).toBe(true);
      const multi = r.liveAdjustment.multi;
      expect(multi).toBeDefined();
      expect(multi!.plans.length).toBeGreaterThan(0);
      for (const plan of multi!.plans) {
        for (const u of plan.units) {
          expect(u.minScore).toBeLessThanOrEqual(r.maxScore);
        }
      }
    }
  });

  it("maxScore を上げると OFF の回数最小案の回数が減る（探索に効いている証拠）", () => {
    // adjustableDiff = 470,000。上限110万 → 300万で1回あたり到達Ptが増え、
    // 回数の下界 ceil(470000 / maxPtPerLive) が下がる。
    const args = [1_000_000, 1_471_005, 1005, 380_470, 435, true, ENVY_ID, ENVY_MUSICS] as const;
    const def = calculatePlanV6(...args, { useMySekai: false });
    const wide = calculatePlanV6(...args, { useMySekai: false, maxScore: MAX_SCORE_CLIP });
    expect(def.adjustableDiff).toBe(470_000);
    const dm = def.liveAdjustment.multi!;
    const wm = wide.liveAdjustment.multi!;
    expect(dm.status).toBe("OK");
    expect(wm.status).toBe("OK");
    expect(wm.maxPtPerLive).toBeGreaterThan(dm.maxPtPerLive);
    expect(wm.plans[0].liveCount).toBeLessThan(dm.plans[0].liveCount);
    // どちらの上限でも ceil 下界を下回らない（2値構造では下界ちょうどで
    // 解けない値もあるため、ここは下界違反がないことだけを見る）
    expect(dm.plans[0].liveCount).toBeGreaterThanOrEqual(Math.ceil(470_000 / dm.maxPtPerLive));
    expect(wm.plans[0].liveCount).toBeGreaterThanOrEqual(Math.ceil(470_000 / wm.maxPtPerLive));
    // maxScoreN の導出と単調性の整合（探索が正規化後の上限に従っている傍証）
    expect(maxScoreNOf(wide.maxScore)).toBeGreaterThan(maxScoreNOf(def.maxScore));
    expect(def.maxScore).toBe(DEFAULT_MAX_SCORE);
    expect(dm.maxPtPerLive).toBe(
      calcLivePt(ADJUST_BASE, 435, DEFAULT_MAX_SCORE_N * SCORE_STEP, MAX_LIVE_BONUS)
    );
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
