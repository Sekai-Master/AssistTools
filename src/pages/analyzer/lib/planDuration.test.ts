import { describe, expect, it } from "vitest";
import { formatApproxMinutes, planDurationSec, unitDurationSec } from "./planDuration";
import { ADJUST_LIVE_OVERHEAD_SEC } from "./constants";
import type { MultiLivePlan } from "./multiLiveAdjust";

/**
 * 所要時間の導出（P0-1）の安全網。
 *
 * ブリーフの受け入れ条件は「所要時間の算出が `music_time + 47秒 × 本数` と一致」。
 * ここが崩れると「本数を増やしてLBを節約」の非推奨判断（＝この改修の主目的）の
 * 根拠そのものが嘘になるので、実測ケースの秒数を式ごと固定する。
 *
 * 時間を MultiLiveUnit に持たせず表示層で導出するのは、採択曲がユーザー操作で
 * 変わるため（探索結果に焼き込むと曲変更で嘘になる）。この関数群はその境界。
 */

/** 基礎点だけを持つ最小の units（時間計算は basePoint と count しか見ない）。 */
function planWith(units: Array<{ basePoint: number; count: number }>): Pick<MultiLivePlan, "units"> {
  return {
    units: units.map((u) => ({
      basePoint: u.basePoint,
      liveBonus: 0,
      minScore: 0,
      maxScore: 19_999,
      pt: 1,
      count: u.count,
    })),
  };
}

describe("unitDurationSec", () => {
  it("(演奏秒 + オーバーヘッド) × 回数", () => {
    expect(unitDurationSec(182.1, 1)).toBe(182.1 + ADJUST_LIVE_OVERHEAD_SEC);
    expect(unitDurationSec(74.8, 3)).toBeCloseTo((74.8 + ADJUST_LIVE_OVERHEAD_SEC) * 3, 6);
  });

  it("回数0は0秒", () => {
    expect(unitDurationSec(182.1, 0)).toBe(0);
  });
});

describe("planDurationSec", () => {
  it("ブリーフ実測ケース: メルト(182.1秒) + とても素敵な六月でした(154秒) の2本", () => {
    // 受け入れ条件の式そのもの。基礎点130=182.1秒 / 基礎点123=154秒 とする。
    const times: Record<number, number> = { 130: 182.1, 123: 154 };
    const plan = planWith([
      { basePoint: 130, count: 1 },
      { basePoint: 123, count: 1 },
    ]);
    const sec = planDurationSec(plan, (base) => times[base]);
    expect(sec).toBeCloseTo(182.1 + 47 + (154 + 47), 6);
  });

  it("同一条件を複数回叩くユニットは回数ぶん積む", () => {
    const plan = planWith([{ basePoint: 100, count: 9 }]);
    expect(planDurationSec(plan, () => 74.8)).toBeCloseTo((74.8 + 47) * 9, 6);
  });

  it("1ユニットでも時間不明なら undefined（0秒扱いで嘘をつかない）", () => {
    const plan = planWith([
      { basePoint: 130, count: 1 },
      { basePoint: 123, count: 1 },
    ]);
    // 曲が引けない基礎点が混じるケース
    expect(planDurationSec(plan, (base) => (base === 130 ? 182.1 : undefined))).toBeUndefined();
    // music_time が 0（マスタ欠損）も不明扱い
    expect(planDurationSec(plan, (base) => (base === 130 ? 182.1 : 0))).toBeUndefined();
    // NaN / 負値などの壊れた値も不明扱い
    expect(planDurationSec(plan, () => NaN)).toBeUndefined();
    expect(planDurationSec(plan, () => -1)).toBeUndefined();
  });

  it("units が空なら0秒（調整不要プランの表示崩れ防止）", () => {
    expect(planDurationSec({ units: [] }, () => 100)).toBe(0);
  });
});

describe("formatApproxMinutes", () => {
  it("切り上げで「約N分」", () => {
    expect(formatApproxMinutes(60)).toBe("約1分");
    expect(formatApproxMinutes(61)).toBe("約2分");
    expect(formatApproxMinutes(458)).toBe("約8分");
  });

  it("1分未満でも「約1分」に底上げする（約0分と出さない）", () => {
    expect(formatApproxMinutes(0)).toBe("約1分");
    expect(formatApproxMinutes(1)).toBe("約1分");
    expect(formatApproxMinutes(-10)).toBe("約1分");
  });

  it("ブリーフ実測ケースの秒数を式に通すと8分になる（ブリーフ本文の「約7分」とは不一致）", () => {
    // ブリーフ（診断1の表）はメルト(182.1秒)+とても素敵な六月でした(154秒)の2本を
    // 「約7分」と記載しているが、本関数の式 (演奏秒+ADJUST_LIVE_OVERHEAD_SEC)×回数 で
    // 両ユニット分を積むと 182.1+47 + 154+47 = 430.1秒 → ceil(430.1/60) = 8分 になる。
    // ブリーフの「7分」は2026-07-23の実戦ログでの体感申告値であり、47秒という
    // 単一オーバーヘッド定数・切り上げ規則を経由した厳密な式の再計算ではない
    // （待機・リザルト表示の実秒には幅がある）。これは実装のバグではなく、
    // ブリーフの概算値と本関数の出力が一致しない既知の差異なので、
    // 迂回コメントで濁さずここに明記する。
    expect(formatApproxMinutes(182.1 + 47 + (154 + 47))).toBe("約8分");
    // 参考: 同じ2本構成でも曲秒数の内訳が違えば「約7分」になり、式自体は正しく動く。
    expect(formatApproxMinutes(400)).toBe("約7分");
  });
});
