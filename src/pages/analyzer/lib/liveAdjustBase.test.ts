import { describe, expect, it } from "vitest";
import { maxLiveAdjustPt, planLiveAdjustment } from "./liveAdjust";
import { calcLivePt } from "./calcLivePt";
import { DEFAULT_MAX_SCORE_N } from "./constants";

/**
 * planLiveAdjustment / maxLiveAdjustPt の base 引数（R5 / モードA 曲固定）の安全網。
 *
 * liveAdjust.test.ts（凍結・base=100 既定）には一切触れず、base≠100 の新挙動だけ
 * ここで固定する。掃引ループは無変更で、基礎点だけが貫通していることを確認する。
 */
const BONUS = 990;
const LB = [0, 1] as const;

describe("maxLiveAdjustPt — base 引数", () => {
  it("base を省略するとエビ(100)の上限、指定すると calcLivePt どおりに変わる", () => {
    const def = maxLiveAdjustPt(BONUS, LB, DEFAULT_MAX_SCORE_N);
    const base100 = maxLiveAdjustPt(BONUS, LB, DEFAULT_MAX_SCORE_N, 100);
    const base130 = maxLiveAdjustPt(BONUS, LB, DEFAULT_MAX_SCORE_N, 130);
    expect(base100).toBe(def); // 既定 = 100
    expect(base130).toBe(calcLivePt(130, BONUS, DEFAULT_MAX_SCORE_N * 20000, Math.max(...LB)));
    expect(base130).toBeGreaterThan(base100); // 基礎点が高いほど上限も高い
  });
});

describe("planLiveAdjustment — base 引数（曲固定のボーナス掃引）", () => {
  it("base=130 の単発ちょうど値は base=130 で 5.1 が成立する", () => {
    // 基礎点130・スコア10万・LB1 の獲得Ptを、その基礎点で1本ちょうど取れること
    const req = calcLivePt(130, BONUS, 100_000, 1);
    const r = planLiveAdjustment(req, BONUS, LB, DEFAULT_MAX_SCORE_N, 130);
    expect(r.status).toBe("OK");
    // 5.1（現ボーナスのまま）で拾えている＝targetScoreRange が付く
    expect(r.targetScoreRange).toBeDefined();
  });

  it("同じ req でも base 省略(100)では 5.1 が外れうる（基礎点が結果に効いている証拠）", () => {
    // base130 由来の値は、base100 の calcLivePt 格子には一般には乗らない。
    // 5.1 が外れても 5.2（編成組み替え）で拾われうるので status は問わず、
    // 「targetScoreRange の有無が base で変わる」ことだけを見る。
    const req = calcLivePt(130, BONUS, 100_000, 1);
    const withBase = planLiveAdjustment(req, BONUS, LB, DEFAULT_MAX_SCORE_N, 130);
    const defaultBase = planLiveAdjustment(req, BONUS, LB, DEFAULT_MAX_SCORE_N);
    // base130 では 5.1 命中、既定(100)では 5.1 非命中（格子が違う）
    expect(withBase.targetScoreRange).toBeDefined();
    expect(defaultBase.targetScoreRange).toBeUndefined();
  });

  it("liveRequired 0 は base に関わらず OK（調整不要）", () => {
    expect(planLiveAdjustment(0, BONUS, LB, DEFAULT_MAX_SCORE_N, 130).status).toBe("OK");
  });
});
