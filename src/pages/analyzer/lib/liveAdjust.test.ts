import { describe, expect, it } from "vitest";
import {
  ADJUST_LIVE_BONUSES,
  maxLiveAdjustPt,
  planLiveAdjustment,
} from "./liveAdjust";
import { calcLivePt } from "./calcLivePt";
import { DEFAULT_MAX_SCORE_N, MAX_LIVE_BONUS, SCORE_STEP } from "./constants";

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
    // R3-0 改訂: 探索上限が MAX_SCORE_N(=200, スコア400万) から
    // DEFAULT_MAX_SCORE_N(=55, スコア110万) に変わった。400万点はソロライブで
    // 人間に到達不能なため、既定の上限Ptもスコア110万基準で評価される。
    const maxScore = DEFAULT_MAX_SCORE_N * SCORE_STEP;
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
    // R3-0 改訂: 上限の基準を MAX_SCORE_N → DEFAULT_MAX_SCORE_N に変更（スコア上限110万の既定化）
    expect(r.maxAdjustablePt).toBe(
      calcLivePt(ADJUST_BASE, bonus, DEFAULT_MAX_SCORE_N * SCORE_STEP, 1)
    );
    expect(liveRequired).toBeGreaterThan(r.maxAdjustablePt);
  });
});

describe("maxLiveAdjustPt — 小数ボーナスの丸め回帰（R3-4）", () => {
  it("小数ボーナスでも上限が式（丸めない bonus での1点評価）と厳密一致する", () => {
    // R3-4 回帰テスト: 旧実装は Math.floor(bonus * 10) / 10 で 0.1% 刻みに丸めてから
    // 評価していたため、経路5.1（丸めない生の bonus で探索）より上限が過小評価され、
    // 早期 return が解ける入力を誤って弾いていた。丸めなしの1点評価と一致すること。
    const maxLbNarrow = Math.max(...ADJUST_LIVE_BONUSES);
    const maxLbWide = Math.max(...ALL_LIVE_BONUSES);
    for (const bonus of [200.34, 435.67, 0.05, 999.99]) {
      for (const maxScoreN of [55, 200]) {
        expect(maxLiveAdjustPt(bonus, ADJUST_LIVE_BONUSES, maxScoreN)).toBe(
          calcLivePt(ADJUST_BASE, bonus, maxScoreN * SCORE_STEP, maxLbNarrow)
        );
        expect(maxLiveAdjustPt(bonus, ALL_LIVE_BONUSES, maxScoreN)).toBe(
          calcLivePt(ADJUST_BASE, bonus, maxScoreN * SCORE_STEP, maxLbWide)
        );
      }
    }
  });

  it("ブリーフ再現ケース: bonus 200.34% の 4505 Pt が誤NGにならない", () => {
    // R3-4 の実害再現（docs のブリーフに記載の入力）。
    // findScoreStep(100, 200.34, 1, 4505) === 200 なので N=200 まで探索できれば OK。
    // 丸めガードは 4500 と過小評価して探索前に NG を返していた。
    // maxScoreN=200 は旧上限（スコア400万）の再現用で、既定の 55 ではスコア帯が
    // 探索範囲外になるため意図的に明示している。
    const r = planLiveAdjustment(4505, 200.34, [0, 1], 200);
    expect(r.status).toBe("OK");
    expect(r.targetScoreRange).toBeDefined();
  });
});

describe("planLiveAdjustment — LB解放で吸収幅が広がる", () => {
  it("LB 0〜10 なら解けるが 0〜1 では解けないケースが存在する", () => {
    // LB7（倍率29）の最大スコア到達点をターゲットにする。
    // 倍率29は 0〜1 の倍率（1, 5）の整数倍と衝突しにくく、かつこの値は
    // LB0〜1 の上限Pt（倍率5×最大係数）を超えるので、0〜1 では原理的に届かない。
    // R3-0 改訂: 探索上限が DEFAULT_MAX_SCORE_N（スコア110万）基準になったため、
    // ターゲットも同じ上限から導出する（性質自体は上限値に依らず成立する）。
    const bonus = 435;
    const target = calcLivePt(ADJUST_BASE, bonus, DEFAULT_MAX_SCORE_N * SCORE_STEP, 7);
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
