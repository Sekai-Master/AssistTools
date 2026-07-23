import { describe, expect, it } from "vitest";
import {
  MAX_ADJUST_LIVE_COUNT,
  type MultiLiveAdjustResult,
  distinctBasePoints,
  planMultiLiveAdjustment,
} from "./multiLiveAdjust";
import { calcLivePt } from "./calcLivePt";
import { MAX_LIVE_BONUS, MAX_SCORE_N, SCORE_STEP } from "./constants";

/**
 * planMultiLiveAdjustment（マイセカイ不使用モードの複数回調整）の安全網。
 *
 * 守るべき性質は3つ:
 *   1. 厳密一致 — OK のとき全プランの合計が liveRequired と1Ptもズレない
 *      （「ちょうど着地」が本ツールの根幹保証。近似への緩みを検出する）
 *   2. 回数最小性 — liveCount が ceil(liveRequired / maxPtPerLive) と一致する
 *      （ceil はどんな組合せでも下回れない下界なので、一致＝最小の証明になる）
 *   3. 無言NGの禁止 — 解けないときは必ず reason が付く（OVER_CAP なら必要回数も）
 *
 * 期待値は既存テストの流儀どおり calcLivePt から導出する（マジックナンバー禁止）。
 */

/** 実データ（transformedMusics.json の異なり基礎点28種）の代表サンプル。 */
const REAL_BASES = [100, 103, 114, 116, 130] as const;

const BONUS = 435;
const MAX_SCORE = MAX_SCORE_N * SCORE_STEP;

/** REAL_BASES・LB10・最大スコア係数での1回上限Pt。基礎点にも単調なので最大基礎点で決まる。 */
const MAX_PT = calcLivePt(130, BONUS, MAX_SCORE, MAX_LIVE_BONUS);

/** OK 結果の共通検証: 厳密一致・units との整合・lbCost 昇順・回数上限内。 */
function expectExactPlans(r: MultiLiveAdjustResult, liveRequired: number) {
  expect(r.status).toBe("OK");
  expect(r.plans.length).toBeGreaterThan(0);
  for (const plan of r.plans) {
    // 厳密一致（totalPt はキャッシュなので units からの再計算とも突き合わせる）
    expect(plan.totalPt).toBe(liveRequired);
    const unitSum = plan.units.reduce((sum, u) => sum + u.pt * u.count, 0);
    expect(unitSum).toBe(liveRequired);
    const unitCount = plan.units.reduce((sum, u) => sum + u.count, 0);
    expect(unitCount).toBe(plan.liveCount);
    expect(plan.liveCount).toBeLessThanOrEqual(r.liveCountCap);
    // 各ユニットの pt が「その条件で実際に取れる値」であること（式との整合）
    for (const u of plan.units) {
      expect(u.pt).toBe(calcLivePt(u.basePoint, BONUS, u.minScore, u.liveBonus));
      expect(u.maxScore).toBe(u.minScore + SCORE_STEP - 1);
    }
  }
  // 提示順は LB 消費が安い順（実行コストの低い案を上に出す仕様）
  for (let i = 1; i < r.plans.length; i += 1) {
    expect(r.plans[i - 1].lbCost).toBeLessThanOrEqual(r.plans[i].lbCost);
  }
}

/**
 * 同じ回数・同じ「バルク+端数」構造で到達しうる lbCost の真の最小値を総当たりで出す。
 *
 * 「返り値が昇順か」だけでは、候補を絞ってから並べ替える実装のバグを検出できない。
 * 実際 MAX_PLANS 件で打ち切ってから sort していた頃は、掃引が高Pt側＝高LB側から
 * 始まる都合で最安案を取りこぼしていた（50万Pt で lbCost 70 を提示、真の最小は63）。
 * ライボは希少資源なのでこの差は実害。ここは「全候補中で最安か」を直接押さえる。
 */
function trueMinLbCost(liveRequired: number, n: number, bases: readonly number[]): number {
  const lbOf = new Map<number, number>();
  for (let lb = 0; lb <= MAX_LIVE_BONUS; lb += 1) {
    for (const base of bases) {
      for (let s = 0; s <= MAX_SCORE_N; s += 1) {
        const pt = calcLivePt(base, BONUS, s * SCORE_STEP, lb);
        // LB 昇順に回しているので、最初に入った値がその Pt の最安 LB。
        if (pt > 0 && !lbOf.has(pt)) lbOf.set(pt, lb);
      }
    }
  }
  let best = Infinity;
  for (const [v, lbv] of lbOf) {
    const r = liveRequired - (n - 1) * v;
    if (r <= 0) continue;
    const lbr = lbOf.get(r);
    if (lbr === undefined) continue;
    best = Math.min(best, lbv * (n - 1) + lbr);
  }
  return best;
}

describe("planMultiLiveAdjustment — 厳密一致と回数最小性", () => {
  it("単発で解ける値: 1回・ちょうど・S内の実現手段が返る", () => {
    // 到達Pt集合の要素を式から作れば、必ず1回で解けるはず
    for (const [base, lb, score] of [
      [100, 0, 0],
      [114, 2, 100_000],
      [130, 10, MAX_SCORE],
    ] as const) {
      const liveRequired = calcLivePt(base, BONUS, score, lb);
      const r = planMultiLiveAdjustment(liveRequired, BONUS, REAL_BASES);
      expectExactPlans(r, liveRequired);
      // 1回で届く値なので ceil = 1、つまり全プラン単発が最小
      expect(liveRequired).toBeLessThanOrEqual(r.maxPtPerLive);
      for (const plan of r.plans) expect(plan.liveCount).toBe(1);
    }
  });

  it("複数回が必要な値（構成的に可解なケース）: 合計厳密一致し回数が ceil 下界に張り付く", () => {
    // (n-1)回×上限Pt + S内の端数、という形で作った値は必ず n 回で解ける。
    // ceil(liveRequired / maxPt) = n が下界なので、liveCount === n は回数最小の証明になる。
    const fractions = [
      calcLivePt(100, BONUS, 0, 0), // 最小級の端数
      calcLivePt(116, BONUS, 1_500_000, 4), // 中間の端数
      MAX_PT, // 端数がバルクと同値（1条件に畳まれる形）
    ];
    for (const bulkCount of [1, 6, 20]) {
      for (const frac of fractions) {
        const liveRequired = bulkCount * MAX_PT + frac;
        const r = planMultiLiveAdjustment(liveRequired, BONUS, REAL_BASES);
        expect(r.maxPtPerLive).toBe(MAX_PT);
        expectExactPlans(r, liveRequired);
        const lowerBound = Math.ceil(liveRequired / r.maxPtPerLive);
        expect(lowerBound).toBe(bulkCount + 1);
        for (const plan of r.plans) expect(plan.liveCount).toBe(lowerBound);
      }
    }
  });

  it("数十万Ptの実用域の値でも厳密着地する", () => {
    // マイセカイOFFの典型シナリオ（イベント中盤の数十万Pt差分）
    for (const liveRequired of [123_456, 500_000, 987_654]) {
      const r = planMultiLiveAdjustment(liveRequired, BONUS, REAL_BASES);
      expectExactPlans(r, liveRequired);
    }
  });

  it("基礎点100のみ（楽曲データ縮退時の下限構成）でも百万Ptを厳密着地する", () => {
    // calculator.ts の OFF 経路の受け入れ値（adjustableDiff = 1,000,000）と同じ条件。
    // ここが通ることが calculator.test.ts 側の期待値の根拠になっている。
    const liveRequired = 1_000_000;
    const r = planMultiLiveAdjustment(liveRequired, BONUS, [100]);
    expect(r.maxPtPerLive).toBe(calcLivePt(100, BONUS, MAX_SCORE, MAX_LIVE_BONUS));
    expectExactPlans(r, liveRequired);
  });
});

describe("planMultiLiveAdjustment — 提示するのは全候補中で最も LB の安い案", () => {
  // 候補を絞ってから並べ替えると最安案を落とす。回帰したらここが落ちる。
  it.each([500_000, 250_000, 123_456, 60_000])("%i Pt で lbCost が真の最小と一致する", (req) => {
    const r = planMultiLiveAdjustment(req, BONUS, REAL_BASES);
    expect(r.status).toBe("OK");
    expect(r.plans.length).toBeGreaterThan(0);
    const n = r.plans[0].liveCount;
    expect(r.plans[0].lbCost).toBe(trueMinLbCost(req, n, REAL_BASES));
  });
});

describe("planMultiLiveAdjustment — 境界と NG の明示", () => {
  it("liveRequired 0 は調整不要の OK・plans 空", () => {
    const r = planMultiLiveAdjustment(0, BONUS, REAL_BASES);
    expect(r.status).toBe("OK");
    expect(r.plans).toEqual([]);
  });

  it("回数上限超過は無言NGにせず OVER_CAP と必要回数を返す", () => {
    // 上限 50 回 × 1回上限Pt を確実に超える値
    const liveRequired = MAX_PT * MAX_ADJUST_LIVE_COUNT + 1;
    const r = planMultiLiveAdjustment(liveRequired, BONUS, REAL_BASES);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("OVER_CAP");
    expect(r.plans).toEqual([]);
    expect(r.liveCountCap).toBe(MAX_ADJUST_LIVE_COUNT);
    // UI が「あと何回必要か」を案内できるよう、理論最小回数が ceil どおり返ること
    expect(r.requiredLiveCount).toBe(Math.ceil(liveRequired / r.maxPtPerLive));
    expect(r.requiredLiveCount!).toBeGreaterThan(MAX_ADJUST_LIVE_COUNT);
  });

  it("NO_EXACT は探索した回数範囲を返す（「解なし」と断定させない）", () => {
    // 1 Pt は到達可能な最小Pt（基礎点100・LB0・スコア係数0でも三桁）を下回るので、
    // どの回数でも厳密一致しない＝探索ループを最後まで回って NO_EXACT に落ちる。
    const r = planMultiLiveAdjustment(1, BONUS, REAL_BASES);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("NO_EXACT");
    expect(r.plans).toEqual([]);
    // 探索は「最小回数から数回ぶんの窓」かつ「1案のPt値は2種類まで」に限られるため、
    // NO_EXACT は解の非存在を意味しない。UIが断定を避けられるよう範囲を必ず添える。
    expect(r.searchedUpToCount).toBeDefined();
    expect(r.searchedUpToCount!).toBeGreaterThanOrEqual(Math.ceil(1 / r.maxPtPerLive));
    expect(r.searchedUpToCount!).toBeLessThanOrEqual(MAX_ADJUST_LIVE_COUNT);
  });

  it("負の liveRequired は NG・reason 付き（無言NGにしない）", () => {
    const r = planMultiLiveAdjustment(-100, BONUS, REAL_BASES);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("NO_EXACT");
    expect(r.plans).toEqual([]);
  });

  it("maxPtPerLive は最大基礎点・LB10・最大スコア係数の calcLivePt と一致する", () => {
    // calcLivePt は基礎点・スコア係数・LB倍率のいずれにも単調非減少なので、
    // 上限は「全部最大」の1点で決まる（liveAdjust.test.ts と同じ導出）
    const r = planMultiLiveAdjustment(1_000, BONUS, REAL_BASES);
    expect(r.maxPtPerLive).toBe(MAX_PT);
  });
});

describe("distinctBasePoints", () => {
  it("重複を除去し昇順で返す", () => {
    const musics = [116, 100, 130, 100, 114, 116, 103].map((basePoint) => ({ basePoint }));
    expect(distinctBasePoints(musics)).toEqual([100, 103, 114, 116, 130]);
  });

  it("不正値（NaN・0・負・Infinity）を除外する", () => {
    const musics = [
      { basePoint: NaN },
      { basePoint: 0 },
      { basePoint: -114 },
      { basePoint: Infinity },
      { basePoint: 105 },
    ];
    expect(distinctBasePoints(musics)).toEqual([105]);
  });

  it("空入力・全滅入力は既定基礎点 [100] に退避する", () => {
    // 楽曲データ未達でも従来の単発調整と同等の探索はできるようにする仕様
    expect(distinctBasePoints([])).toEqual([100]);
    expect(distinctBasePoints([{ basePoint: NaN }, { basePoint: 0 }])).toEqual([100]);
  });
});

describe("planMultiLiveAdjustment — 性質（サンプリング）", () => {
  it("1〜20万Ptの広い入力域で、OK なら厳密一致・NG なら理由が付く", () => {
    // 決定的なストライドで数十点サンプルする（乱数だと再現に困るため）
    const broken: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const liveRequired = 1 + i * 5_001 + (i % 7) * 137; // 1 〜 約20万
      const r = planMultiLiveAdjustment(liveRequired, BONUS, REAL_BASES);
      if (r.status === "OK") {
        for (const plan of r.plans) {
          if (plan.totalPt !== liveRequired) {
            broken.push(`liveRequired=${liveRequired}: totalPt=${plan.totalPt}`);
          }
          const unitSum = plan.units.reduce((sum, u) => sum + u.pt * u.count, 0);
          if (unitSum !== liveRequired) {
            broken.push(`liveRequired=${liveRequired}: unitSum=${unitSum}`);
          }
        }
        if (r.plans.length === 0) broken.push(`liveRequired=${liveRequired}: OK but no plans`);
      } else if (r.reason === undefined) {
        // 無言NGの禁止（ラウンド1で確立した原則）
        broken.push(`liveRequired=${liveRequired}: NG without reason`);
      }
    }
    expect(broken).toEqual([]);
  }, 30_000);
});
