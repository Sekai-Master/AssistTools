import { describe, expect, it } from "vitest";
import {
  EVENT_ITEM_REDUCTION,
  badgesForMySekai,
  badgesForPlay,
  badgesForUnits,
  formatBadges,
} from "./eventBadges";
import { calcLivePt } from "./calcLivePt";
import { allocateMySekai, calculateUnitBasePt } from "./mySekai";

/**
 * イベントバッジ換算（eventBadges.ts）の安全網。
 *
 * ★ ゲームのリザルトの実例（何Ptで何バッジか）との照合は 2026-10-26 時点で 1 件（5炊き）。
 *   それ以外は「式どおりに数えているか」を固めているだけで、式そのものの正しさではない。
 *   10炊きの実例が取れたら下の it.todo を本物の照合に差し替えること。
 */

describe("EVENT_ITEM_REDUCTION", () => {
  it("マスタ configs.json の event_item_reduction（10）と一致する", () => {
    expect(EVENT_ITEM_REDUCTION).toBe(10);
  });
});

describe("badgesForPlay — 1回ぶん", () => {
  it("獲得Ptの1/10を切り捨てる", () => {
    expect(badgesForPlay(4_730)).toBe(473);
    expect(badgesForPlay(4_739)).toBe(473);
    expect(badgesForPlay(9)).toBe(0);
  });

  it("実測で確定している Pt（基礎点114・ボーナス416%・スコア1,224,240 → 946 Pt）を通しても1/10になる", () => {
    // Pt の 946 は calcLivePt.test.ts の実機実測値。バッジ数は未実測（式からの値）。
    const pt = calcLivePt(114, 416, 1_224_240, 0);
    expect(pt).toBe(946);
    expect(badgesForPlay(pt)).toBe(94);
  });

  it("Ptを出してから切り捨てる（炊き倍率を掛ける前には切り捨てない）", () => {
    // 1炊き（倍率5）で 947×5 = 4,735 Pt。掛ける前に切り捨てる方式なら 94×5 = 470 になる。
    expect(badgesForPlay(4_735)).toBe(473);
  });

  it("0・負値・非数は 0", () => {
    expect(badgesForPlay(0)).toBe(0);
    expect(badgesForPlay(-50)).toBe(0);
    expect(badgesForPlay(Number.NaN)).toBe(0);
    expect(badgesForPlay(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("badgesForUnits — まとめて叩くプレイ", () => {
  it("合計Ptの1/10ではなく、1回ごとに切り捨ててから足す", () => {
    // 4,735 Pt × 3回 = 14,205 Pt。合計を割ると 1,420 だが、配られるのは 473 × 3 = 1,419。
    expect(badgesForUnits([{ pt: 4_735, count: 3 }])).toBe(1_419);
  });

  it("複数ユニットを足し合わせる", () => {
    expect(
      badgesForUnits([
        { pt: 62_437, count: 1 },
        { pt: 18_095, count: 2 },
      ]),
    ).toBe(6_243 + 1_809 * 2);
  });

  it("回数0・空は 0", () => {
    expect(badgesForUnits([])).toBe(0);
    expect(badgesForUnits([{ pt: 5_000, count: 0 }])).toBe(0);
  });
});

describe("badgesForMySekai — 採取", () => {
  it("採取1回ごとの切り捨ての和が合計Ptの1/10と一致する（単価が100の倍数のため）", () => {
    const unit = calculateUnitBasePt(297_159, 615, false); // 実測で 1100 Pt の条件
    expect(unit).toBe(1_100);
    const perHarvest = [unit, Math.floor(unit * 0.5), Math.floor(unit * 0.2)];
    const counts = [7, 3, 4];
    const totalPt = perHarvest.reduce((s, p, i) => s + p * counts[i], 0);
    const summed = perHarvest.reduce((s, p, i) => s + badgesForPlay(p) * counts[i], 0);
    expect(badgesForMySekai(totalPt)).toBe(summed);
  });

  it.each([false, true])("実際の配分（allocateMySekai・500倍=%s）の合計Ptでも採取ごとの和と一致する", (boost) => {
    const unit = calculateUnitBasePt(313_460, 416, boost);
    const a = allocateMySekai(987_654, unit);
    const summed =
      a.countA * badgesForPlay(unit) +
      a.countB * badgesForPlay(Math.floor(unit * 0.5)) +
      a.countC * badgesForPlay(Math.floor(unit * 0.2));
    expect(a.totalPt).toBeGreaterThan(0);
    expect(badgesForMySekai(a.totalPt)).toBe(summed);
  });
});

describe("formatBadges", () => {
  it("桁区切りと単位を付ける", () => {
    expect(formatBadges(12_345)).toBe("バッジ 12,345個");
  });
});

describe("ゲーム内の実例との照合", () => {
  it.todo("10炊きで1回叩いたリザルトの Pt とバッジ（eventPointRate と rewardRate のどちらに乗るか）");
  it("5炊き・ソロの実機のリザルト（4,655 Pt → 465 バッジ。2026-10-26）と一致する＝炊き倍率を掛けた後で切り捨てる", () => {
    expect(badgesForPlay(4_655)).toBe(465);
    // 掛ける前に切り捨てていたなら floor(4,655 / 25 / 10) * 25 = 450
    expect(badgesForPlay(4_655)).not.toBe(Math.floor(4_655 / 25 / 10) * 25);
  });
});
