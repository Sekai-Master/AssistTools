import { describe, expect, it } from "vitest";
import {
  ADJUST_LIVE_BONUSES,
  maxLiveAdjustPt,
  planLiveAdjustment,
} from "./liveAdjust";
import { calcLivePt } from "./calcLivePt";
import { MAX_LIVE_BONUS, MAX_SCORE_N, SCORE_STEP } from "./constants";

/**
 * planLiveAdjustment の第3引数（許可ライブボーナス）まわりの安全網。
 *
 * 既定 [0,1] の挙動は「マイセカイを使う」既存経路そのものなので、
 * 第3引数の追加で1ミリでも変わったら即リグレッション。ここで凍結する。
 * LB 0〜10 解放はマイセカイ不使用モード（calculator.ts 側）が使う。
 */

/** マイセカイ不使用モードで解放される LB 0〜MAX_LIVE_BONUS の並び。 */
const ALL_LIVE_BONUSES = Array.from({ length: MAX_LIVE_BONUS + 1 }, (_, i) => i);

/** 端数調整は独りんぼエンヴィー（基礎点100）固定。 */
const ADJUST_BASE = 100;

describe("planLiveAdjustment — 既定挙動の凍結", () => {
  it("第3引数省略と [0,1] 明示指定で結果が完全一致する", () => {
    // OK になる値・NG になる値・0（調整不要）の3種で凍結する
    const cases: Array<{ liveRequired: number; bonus: number }> = [
      { liveRequired: 0, bonus: 435 },
      { liveRequired: 143, bonus: 435 },
      { liveRequired: 5_610, bonus: 435 },
      { liveRequired: 1_000_000, bonus: 435 },
      { liveRequired: 777, bonus: 120 },
    ];
    for (const { liveRequired, bonus } of cases) {
      expect(planLiveAdjustment(liveRequired, bonus)).toEqual(
        planLiveAdjustment(liveRequired, bonus, [0, 1])
      );
    }
  });

  it("ADJUST_LIVE_BONUSES は従来の 0〜1 のまま", () => {
    expect([...ADJUST_LIVE_BONUSES]).toEqual([0, 1]);
  });
});

describe("maxLiveAdjustPt", () => {
  it("最大スコア係数 × 最大LB の calcLivePt と一致する（単調性による厳密上限）", () => {
    const maxScore = MAX_SCORE_N * SCORE_STEP;
    for (const bonus of [435, 120, 700]) {
      expect(maxLiveAdjustPt(bonus, ADJUST_LIVE_BONUSES)).toBe(
        calcLivePt(ADJUST_BASE, bonus, maxScore, 1)
      );
      expect(maxLiveAdjustPt(bonus, ALL_LIVE_BONUSES)).toBe(
        calcLivePt(ADJUST_BASE, bonus, maxScore, MAX_LIVE_BONUS)
      );
    }
  });

  it("LB を解放するほど上限Pt が単調に増える", () => {
    // LB倍率（1,5,10,...,35）は狭義単調増加なので、上限も狭義単調増加になるはず
    for (let lb = 1; lb <= MAX_LIVE_BONUS; lb += 1) {
      const narrower = Array.from({ length: lb }, (_, i) => i); // 0..lb-1
      const wider = Array.from({ length: lb + 1 }, (_, i) => i); // 0..lb
      expect(maxLiveAdjustPt(435, wider)).toBeGreaterThan(maxLiveAdjustPt(435, narrower));
    }
  });
});

describe("planLiveAdjustment — 上限超過の枝刈り", () => {
  it("liveRequired が上限を超えると探索せず NG・plans 空・上限Pt を返す", () => {
    const liveRequired = 1_000_000;
    const bonus = 435;
    const r = planLiveAdjustment(liveRequired, bonus);
    expect(r.status).toBe("NG");
    expect(r.plans).toEqual([]);
    expect(r.targetScoreRange).toBeUndefined();
    // NG時の案内に使う上限Ptが式どおり返ること
    expect(r.maxAdjustablePt).toBe(
      calcLivePt(ADJUST_BASE, bonus, MAX_SCORE_N * SCORE_STEP, 1)
    );
    expect(liveRequired).toBeGreaterThan(r.maxAdjustablePt);
  });
});

describe("planLiveAdjustment — LB解放で吸収幅が広がる", () => {
  it("LB 0〜10 なら解けるが 0〜1 では解けないケースが存在する", () => {
    // LB7（倍率29）の最大スコア到達点をターゲットにする。
    // 倍率29は 0〜1 の倍率（1, 5）の整数倍と衝突しにくく、かつこの値は
    // LB0〜1 の上限Pt（倍率5×最大係数）を超えるので、0〜1 では原理的に届かない。
    const bonus = 435;
    const target = calcLivePt(ADJUST_BASE, bonus, MAX_SCORE_N * SCORE_STEP, 7);
    expect(target).toBeGreaterThan(maxLiveAdjustPt(bonus, ADJUST_LIVE_BONUSES));

    const narrow = planLiveAdjustment(target, bonus);
    expect(narrow.status).toBe("NG");

    const wide = planLiveAdjustment(target, bonus, ALL_LIVE_BONUSES);
    expect(wide.status).toBe("OK");
    expect(wide.targetScoreRange).toBeDefined();
    expect(wide.maxAdjustablePt).toBeGreaterThanOrEqual(target);
  });

  it("解放時でも上限を超える要求は NG のまま", () => {
    const bonus = 435;
    const cap = maxLiveAdjustPt(bonus, ALL_LIVE_BONUSES);
    const r = planLiveAdjustment(cap + 1, bonus, ALL_LIVE_BONUSES);
    expect(r.status).toBe("NG");
    expect(r.plans).toEqual([]);
    expect(r.maxAdjustablePt).toBe(cap);
  });
});
