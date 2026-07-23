import { describe, expect, it } from "vitest";
import {
  MAX_ADJUST_LIVE_COUNT,
  type MultiLiveAdjustResult,
  type MultiLivePlan,
  distinctBasePoints,
  planMultiLiveAdjustment,
} from "./multiLiveAdjust";
import { calcLivePt } from "./calcLivePt";
import {
  DEFAULT_MAX_SCORE_N,
  MAX_LIVE_BONUS,
  MAX_SCORE_CLIP,
  SCORE_STEP,
  maxScoreNOf,
} from "./constants";

/**
 * planMultiLiveAdjustment（マイセカイ不使用モードの複数回調整）の安全網。
 *
 * R3 全面改訂の理由:
 *   - R3-0: 探索のスコア上限が MAX_SCORE_N(=200, スコア400万) 固定から
 *     maxScoreN 引数（既定 DEFAULT_MAX_SCORE_N=55, スコア110万）に変わった。
 *     400万点はソロライブで人間に到達不能なため、期待値の導出基準をすべて差し替えた。
 *   - R3-2: 返り値が「全プラン同一回数・lbCost 昇順・先頭がLB最安」から
 *     「回数昇順・lbCost 真に減少のパレート前線（先頭=回数最小・末尾=LB最安）」に変わった。
 *     旧仕様を前提にした順序・回数のアサーションを前線仕様に書き換えた。
 *   - R3-3: minPtPerLive（1回の最小獲得Pt。死角案内用）が結果に追加された。
 *
 * 守るべき性質:
 *   1. 厳密一致 — OK のとき全プランの合計が liveRequired と1Ptもズレない
 *   2. 回数最小性 — 先頭プランの liveCount が ceil(liveRequired / maxPtPerLive) の
 *      下界を下回らない（下界ちょうどで解ける代表ケースでは一致まで固定する）
 *   3. 前線性 — plans は回数狭義昇順・lbCost 狭義降順（回数を増やす価値のある案だけ）
 *   4. 到達可能性 — 全ユニットの minScore がスコア上限以下（実行不能スコアを要求しない）
 *   5. 無言NGの禁止 — 解けないときは必ず reason が付く（OVER_CAP なら必要回数も）
 *
 * 期待値は既存テストの流儀どおり calcLivePt から導出する（マジックナンバー禁止）。
 */

/** 実データ（transformedMusics.json の異なり基礎点28種）の代表サンプル。 */
const REAL_BASES = [100, 103, 114, 116, 130] as const;

const BONUS = 435;
// R3-0: 既定の探索上限スコア（110万）。旧テストの MAX_SCORE_N * SCORE_STEP（400万）から改訂。
const CAP_SCORE = DEFAULT_MAX_SCORE_N * SCORE_STEP;

/** REAL_BASES・LB10・既定スコア上限での1回上限Pt。基礎点にも単調なので最大基礎点で決まる。 */
const MAX_PT = calcLivePt(130, BONUS, CAP_SCORE, MAX_LIVE_BONUS);

/** OK 結果の共通検証: 厳密一致・units との整合・前線順・回数上限内・到達可能スコア。 */
function expectExactPlans(
  r: MultiLiveAdjustResult,
  liveRequired: number,
  maxScoreN: number = DEFAULT_MAX_SCORE_N
) {
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
    for (const u of plan.units) {
      // 各ユニットの pt が「その条件で実際に取れる値」であること（式との整合）
      expect(u.pt).toBe(calcLivePt(u.basePoint, BONUS, u.minScore, u.liveBonus));
      expect(u.maxScore).toBe(u.minScore + SCORE_STEP - 1);
      // R3-0/R3-7: 到達不能なスコアを要求しない（スコア帯の下端が上限以下）
      expect(u.minScore).toBeLessThanOrEqual(maxScoreN * SCORE_STEP);
    }
  }
  // R3-2 改訂: 旧仕様の「lbCost 昇順」からパレート前線
  // 「回数狭義昇順・lbCost 狭義降順（先頭=回数最小・末尾=LB最安）」に変わった。
  for (let i = 1; i < r.plans.length; i += 1) {
    expect(r.plans[i].liveCount).toBeGreaterThan(r.plans[i - 1].liveCount);
    expect(r.plans[i].lbCost).toBeLessThan(r.plans[i - 1].lbCost);
  }
}

/**
 * 到達可能な Pt → 最安 LB の対応表を独立に構築する（実装と同じ探索クラス）。
 * LB 昇順に回しているので、最初に入った値がその Pt の最安 LB になる。
 */
function cheapestLbByPt(
  bases: readonly number[],
  maxScoreN: number = DEFAULT_MAX_SCORE_N
): Map<number, number> {
  const lbOf = new Map<number, number>();
  for (let lb = 0; lb <= MAX_LIVE_BONUS; lb += 1) {
    for (const base of bases) {
      for (let s = 0; s <= maxScoreN; s += 1) {
        const pt = calcLivePt(base, BONUS, s * SCORE_STEP, lb);
        if (pt > 0 && !lbOf.has(pt)) lbOf.set(pt, lb);
      }
    }
  }
  return lbOf;
}

/**
 * 期待されるパレート前線を総当たりで独立構築する（(liveCount, lbCost) の点列）。
 *
 * 探索クラスは実装と同じ「バルク1値 + 端数1値」の2値構造。回数 n ごとに
 * その構造で到達しうる lbCost の真の最小を求め、「回数を増やすと LB が真に減る」
 * 点だけを残す。実装の間引き（5件超→代表点）より手前の完全な前線なので、
 * 返り値がこの前線の部分列（両端含む）であることの検証に使える。
 *
 * 「返り値が降順か」だけでは、候補を絞ってから並べ替える実装のバグを検出できない
 * （R2 で実害を確認済み: 50万Pt で lbCost 70 を提示、真の最小は63）。
 * ライボは希少資源なのでここは総当たりで直接押さえる。
 */
function expectedFrontier(
  liveRequired: number,
  bases: readonly number[],
  maxScoreN: number = DEFAULT_MAX_SCORE_N
): Array<{ liveCount: number; lbCost: number }> {
  const lbOf = cheapestLbByPt(bases, maxScoreN);
  const sortedPts = [...lbOf.keys()].sort((a, b) => b - a);
  const maxPt = sortedPts[0];
  const minCount = Math.ceil(liveRequired / maxPt);
  const frontier: Array<{ liveCount: number; lbCost: number }> = [];
  for (let n = minCount; n <= MAX_ADJUST_LIVE_COUNT; n += 1) {
    let best = Infinity;
    if (n === 1) {
      const lb = lbOf.get(liveRequired);
      if (lb !== undefined) best = lb;
    } else {
      for (const v of sortedPts) {
        const r = liveRequired - (n - 1) * v;
        if (r <= 0) continue;
        if (r > maxPt) break;
        const lbr = lbOf.get(r);
        if (lbr === undefined) continue;
        best = Math.min(best, lbOf.get(v)! * (n - 1) + lbr);
      }
    }
    if (!Number.isFinite(best)) continue;
    if (frontier.length === 0 || best < frontier[frontier.length - 1].lbCost) {
      frontier.push({ liveCount: n, lbCost: best });
      if (best === 0) break;
    }
  }
  return frontier;
}

describe("planMultiLiveAdjustment — 厳密一致と回数最小性", () => {
  it("単発で解ける値: 先頭プランが1回・ちょうど・S内の実現手段", () => {
    // 到達Pt集合の要素を式から作れば、必ず1回で解けるはず。
    // R3-0 改訂: スコアはすべて既定上限 CAP_SCORE 以下から採る（旧テストは400万を使用）。
    // R3-2 改訂: 前線化により2番目以降に「回数を増やしてLBを節約する」案が並びうるため、
    // 「全プラン1回」ではなく「先頭（回数最小案）が1回」を検証する。
    for (const [base, lb, score] of [
      [100, 0, 0],
      [114, 2, 100_000],
      [130, 10, CAP_SCORE],
    ] as const) {
      const liveRequired = calcLivePt(base, BONUS, score, lb);
      const r = planMultiLiveAdjustment(liveRequired, BONUS, REAL_BASES);
      expectExactPlans(r, liveRequired);
      expect(liveRequired).toBeLessThanOrEqual(r.maxPtPerLive);
      expect(r.plans[0].liveCount).toBe(1);
    }
  });

  it("複数回が必要な値（構成的に可解なケース）: 合計厳密一致し先頭が ceil 下界に張り付く", () => {
    // (n-1)回×上限Pt + S内の端数、という形で作った値は必ず n 回で解ける。
    // ceil(liveRequired / maxPt) = n が下界なので、liveCount === n は回数最小の証明になる。
    // R3-0 改訂: 端数の導出スコアを上限 110 万以内に収めた（旧: 1,500,000 は今は探索圏外）。
    // R3-2 改訂: 下界チェックは先頭プランのみ（2番目以降は意図的に回数が多い）。
    const fractions = [
      calcLivePt(100, BONUS, 0, 0), // 最小級の端数
      calcLivePt(116, BONUS, 800_000, 4), // 中間の端数（上限110万以内）
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
        expect(r.plans[0].liveCount).toBe(lowerBound);
      }
    }
  });

  it("数十万Ptの実用域の値でも厳密着地する", () => {
    // マイセカイOFFの典型シナリオ（イベント中盤の数十万Pt差分）
    for (const liveRequired of [123_456, 500_000, 987_654]) {
      const r = planMultiLiveAdjustment(liveRequired, BONUS, REAL_BASES);
      expectExactPlans(r, liveRequired);
      // ceil はどの組合せでも下回れない下界。2値構造では下界ちょうどで解けない値も
      // ある（例: 987,654 は下界27に対し最小30）ので、ここは下界違反がないことを見る。
      expect(r.plans[0].liveCount).toBeGreaterThanOrEqual(
        Math.ceil(liveRequired / r.maxPtPerLive)
      );
    }
  });

  it("基礎点100のみ（楽曲データ縮退時の下限構成）でも百万Ptを厳密着地する", () => {
    // calculator.ts の OFF 経路の受け入れ値（adjustableDiff = 1,000,000）と同じ条件。
    // ここが通ることが calculator.test.ts 側の期待値の根拠になっている。
    // R3-0 改訂: 上限Pt の基準スコアを 400万 → 110万（CAP_SCORE）に変更。
    const liveRequired = 1_000_000;
    const r = planMultiLiveAdjustment(liveRequired, BONUS, [100]);
    expect(r.maxPtPerLive).toBe(calcLivePt(100, BONUS, CAP_SCORE, MAX_LIVE_BONUS));
    expectExactPlans(r, liveRequired);
  });
});

describe("planMultiLiveAdjustment — 回数 vs LB のパレート前線（R3-2）", () => {
  // R3-2 改訂: 旧「提示するのは全候補中で最も LB の安い案」describe を置き換え。
  // 前線仕様では「先頭=回数最小・末尾=LB最安・中間は回数を増やすとLBが真に減る点」
  // なので、独立に総当たりした前線との突き合わせで検証する。
  it.each([500_000, 250_000, 123_456, 60_000, 470_000])(
    "%i Pt: plans が期待前線の部分列で、両端（回数最小・LB最安）を必ず含む",
    (req) => {
      const r = planMultiLiveAdjustment(req, BONUS, REAL_BASES);
      expectExactPlans(r, req);
      const frontier = expectedFrontier(req, REAL_BASES);
      expect(frontier.length).toBeGreaterThan(0);

      // 5件以下への間引き
      expect(r.plans.length).toBeLessThanOrEqual(5);
      // 先頭 = 回数最小案（ceil 下界に一致し、その回数での最安LB）
      expect(r.plans[0].liveCount).toBe(frontier[0].liveCount);
      expect(r.plans[0].lbCost).toBe(frontier[0].lbCost);
      // ceil 下界の違反は許さない（下界ちょうどで解けるかは値による。代表ケースは別テスト）
      expect(r.plans[0].liveCount).toBeGreaterThanOrEqual(Math.ceil(req / r.maxPtPerLive));
      // 末尾 = LB最安案
      const lastPlan = r.plans[r.plans.length - 1];
      const lastFront = frontier[frontier.length - 1];
      expect(lastPlan.liveCount).toBe(lastFront.liveCount);
      expect(lastPlan.lbCost).toBe(lastFront.lbCost);
      // 全プランが前線上の点（回数を増やしたのに得しない案は混ざらない）
      for (const plan of r.plans) {
        expect(frontier).toContainEqual({ liveCount: plan.liveCount, lbCost: plan.lbCost });
      }
    }
  );

  it("ブリーフ実測ケース: 470,000 Pt は先頭13回の前線になり末尾ほどLBが安い", () => {
    // R3 ブリーフの実測サニティ（bonus 435・スコア上限110万）: 13回 〜 22回の前線。
    // 回数側は最大基礎点130で決まるので REAL_BASES でも 13 = ceil(470000/37695) を再現できる。
    const r = planMultiLiveAdjustment(470_000, BONUS, REAL_BASES);
    expect(r.status).toBe("OK");
    // 先頭案が ceil 下界ちょうど（= 回数最小の証明が立つ代表ケース）
    expect(r.plans[0].liveCount).toBe(13);
    expect(r.plans[0].liveCount).toBe(Math.ceil(470_000 / r.maxPtPerLive));
    // トレードオフとして選ぶ意味のある多様性（2点以上・末尾は先頭よりLBが安い）
    expect(r.plans.length).toBeGreaterThan(1);
    expect(r.plans[r.plans.length - 1].lbCost).toBeLessThan(r.plans[0].lbCost);
  });

  it("LB 0 の案が存在する値では末尾が LB 0 に到達する", () => {
    // 到達Pt集合には LB0 の値（例: 535 = calcLivePt(100,435,0,0)）が含まれるので、
    // その倍数は「回数を増やせば LB 0」で必ず解ける。前線の末尾がそこまで届くこと。
    const base = calcLivePt(100, BONUS, 0, 0);
    const req = base * 10; // 10回 × LB0 で厳密着地できる値
    const r = planMultiLiveAdjustment(req, BONUS, REAL_BASES);
    expect(r.status).toBe("OK");
    expect(r.plans[r.plans.length - 1].lbCost).toBe(0);
  });

  it("maxScoreN を上げると先頭案（回数最小）の回数が減る", () => {
    // R3-0: スコア上限はトレードオフ全体を規定する。上限を 110万 → 300万（クリップ値）に
    // 上げると1回あたり到達Ptが増え、必要回数の下界が下がるはず。
    const req = 470_000;
    const clipN = maxScoreNOf(MAX_SCORE_CLIP);
    const def = planMultiLiveAdjustment(req, BONUS, REAL_BASES);
    const wide = planMultiLiveAdjustment(req, BONUS, REAL_BASES, clipN);
    expect(def.status).toBe("OK");
    expect(wide.status).toBe("OK");
    expect(wide.maxPtPerLive).toBeGreaterThan(def.maxPtPerLive);
    expect(wide.plans[0].liveCount).toBeLessThan(def.plans[0].liveCount);
    // それぞれの上限での回数最小性は維持される
    expect(wide.plans[0].liveCount).toBe(Math.ceil(req / wide.maxPtPerLive));
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

  it("ブリーフ実測ケース: 4,980,000 Pt は OVER_CAP・必要回数133", () => {
    // R3-0 の受け入れ実測値。旧上限（スコア400万）では「最低69回」と過小申告していた。
    // スコア上限110万では ceil(4,980,000 / 37,695) = 133 回。
    const r = planMultiLiveAdjustment(4_980_000, BONUS, REAL_BASES);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("OVER_CAP");
    expect(r.maxPtPerLive).toBe(MAX_PT);
    expect(r.requiredLiveCount).toBe(133);
    expect(r.requiredLiveCount).toBe(Math.ceil(4_980_000 / MAX_PT));
  });

  it("NO_EXACT は探索した回数範囲を返す（「解なし」と断定させない）", () => {
    // 1 Pt は到達可能な最小Pt（基礎点100・LB0・スコア係数0でも三桁）を下回るので、
    // どの回数でも厳密一致しない＝探索ループを最後まで回って NO_EXACT に落ちる。
    const r = planMultiLiveAdjustment(1, BONUS, REAL_BASES);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("NO_EXACT");
    expect(r.plans).toEqual([]);
    // 探索は回数上限までの走査かつ「1案のPt値は2種類まで」の制約付きなので、
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

  it("maxPtPerLive は最大基礎点・LB10・スコア上限の calcLivePt と一致する", () => {
    // calcLivePt は基礎点・スコア係数・LB倍率のいずれにも単調非減少なので、
    // 上限は「全部最大」の1点で決まる（liveAdjust.test.ts と同じ導出）。
    // R3-0 改訂: 基準スコアを MAX_SCORE_N*STEP（400万） → CAP_SCORE（110万）に変更。
    const r = planMultiLiveAdjustment(1_000, BONUS, REAL_BASES);
    expect(r.maxPtPerLive).toBe(MAX_PT);
  });

  it("minPtPerLive は最小基礎点・LB0・スコア係数0 の calcLivePt と一致する（R3-3）", () => {
    // R3-3 新規: 死角案内用。bonus 435% では 535（= calcLivePt(100, 435, 0, 0)）。
    // liveRequired がこれ未満だと原理的に1回でも着地できない。
    const minPt = calcLivePt(100, BONUS, 0, 0);
    expect(minPt).toBe(535);
    const ok = planMultiLiveAdjustment(1_000, BONUS, REAL_BASES);
    expect(ok.minPtPerLive).toBe(minPt);
  });

  it("死角（liveRequired < minPtPerLive）は NG になり、UIがズラし幅を案内できる", () => {
    // R3 ブリーフ実測: req=300 は minPtPerLive=535 の死角で NO_EXACT。
    // UI は「数ポイントずらす」ではなく minPtPerLive を使った具体的なズラし幅を出す。
    const r = planMultiLiveAdjustment(300, BONUS, REAL_BASES);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("NO_EXACT");
    expect(r.minPtPerLive).toBe(535);
    expect(300).toBeLessThan(r.minPtPerLive);
  });
});

/**
 * ブリーフ（docs/point-adjust-step2-ux-brief.md 診断1）の実戦ケースをそのまま固定する
 * 特性化テスト。R4 で sameCountVariants / 帯内全数チェックを足すにあたり、
 * 「既存の plans が1Ptも1LBも変わっていない」ことを直接押さえるための網。
 *
 * 期待値はブリーフの実測表（2回/LB9・3回/LB8・10回/LB7・12回/LB6・37回/LB0）と一致する。
 */
const BRIEF_BASES = [
  100, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
  121, 122, 123, 124, 125, 126, 127, 128, 130,
] as const;
const BRIEF_BONUS = 990;
const BRIEF_REQUIRED = 80_527;

describe("planMultiLiveAdjustment — 実戦ケースの特性化（R4 の非退行網）", () => {
  it("80,527 Pt / ボーナス990% の前線が (回数, LB) までブリーフ実測と一致する", () => {
    const r = planMultiLiveAdjustment(BRIEF_REQUIRED, BRIEF_BONUS, BRIEF_BASES);
    expect(r.status).toBe("OK");
    expect(r.plans.map((p) => [p.liveCount, p.lbCost])).toEqual([
      [2, 9],
      [3, 8],
      [10, 7],
      [12, 6],
      [37, 0],
    ]);
    expect(r.maxPtPerLive).toBe(calcLivePt(130, BRIEF_BONUS, CAP_SCORE, MAX_LIVE_BONUS));
    expect(r.minPtPerLive).toBe(calcLivePt(100, BRIEF_BONUS, 0, 0));
  });

  it("主役プラン（先頭）の units が一意に固定される", () => {
    // ブリーフの表示例そのもの: メルト級（基礎点130・7焚き）+ 基礎点123・2焚き。
    const r = planMultiLiveAdjustment(BRIEF_REQUIRED, BRIEF_BONUS, BRIEF_BASES);
    expect(r.plans[0].units).toEqual([
      {
        basePoint: 130,
        liveBonus: 7,
        minScore: 1_040_000,
        maxScore: 1_059_999,
        pt: calcLivePt(130, BRIEF_BONUS, 1_040_000, 7),
        count: 1,
      },
      {
        basePoint: 123,
        liveBonus: 2,
        minScore: 700_000,
        maxScore: 719_999,
        pt: calcLivePt(123, BRIEF_BONUS, 700_000, 2),
        count: 1,
      },
    ]);
    expect(r.plans[0].totalPt).toBe(BRIEF_REQUIRED);
  });

  it("全プランが厳密一致し、units の合計とも突き合う", () => {
    const r = planMultiLiveAdjustment(BRIEF_REQUIRED, BRIEF_BONUS, BRIEF_BASES);
    for (const plan of r.plans) {
      expect(plan.totalPt).toBe(BRIEF_REQUIRED);
      expect(plan.units.reduce((s, u) => s + u.pt * u.count, 0)).toBe(BRIEF_REQUIRED);
      expect(plan.units.reduce((s, u) => s + u.count, 0)).toBe(plan.liveCount);
      expect(plan.units.reduce((s, u) => s + u.liveBonus * u.count, 0)).toBe(plan.lbCost);
    }
  });
});

describe("planMultiLiveAdjustment — 同一本数内の代替内訳 sameCountVariants（R4）", () => {
  // ブリーフ P0-2:「LB の選択肢は**同一本数の中でのみ**提示する」。
  // plans（パレート前線）は本数違いの軸なので壊さず、同一本数の内訳違いを別枠で返す。
  it("全 variant が主役と同じ liveCount で、厳密一致する", () => {
    const r = planMultiLiveAdjustment(BRIEF_REQUIRED, BRIEF_BONUS, BRIEF_BASES);
    expect(r.sameCountVariants.length).toBeGreaterThan(0);
    for (const v of r.sameCountVariants) {
      expect(v.liveCount).toBe(r.plans[0].liveCount);
      expect(v.totalPt).toBe(BRIEF_REQUIRED);
      expect(v.units.reduce((s, u) => s + u.pt * u.count, 0)).toBe(BRIEF_REQUIRED);
      for (const u of v.units) {
        expect(u.pt).toBe(calcLivePt(u.basePoint, BRIEF_BONUS, u.minScore, u.liveBonus));
        expect(u.minScore).toBeLessThanOrEqual(DEFAULT_MAX_SCORE_N * SCORE_STEP);
      }
    }
  });

  it("lbCost 昇順・4件以下・主役自身は含まない", () => {
    const r = planMultiLiveAdjustment(BRIEF_REQUIRED, BRIEF_BONUS, BRIEF_BASES);
    expect(r.sameCountVariants.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < r.sameCountVariants.length; i += 1) {
      expect(r.sameCountVariants[i].lbCost).toBeGreaterThanOrEqual(
        r.sameCountVariants[i - 1].lbCost
      );
    }
    // 署名は順序非依存で取る。units の並びはプランの意味に関係しないので、
    // 順序込みで比べると「バルクと端数が入れ替わっただけの同案」を見逃す
    // （実際に主役そのものが代替案として再掲される事故が出た）。
    const sig = (p: MultiLivePlan) =>
      p.units
        .map((u) => JSON.stringify(u))
        .sort()
        .join("|");
    const primary = sig(r.plans[0]);
    const sigs = r.sameCountVariants.map(sig);
    expect(sigs).not.toContain(primary);
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it("units の並び替え違いを別案として数えない（重複排除の正規化）", () => {
    // 同一本数の代替案は提示枠が4件しかないので、実質同じ案で埋めてはいけない。
    // units の並びはプランの意味に関係しないため、順序非依存の署名で見る。
    // 逆に「同じPt・同じLBだが曲（基礎点）とスコア帯が違う」案は別物として数える
    // ＝ユーザーへの指示内容が変わるため（実測でこの区別が要ることを確認）。
    for (const req of [BRIEF_REQUIRED, 250_000, 60_000]) {
      const r = planMultiLiveAdjustment(req, BRIEF_BONUS, BRIEF_BASES);
      const canonical = (p: MultiLivePlan) =>
        p.units
          .map((u) => JSON.stringify(u))
          .sort()
          .join("|");
      const all = [r.plans[0], ...r.sameCountVariants].map(canonical);
      expect(new Set(all).size).toBe(all.length);
      expect(all.length).toBeGreaterThan(1);
    }
  });

  it("1回で解ける値では「同じ1回・別LB/スコア帯」が出る（エビ詰めの主用途）", () => {
    // 主用途は「独りんぼエンヴィーをソロ・LB0〜1で叩く端数調整」。
    // 単発ケースこそ内訳の選択肢が要る（曲を変えずスコア帯だけ変える等）。
    const req = calcLivePt(114, BRIEF_BONUS, 100_000, 2);
    const r = planMultiLiveAdjustment(req, BRIEF_BONUS, BRIEF_BASES);
    expect(r.plans[0].liveCount).toBe(1);
    expect(r.sameCountVariants.length).toBeGreaterThan(0);
    for (const v of r.sameCountVariants) {
      expect(v.liveCount).toBe(1);
      expect(v.totalPt).toBe(req);
    }
  });

  it("全数照合経路（3値すべて異なる解）でも同回数の代替内訳が入る（弱点9の解消）", () => {
    // req=3714・bonus990%・bases[100,130] は構成的に用意した実測ケース:
    // フロンティア側の (v,v,r) 構造では作れず findExhaustiveExact だけが解く
    // 「3値すべて異なる」帯で、かつ同じ合計を作る組が主役以外に3通りある
    // （1090+1122+1502 / 1100+1155+1459 / 1111+1144+1459 / 1122+1133+1459、
    //  いずれも lb=0 で並ぶため lbCost は同値、最初に見つかった組が主役になる）。
    // 弱点9修正前はこの経路の sameCountVariants が常に [] だった。
    const req = 3_714;
    const r = planMultiLiveAdjustment(req, 990, [100, 130]);
    expect(r.status).toBe("OK");
    expect(r.plans).toHaveLength(1);
    expect(r.plans[0].liveCount).toBe(3);
    expect(r.sameCountVariants.length).toBe(3);
    const primarySig = r.plans[0].units
      .map((u) => `${u.pt}x${u.count}`)
      .sort()
      .join("|");
    const seen = new Set<string>([primarySig]);
    for (const v of r.sameCountVariants) {
      expect(v.liveCount).toBe(3);
      expect(v.totalPt).toBe(req);
      expect(v.units.reduce((s, u) => s + u.pt * u.count, 0)).toBe(req);
      const sig = v.units
        .map((u) => `${u.pt}x${u.count}`)
        .sort()
        .join("|");
      expect(seen.has(sig)).toBe(false); // 主役・他の代替と重複しない
      seen.add(sig);
    }
  });

  it("plans が空の経路（調整不要・NG）では常に空配列", () => {
    expect(planMultiLiveAdjustment(0, BONUS, REAL_BASES).sameCountVariants).toEqual([]);
    expect(planMultiLiveAdjustment(-100, BONUS, REAL_BASES).sameCountVariants).toEqual([]);
    expect(planMultiLiveAdjustment(1, BONUS, REAL_BASES).sameCountVariants).toEqual([]);
    const over = planMultiLiveAdjustment(MAX_PT * MAX_ADJUST_LIVE_COUNT + 1, BONUS, REAL_BASES);
    expect(over.reason).toBe("OVER_CAP");
    expect(over.sameCountVariants).toEqual([]);
  });

  it("variants を足しても plans は1件も変わらない（前線の非侵襲性）", () => {
    // 収集は frontier 確定後の後処理なので、best 選択に触れていないことを
    // 代表入力の前線が特性化テストと一致することで確認する。
    for (const req of [500_000, 250_000, 123_456, 60_000, 470_000]) {
      const r = planMultiLiveAdjustment(req, BONUS, REAL_BASES);
      expectExactPlans(r, req);
      const frontier = expectedFrontier(req, REAL_BASES);
      expect(r.plans[0].liveCount).toBe(frontier[0].liveCount);
      expect(r.plans[0].lbCost).toBe(frontier[0].lbCost);
    }
  });
});

describe("planMultiLiveAdjustment — 着地可能性の断定 landability（R4 / P2-7）", () => {
  /**
   * ブリーフ診断5の「正しさの穴」。残額 < 4 × minPtPerLive の帯では、
   * どの解も3本以内に収まる（k本の合計は必ず k × minPtPerLive 以上）ので、
   * 3本以内を全数照合すれば「着地不能」を断定できる。
   *
   * ここでは実装から独立した素朴な全組合せ探索をオラクルにして突き合わせる。
   */
  function naiveReachableWithin3(req: number, bonus: number, bases: readonly number[]): boolean {
    const pts = new Set<number>();
    for (let lb = 0; lb <= MAX_LIVE_BONUS; lb += 1) {
      for (const base of bases) {
        for (let n = 0; n <= DEFAULT_MAX_SCORE_N; n += 1) {
          const pt = calcLivePt(base, bonus, n * SCORE_STEP, lb);
          if (pt > 0 && pt <= req) pts.add(pt);
        }
      }
    }
    const arr = [...pts];
    if (pts.has(req)) return true;
    for (const a of arr) {
      if (pts.has(req - a)) return true;
    }
    for (const a of arr) {
      for (const b of arr) {
        const c = req - a - b;
        if (c > 0 && pts.has(c)) return true;
      }
    }
    return false;
  }

  /** 帯 [from, from+span) をオラクルと突き合わせ、食い違いを文字列で返す。 */
  function scanBand(
    from: number,
    span: number,
    bonus: number,
    bases: readonly number[]
  ): { broken: string[]; okCount: number } {
    const broken: string[] = [];
    let okCount = 0;
    for (let req = from; req < from + span; req += 1) {
      const r = planMultiLiveAdjustment(req, bonus, bases);
      const reachable = naiveReachableWithin3(req, bonus, bases);
      if (reachable && r.status !== "OK") {
        broken.push(`req=${req}: reachable but ${r.status}/${r.landability}`);
      }
      if (!reachable && r.landability !== "UNREACHABLE") {
        broken.push(`req=${req}: unreachable but landability=${r.landability}`);
      }
      if (r.status === "OK") {
        okCount += 1;
        if (r.plans[0].totalPt !== req) broken.push(`req=${req}: totalPt=${r.plans[0].totalPt}`);
        if (r.plans[0].liveCount > 3) broken.push(`req=${req}: liveCount=${r.plans[0].liveCount}`);
        const sum = r.plans[0].units.reduce((s, u) => s + u.pt * u.count, 0);
        if (sum !== req) broken.push(`req=${req}: unitSum=${sum}`);
      }
    }
    return { broken, okCount };
  }

  it("最小値直上の帯: 素朴な全組合せ探索と status/landability が一致する", () => {
    const minPt = calcLivePt(100, 990, 0, 0);
    expect(scanBand(minPt, 300, 990, [100, 130]).broken).toEqual([]);
  }, 60_000);

  it("帯の上端付近: 3値すべて異なる解を拾い、拾えない値だけを UNREACHABLE にする", () => {
    // ここが本探索（1案のPt値2種まで）の穴。基礎点が2種以上ないと3値解が現れないので、
    // 単一基礎点ではこの分岐を踏めない点に注意（実測: [100] のみだと発火0件）。
    const minPt = calcLivePt(100, 990, 0, 0);
    const { broken, okCount } = scanBand(3_600, 400, 990, [100, 130]);
    expect(broken).toEqual([]);
    expect(3_600).toBeGreaterThan(minPt);
    expect(4_000).toBeLessThan((3 + 1) * minPt); // 全数照合が効く帯に収まっていること
    expect(okCount).toBeGreaterThan(0);
  }, 60_000);

  it("従来 NG だった3値解が OK に昇格し、厳密一致する（診断5の穴埋め）", () => {
    // 実測ケース: 3,663 = 1,473 + 1,100 + 1,090。同じ値を2回使う (v,v,r) 構造では
    // 作れないため R3 までは NO_EXACT だった。回数3は下界を割っていない
    // （n=1,2 は本探索が全数で見ており解なし）。
    const r = planMultiLiveAdjustment(3_663, 990, [100, 130]);
    expect(r.status).toBe("OK");
    expect(r.plans).toHaveLength(1);
    expect(r.plans[0].totalPt).toBe(3_663);
    expect(r.plans[0].liveCount).toBe(3);
    expect(r.plans[0].units.reduce((s, u) => s + u.pt * u.count, 0)).toBe(3_663);
    for (const u of r.plans[0].units) {
      expect(u.pt).toBe(calcLivePt(u.basePoint, 990, u.minScore, u.liveBonus));
    }
    // 2本以内では作れないこと（回数最小性の裏取り）
    const pts = new Set<number>();
    for (let lb = 0; lb <= MAX_LIVE_BONUS; lb += 1) {
      for (const base of [100, 130]) {
        for (let n = 0; n <= DEFAULT_MAX_SCORE_N; n += 1) {
          const pt = calcLivePt(base, 990, n * SCORE_STEP, lb);
          if (pt > 0) pts.add(pt);
        }
      }
    }
    expect(pts.has(3_663)).toBe(false);
    expect([...pts].some((a) => pts.has(3_663 - a))).toBe(false);
  }, 30_000);

  it("最小値未満は UNREACHABLE と断定する（探索範囲の言い訳をしない）", () => {
    const r = planMultiLiveAdjustment(300, BONUS, REAL_BASES);
    expect(r.status).toBe("NG");
    expect(r.reason).toBe("NO_EXACT");
    expect(r.landability).toBe("UNREACHABLE");
    expect(300).toBeLessThan(r.minPtPerLive);
  });

  it("閾値はボーナスに追随する（同じ残額でもボーナス次第で判定が変わる）", () => {
    // ボーナス990%なら minPtPerLive=1090 なので 600 は着地不能。
    // ボーナス0%なら minPtPerLive=100 まで下がるので着地しうる。
    const high = planMultiLiveAdjustment(600, 990, [100]);
    expect(high.landability).toBe("UNREACHABLE");
    const low = planMultiLiveAdjustment(600, 0, [100]);
    expect(low.minPtPerLive).toBeLessThan(600);
    expect(low.status).toBe("OK");
  });

  it("安全域（4 × minPtPerLive 以上）の解なしは UNPROVEN に留める", () => {
    // 全数照合していない帯で「不能」と断定すると、実際には解がある残額を
    // 諦めさせてしまう。断定できるのは全数照合した帯だけ。
    const bonus = 990;
    const minPt = calcLivePt(100, bonus, 0, 0);
    const broken: string[] = [];
    for (let req = minPt * 4; req < minPt * 4 + 400; req += 1) {
      const r = planMultiLiveAdjustment(req, bonus, [100]);
      if (r.status === "NG" && r.landability !== "UNPROVEN") {
        broken.push(`req=${req}: landability=${r.landability}`);
      }
    }
    expect(broken).toEqual([]);
  }, 60_000);

  it("OK のときと負の要求では landability を付けない", () => {
    expect(planMultiLiveAdjustment(0, BONUS, REAL_BASES).landability).toBeUndefined();
    expect(planMultiLiveAdjustment(500_000, BONUS, REAL_BASES).landability).toBeUndefined();
    expect(planMultiLiveAdjustment(-100, BONUS, REAL_BASES).landability).toBeUndefined();
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

  it("非整数の基礎点を除外する（R3-4）", () => {
    // R3-4 新規: event_rate は整数のみ。113.5 を通すと「基礎点113.5」という
    // 実在曲ゼロのプランができるため Number.isInteger で弾く仕様になった。
    expect(distinctBasePoints([{ basePoint: 113.5 }, { basePoint: 114 }])).toEqual([114]);
    expect(distinctBasePoints([{ basePoint: 113.5 }])).toEqual([100]);
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

// 弱点3・5・6・7 のテストは multiLiveAdjustReachableTable.test.ts に分離してある
// （本ファイルが800行キャップに達したため。テスト対象: buildReachablePtTable /
// planFromReachablePtTable の等価性、MAX_PT_VALUES_PER_PLAN、sameCountVariants の
// lbCost 昇順の非自明ケース、findExhaustiveExact の事前フィルタが結果を変えないこと）。
