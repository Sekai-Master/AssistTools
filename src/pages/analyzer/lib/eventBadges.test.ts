import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BADGE_NOTE,
  BADGE_REDUCTION,
  DEFAULT_EVENT_ITEM_REDUCTION,
  EVENT_ITEM_REDUCTION,
  badgeNote,
  badgesForMySekai,
  badgesForPlay,
  badgesForUnits,
  formatBadges,
  parseEventItemReduction,
} from "./eventBadges";
import { calcLivePt } from "./calcLivePt";
import { allocateMySekai, calculateUnitBasePt } from "./mySekai";

/**
 * イベントバッジ換算（eventBadges.ts）の安全網。
 *
 * ★★ 今の除数（7 や 10）を前提にした期待値を書かない。★★
 *   除数はデータ更新（refresh-card-data.yml）が書き換え、そのワークフローは npm test を門番にしている。
 *   今の値を決め打ちすると、マスタが 10 に戻った回にデータ更新ごと止まる。
 *   除数ごとの数え方は、除数を引数で渡して確かめる。
 *
 * ★ ゲームのリザルトの実例（何Ptで何バッジか）との照合は、除数 10 で 3 件（2026-10-26）と
 *   除数 7 で 5 件（11/19 以降の 517 Pt と、2026-11-24 のひとりでライブ 2・オート 1・マイセカイ 1）。
 *   末尾の「ゲーム内の実例との照合」がそれ。ほかは「式どおりに数えているか」を固めている。
 *   ワールドリンクの実例はまだ無い。
 */

describe("EVENT_ITEM_REDUCTION — マスタの値に追従する", () => {
  it("生成ファイル public/CardDatas/badgeConfig.json の値をそのまま使う", () => {
    const file = JSON.parse(readFileSync("public/CardDatas/badgeConfig.json", "utf8")) as {
      eventItemReduction?: unknown;
    };
    // 生成ファイル自体が壊れていない（既定値に落ちていない）ことも兼ねて確かめる。
    expect(typeof file.eventItemReduction).toBe("number");
    expect(file.eventItemReduction).toBeGreaterThan(0);
    expect(EVENT_ITEM_REDUCTION).toBe(file.eventItemReduction);
  });

  it("ライブとマイセカイに同じ値を使う（ひとりでライブ・オート・マイセカイのどれにも効くことを実機で確認）", () => {
    expect(BADGE_REDUCTION.live).toBe(EVENT_ITEM_REDUCTION);
    expect(BADGE_REDUCTION.mySekai).toBe(EVENT_ITEM_REDUCTION);
  });
});

describe("parseEventItemReduction — 生成ファイルが壊れていたときの落ち方", () => {
  it("1 以上の整数（数と数の文字列）はそのまま使う", () => {
    expect(parseEventItemReduction(7)).toBe(7);
    expect(parseEventItemReduction("7")).toBe(7);
    expect(parseEventItemReduction(10)).toBe(10);
    expect(parseEventItemReduction(1)).toBe(1);
  });

  it.each([
    ["ファイルが無い・JSON として読めない（vite.config.ts が null を渡す）", null],
    ["項目が無い", undefined],
    ["数でない文字列", "abc"],
    ["空文字", ""],
    ["0", 0],
    ["負の数", -7],
    ["1 未満の小数", 0.5],
    ["ごく小さい数", 1e-9],
    ["整数でない", "7.5"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["オブジェクト", { value: 7 }],
  ])("%s なら既定の 10 に落とす", (_label, raw) => {
    expect(parseEventItemReduction(raw)).toBe(DEFAULT_EVENT_ITEM_REDUCTION);
    expect(DEFAULT_EVENT_ITEM_REDUCTION).toBe(10);
  });

  it("落ちた先でも数えられる（517 Pt → 10 で割って 51）", () => {
    expect(badgesForPlay(517, parseEventItemReduction("abc"))).toBe(51);
  });
});

describe("badgesForPlay — 1回ぶん", () => {
  it("獲得Ptを除数で割って切り捨てる", () => {
    expect(badgesForPlay(4_730, 10)).toBe(473);
    expect(badgesForPlay(4_739, 10)).toBe(473);
    expect(badgesForPlay(9, 10)).toBe(0);
    expect(badgesForPlay(4_730, 7)).toBe(675);
    expect(badgesForPlay(6, 7)).toBe(0);
  });

  it("除数を渡さなければマスタの値で数える", () => {
    expect(badgesForPlay(4_730)).toBe(Math.floor(4_730 / EVENT_ITEM_REDUCTION));
  });

  it("実測で確定している Pt（基礎点114・ボーナス416%・スコア1,224,240 → 946 Pt）を通しても除数で割った値になる", () => {
    // Pt の 946 は calcLivePt.test.ts の実機実測値。バッジ数は未実測（式からの値）。
    const pt = calcLivePt(114, 416, 1_224_240, 0);
    expect(pt).toBe(946);
    expect(badgesForPlay(pt, 10)).toBe(94);
    expect(badgesForPlay(pt, 7)).toBe(135);
  });

  it("Ptを出してから切り捨てる（炊き倍率を掛ける前には切り捨てない）", () => {
    // 1炊き（倍率5）で 947×5 = 4,735 Pt。掛ける前に切り捨てる方式なら 94×5 = 470 になる。
    expect(badgesForPlay(4_735, 10)).toBe(473);
  });

  it("0・負値・非数は 0", () => {
    expect(badgesForPlay(0)).toBe(0);
    expect(badgesForPlay(-50)).toBe(0);
    expect(badgesForPlay(Number.NaN)).toBe(0);
    expect(badgesForPlay(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("badgesForUnits — まとめて叩くプレイ", () => {
  it("合計Ptを割らず、1回ごとに切り捨ててから足す", () => {
    // 4,735 Pt × 3回 = 14,205 Pt。÷10: 合計を割ると 1,420 だが、配られるのは 473 × 3 = 1,419。
    expect(badgesForUnits([{ pt: 4_735, count: 3 }], 10)).toBe(1_419);
    // ÷7: 合計を割ると 2,029 だが、配られるのは 676 × 3 = 2,028。
    expect(badgesForUnits([{ pt: 4_735, count: 3 }], 7)).toBe(2_028);
  });

  it("複数ユニットを足し合わせる", () => {
    const units = [
      { pt: 62_437, count: 1 },
      { pt: 18_095, count: 2 },
    ];
    expect(badgesForUnits(units, 10)).toBe(6_243 + 1_809 * 2);
    expect(badgesForUnits(units, 7)).toBe(8_919 + 2_585 * 2);
  });

  it("回数0・空は 0", () => {
    expect(badgesForUnits([])).toBe(0);
    expect(badgesForUnits([{ pt: 5_000, count: 0 }])).toBe(0);
  });
});

describe("badgesForMySekai — 採取", () => {
  const unit = calculateUnitBasePt(297_159, 615, false); // 実測で 1100 Pt の条件
  const counts = { countA: 7, countB: 3, countC: 4 };
  const totalPt = unit * 7 + (unit / 2) * 3 + (unit / 5) * 4; // 10,230 Pt

  it("採った物1個ごとに切り捨ててから足す", () => {
    expect(unit).toBe(1_100);
    // 1回: 木石 1,100 / キラキラ 550 / 草花 220 Pt
    expect(badgesForMySekai(counts, unit, 10)).toBe(110 * 7 + 55 * 3 + 22 * 4);
    expect(badgesForMySekai(counts, unit, 7)).toBe(157 * 7 + 78 * 3 + 31 * 4);
  });

  it("÷10 では合計Ptの1/10と一致する（1個のPtが10の倍数のため。これまでの数え方と同じ）", () => {
    expect(badgesForMySekai(counts, unit, 10)).toBe(Math.floor(totalPt / 10));
  });

  it("÷7 では合計Ptを割った値と一致しない（合計で割ると種類をまたいで端数が繰り上がる）", () => {
    expect(badgesForMySekai(counts, unit, 7)).toBe(1_457);
    expect(Math.floor(totalPt / 7)).toBe(1_461);
  });

  it.each([false, true])("実際の配分（allocateMySekai・500倍=%s）でも採取ごとの和になる", (boost) => {
    const u = calculateUnitBasePt(313_460, 416, boost);
    const a = allocateMySekai(987_654, u);
    expect(a.totalPt).toBeGreaterThan(0);
    for (const r of [7, 10]) {
      const summed =
        a.countA * Math.floor(u / r) +
        a.countB * Math.floor(Math.floor(u * 0.5) / r) +
        a.countC * Math.floor(Math.floor(u * 0.2) / r);
      expect(badgesForMySekai(a, u, r)).toBe(summed);
    }
    expect(badgesForMySekai(a, u, 10)).toBe(Math.floor(a.totalPt / 10));
  });

  it("除数を渡さなければマスタの値で数える", () => {
    expect(badgesForMySekai(counts, unit)).toBe(badgesForMySekai(counts, unit, EVENT_ITEM_REDUCTION));
  });

  it("何も採らない・単価が壊れているなら 0", () => {
    expect(badgesForMySekai({ countA: 0, countB: 0, countC: 0 }, unit)).toBe(0);
    expect(badgesForMySekai(counts, Number.NaN)).toBe(0);
  });
});

describe("badgeNote — 画面の注記", () => {
  it("今の除数を出し、普段と違うときは普段の値を添える", () => {
    expect(badgeNote(7)).toContain("「獲得Pt÷7（切り捨て）」");
    expect(badgeNote(7)).toContain("（普段は10）");
  });

  it("普段の 10 のときは添えない", () => {
    expect(badgeNote(10)).toContain("「獲得Pt÷10（切り捨て）」");
    expect(badgeNote(10)).not.toContain("普段");
  });

  it("画面の注記はマスタの値で作る", () => {
    expect(BADGE_NOTE).toBe(badgeNote(EVENT_ITEM_REDUCTION));
  });
});

describe("formatBadges", () => {
  it("桁区切りと単位を付ける", () => {
    expect(formatBadges(12_345)).toBe("バッジ 12,345個");
  });
});

describe("ゲーム内の実例との照合", () => {
  it("除数 7: 11/19 以降の実機の画面（517 Pt → 73 バッジ）と一致する。÷10 なら 51", () => {
    expect(badgesForPlay(517, 7)).toBe(73);
    expect(badgesForPlay(517, 10)).toBe(51);
  });

  // 2026-11-24 19時ごろ、226 ワンダーランズ×ショウタイム Memories・ボーナス +390%・総合力 238,561。
  it.each([
    ["ひとりでライブ・1炊き", 4_660, 665, 466],
    ["ひとりでライブ・5炊き", 22_325, 3_189, 2_232],
    ["オート・5炊き", 23_250, 3_321, 2_325],
  ])("除数 7: %s の実機のリザルト（%i Pt → %i バッジ。2026-11-24）と一致する。÷10 なら %i", (_label, pt, got, byTen) => {
    expect(badgesForPlay(pt, 7)).toBe(got);
    expect(badgesForPlay(pt, 10)).toBe(byTen);
  });

  it("除数 7: 所持 1,890 → 5,079 → 8,400（2026-11-24）が1回ごとの和と一致する", () => {
    expect(1_890 + badgesForPlay(22_325, 7)).toBe(5_079);
    expect(5_079 + badgesForPlay(23_250, 7)).toBe(8_400);
  });

  it("除数 7: マイセカイの採取（1,400 Pt → 200 バッジ。2026-11-24）と一致する。ただし1個ごとか合計からかは見分けられない", () => {
    // ブーストなし（×100）。単価 700 は実機の 1個あたりの Pt（0.2 メモリ 140・0.5 メモリ 350）と合う
    const unit = calculateUnitBasePt(238_561, 390, false);
    expect(unit).toBe(700); // baseVal 7。140・350 Pt はどちらも 7 で割り切れる
    // 1回の採取で 0.2 メモリの物 5 個・0.5 メモリの物 2 個
    const got = { countA: 0, countB: 2, countC: 5 };
    expect(unit * 0.2 * 5 + unit * 0.5 * 2).toBe(1_400);
    expect(badgesForMySekai(got, unit, 7)).toBe(200);
    expect(badgesForMySekai(got, unit, 10)).toBe(140);
    // 合計から割っても 200 になり、1個ごとか合計からかはこの回では分からない（★5 は残る）
    expect(Math.floor(1_400 / 7)).toBe(200);
  });

  it("★5 を見分ける計測の例: baseVal 6（単価 600）で 0.5 メモリの物 2 個なら、1個ごとは 84・合計からは 85", () => {
    const unit = calculateUnitBasePt(250_000, 330, false); // 総合力 22.5万以上27万未満・ボーナス 300〜366%
    expect(unit).toBe(600);
    expect(badgesForMySekai({ countA: 0, countB: 2, countC: 0 }, unit, 7)).toBe(84);
    expect(Math.floor((300 * 2) / 7)).toBe(85);
  });

  // 以下 3 件は除数が 10 だった 2026-10-26 の照合。丸め方・炊き倍率・1回ごとかは除数によらない。
  it("10炊き・ソロの実機のリザルト（32,970 Pt → 3,297 バッジ。2026-10-26）と一致する＝eventPointRate（35）側に乗る", () => {
    expect(badgesForPlay(32_970, 10)).toBe(3_297);
    // rewardRate（30）側なら floor(32,970 × 30 / 35 / 10) = 2,826
    expect(badgesForPlay(32_970, 10)).not.toBe(Math.floor((32_970 * 30) / 35 / 10));
  });

  it("1炊き・ソロの実機のリザルト（4,835 Pt・累計 64,180 → 483 バッジ。2026-10-26）と一致する＝累計から出さず1回ごとに切り捨てる", () => {
    const total = 64_180;
    const before = total - 4_835; // 59,345。一の位どうしの和が10になり、二つの式の答えが分かれる回
    expect(badgesForPlay(4_835, 10)).toBe(483);
    // 累計から出していたなら floor(64,180 / 10) - floor(59,345 / 10) = 484
    expect(badgesForPlay(4_835, 10)).not.toBe(Math.floor(total / 10) - Math.floor(before / 10));
  });
  it("5炊き・ソロの実機のリザルト（4,655 Pt → 465 バッジ。2026-10-26）と一致する＝炊き倍率を掛けた後で切り捨てる", () => {
    expect(badgesForPlay(4_655, 10)).toBe(465);
    // 掛ける前に切り捨てていたなら floor(4,655 / 25 / 10) * 25 = 450
    expect(badgesForPlay(4_655, 10)).not.toBe(Math.floor(4_655 / 25 / 10) * 25);
  });
});
