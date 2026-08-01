import { describe, expect, it } from "vitest";
import { auditLeaks, derive, isPublished, slimCard, withoutDangling } from "./deriveCardData.mjs";

const NOW = Date.UTC(2026, 7, 1); // 2026-08-01
const 過去 = NOW - 86_400_000;
const 未来 = NOW + 5 * 86_400_000;

const card = (id, releaseAt, extra = {}) => ({
  id,
  characterId: 1,
  cardRarityType: "rarity_4",
  attr: "cute",
  supportUnit: "none",
  skillId: 1,
  prefix: `カード${id}`,
  assetbundleName: `res${id}`,
  releaseAt,
  cardParameters: [
    { cardId: id, cardLevel: 1, cardParameterType: "param1", power: 100 },
    { cardId: id, cardLevel: 2, cardParameterType: "param1", power: 200 },
  ],
  ...extra,
});

const src = () => ({
  cards: [card(1, 過去), card(2, 過去), card(999, 未来)],
  events: [
    { id: 10, name: "開催中", eventType: "marathon", unit: "light_sound", startAt: 過去, aggregateAt: 未来 },
    { id: 99, name: "未発表イベント", eventType: "marathon", unit: "none", startAt: 未来, aggregateAt: 未来 },
  ],
  eventCards: [
    { cardId: 1, eventId: 10, bonusRate: 30, leaderBonusRate: 0 },
    { cardId: 999, eventId: 10, bonusRate: 50, leaderBonusRate: 10 }, // 未公開カードのPU
    { cardId: 2, eventId: 99, bonusRate: 20, leaderBonusRate: 0 }, // 未発表イベントのPU
  ],
  eventDeckBonuses: [
    { eventId: 10, gameCharacterUnitId: 1, bonusRate: 25 },
    { eventId: 99, gameCharacterUnitId: 1, bonusRate: 25 },
  ],
  eventCardBonusLimits: [
    { eventId: 10, memberCountLimit: 4 },
    { eventId: 99, memberCountLimit: 3 },
  ],
  eventRarityBonusRates: [{ cardRarityType: "rarity_4", masterRank: 5, bonusRate: 25 }],
  masterLessons: [
    { cardRarityType: "rarity_4", masterRank: 1, power1BonusFixed: 200, power2BonusFixed: 200, power3BonusFixed: 200 },
  ],
  characterRanks: [{ characterId: 1, characterRank: 100, power1BonusRate: 3 }],
  areaItemLevels: [
    { areaItemId: 5, level: 20, targetUnit: "light_sound", targetCardAttr: "cute", power1BonusRate: 10, power1AllMatchBonusRate: 20 },
  ],
});

/** 出力のどこかに、その数値が現れていないか（雑だが確実な最終確認）。 */
const 出力に含まれない = (out, needle) => !JSON.stringify(out).includes(String(needle));

describe("公開判定", () => {
  it("解禁日が未来なら未公開", () => {
    expect(isPublished({ releaseAt: 未来 }, NOW)).toBe(false);
    expect(isPublished({ releaseAt: 過去 }, NOW)).toBe(true);
  });

  // 猶予を入れないことを仕様として固定する。「あと1時間で解禁」でも出さない。
  it("解禁の1秒前でも未公開（先読みの猶予を入れない）", () => {
    expect(isPublished({ releaseAt: NOW + 1000 }, NOW)).toBe(false);
    expect(isPublished({ releaseAt: NOW }, NOW)).toBe(true);
  });

  // 日付欄の無い古い項目まで捨てると、既存の内容が消える。
  it("日付欄が無いものは公開済みとみなす", () => {
    expect(isPublished({ id: 1 }, NOW)).toBe(true);
  });

  it("複数の日付欄のどれか1つでも未来なら未公開", () => {
    expect(isPublished({ releaseAt: 過去, archivePublishedAt: 未来 }, NOW)).toBe(false);
  });
});

describe("未公開データの遮断", () => {
  const out = derive(src(), NOW);

  it("未公開カードが出力に無い", () => {
    expect(out.cards.map((c) => c.id)).toEqual([1, 2]);
  });

  it("未発表イベントが出力に無い", () => {
    expect(out.events.map((e) => e.id)).toEqual([10]);
  });

  // ★ カード本体を消しても、ボーナス表に cardId が残れば「まだ見ぬカードがある」
  //   ことも「それがPU対象である」ことも漏れる。
  it("未公開カードを参照するボーナス行も消える", () => {
    expect(out.cardBonuses.some((b) => b.cardId === 999)).toBe(false);
    expect(out.cardBonuses).toHaveLength(1);
  });

  it("未発表イベントを参照する行も全部消える", () => {
    expect(out.deckBonuses.every((b) => b.eventId === 10)).toBe(true);
    expect(out.bonusLimits.every((b) => b.eventId === 10)).toBe(true);
    expect(out.cardBonuses.every((b) => b.eventId === 10)).toBe(true);
  });

  // 名前が残っていたら、そこから内容が割れる。
  it("未発表イベントの名前が出力のどこにも無い", () => {
    expect(出力に含まれない(out, "未発表イベント")).toBe(true);
  });

  it("未公開カードの名前とアセット名が出力のどこにも無い", () => {
    expect(出力に含まれない(out, "カード999")).toBe(true);
    expect(出力に含まれない(out, "res999")).toBe(true);
  });

  it("公開済みのものは残る（塞ぎすぎない）", () => {
    expect(out.cards).toHaveLength(2);
    expect(out.cardBonuses[0]).toMatchObject({ cardId: 1, eventId: 10, rate: 30 });
    expect(out.rarityBonuses).toHaveLength(1);
    expect(out.masterBonuses).toHaveLength(1);
    expect(out.areaItems).toHaveLength(1);
  });
});

describe("最終検算", () => {
  it("正しく作れば問題なし", () => {
    const out = derive(src(), NOW);
    const allowed = {
      cardIds: new Set(out.cards.map((c) => c.id)),
      eventIds: new Set(out.events.map((e) => e.id)),
    };
    expect(auditLeaks(out, allowed)).toEqual([]);
  });

  // テーブルを1つ足したときに通し忘れる、を捕まえるための網。
  it("参照の取りこぼしを見つける", () => {
    const out = derive(src(), NOW);
    out.cardBonuses.push({ eventId: 10, cardId: 999, rate: 50, leaderRate: 0 });
    const allowed = {
      cardIds: new Set(out.cards.map((c) => c.id)),
      eventIds: new Set(out.events.map((e) => e.id)),
    };
    expect(auditLeaks(out, allowed)).toHaveLength(1);
    expect(auditLeaks(out, allowed)[0]).toContain("cardId=999");
  });
});

describe("カードの圧縮", () => {
  it("レベルごとの数値を素の配列へ潰す", () => {
    const c = slimCard(card(1, 過去));
    expect(c.power[0]).toEqual([100, 200]);
    expect(c.id).toBe(1);
    expect(c.rarity).toBe("4");
  });

  it("supportUnit の none は落とす（大半がこれなので）", () => {
    expect(slimCard(card(1, 過去)).supportUnit).toBeUndefined();
    expect(slimCard(card(1, 過去, { supportUnit: "light_sound" })).supportUnit).toBe("light_sound");
  });
});

describe("withoutDangling", () => {
  it("許可されていない参照を落とす", () => {
    const rows = [{ cardId: 1 }, { cardId: 2 }];
    expect(withoutDangling(rows, "cardId", new Set([1]))).toEqual([{ cardId: 1 }]);
  });
});
