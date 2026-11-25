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
    // キャラ別の効果（26種）。targetGameCharacterId を落とすと丸ごと消える。
    { areaItemId: 1, level: 3, targetUnit: "any", targetCardAttr: "any", targetGameCharacterId: 21, power1BonusRate: 6, power1AllMatchBonusRate: 6 },
  ],
  mysekaiGates: [
    { id: 1, unit: "light_sound", name: "ゲート1" },
    { id: 2, unit: "idol", name: "ゲート2" },
  ],
  mysekaiGateLevels: [
    // わざと順番を崩す（level 順に並べ直せているかを見る）
    { mysekaiGateId: 1, level: 2, powerBonusRate: 0.20000000298023224 },
    { mysekaiGateId: 1, level: 1, powerBonusRate: 0.10000000149011612 },
    { mysekaiGateId: 2, level: 1, powerBonusRate: 0.10000000149011612 },
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
    expect(out.areaItems).toHaveLength(2);
  });
});

describe("総合力に要る欄", () => {
  const out = derive(src(), NOW);

  // ★ 一度落として、キャラクター効果26種が丸ごと消えた欄。
  it("エリアアイテムのキャラ指定（ch）が残っている", () => {
    expect(out.areaItems.find((a) => a.itemId === 1)).toMatchObject({ ch: 21, level: 3 });
  });

  it("ゲートはユニットごとに、率をレベル順の配列で持つ（rates[0] が Lv1）", () => {
    expect(out.gates).toEqual([
      { id: 1, unit: "light_sound", rates: [0.10000000149011612, 0.20000000298023224] },
      { id: 2, unit: "idol", rates: [0.10000000149011612] },
    ]);
  });

  // ★ 0.1 と書き直すと float32 の丸めが変わって計算が1ずれる。生の値のまま持つこと。
  it("ゲートの率をきれいな 0.1 に丸めていない", () => {
    expect(out.gates[0].rates[0]).not.toBe(0.1);
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

/**
 * ブルームフェス限定カードの「特訓後スキル」（specialTrainingSkillId）。
 *
 * ★ スキル表は日付欄を持たないので、残すかどうかは「公開済みカードが指しているか」で決める。
 *   特訓後スキルも数えないと、公開済みカードの特訓後の面が丸ごと消える（実際に 22 が消えていた）。
 *   逆に、**未公開カードだけが指すスキルは出さない**（説明文だけで内容が漏れる）。
 */
describe("特訓後スキル", () => {
  const skill = (id, base) => ({
    id,
    shortDescription: `スキル${id}`,
    skillEffects: [
      {
        skillEffectType: "score_up",
        skillEffectDetails: base.map((v, i) => ({ level: i + 1, activateEffectValue: v })),
      },
    ],
  });
  const withSkills = () => ({
    ...src(),
    cards: [
      card(1, 過去),
      card(2, 過去, { skillId: 23, specialTrainingSkillId: 22 }),
      // 未公開カード: 特訓前スキル 31・特訓後スキル 30 はどちらもこのカードしか使っていない。
      card(999, 未来, { skillId: 31, specialTrainingSkillId: 30 }),
    ],
    skills: [
      skill(1, [100, 105, 110, 120]),
      skill(22, [90, 95, 100, 110]),
      skill(23, [60, 65, 70, 80]),
      skill(30, [200, 200, 200, 200]),
      skill(31, [300, 300, 300, 300]),
    ],
  });

  it("特訓後スキルの id をカードに載せる（無いカードには欄ごと付けない）", () => {
    expect(slimCard(card(2, 過去, { specialTrainingSkillId: 22 })).stSkillId).toBe(22);
    expect("stSkillId" in slimCard(card(1, 過去))).toBe(false);
  });

  it("公開済みカードが特訓後スキルとして指すスキルは残る", () => {
    const out = derive(withSkills(), NOW);
    expect(out.skills.map((s) => s.id).sort((a, b) => a - b)).toEqual([1, 22, 23]);
  });

  it("未公開カードだけが指すスキルは落ちる（特訓前・特訓後とも）", () => {
    const out = derive(withSkills(), NOW);
    expect(out.skills.some((s) => s.id === 30)).toBe(false);
    expect(out.skills.some((s) => s.id === 31)).toBe(false);
    expect(出力に含まれない(out, "スキル30")).toBe(true);
    expect(出力に含まれない(out, "スキル31")).toBe(true);
  });

  it("最終検算: 特訓後スキルとしてだけ使われるスキルは問題にしない", () => {
    const out = derive(withSkills(), NOW);
    const allowed = {
      cardIds: new Set(out.cards.map((c) => c.id)),
      eventIds: new Set(out.events.map((e) => e.id)),
    };
    expect(auditLeaks(out, allowed)).toEqual([]);
  });

  it("最終検算: どのカードも指していないスキルが紛れ込んだら止める", () => {
    const out = derive(withSkills(), NOW);
    out.skills.push({ id: 30, base: [200, 200, 200, 200], desc: "スキル30" });
    const allowed = {
      cardIds: new Set(out.cards.map((c) => c.id)),
      eventIds: new Set(out.events.map((e) => e.id)),
    };
    const problems = auditLeaks(out, allowed);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("id=30");
  });
});

describe("withoutDangling", () => {
  it("許可されていない参照を落とす", () => {
    const rows = [{ cardId: 1 }, { cardId: 2 }];
    expect(withoutDangling(rows, "cardId", new Set([1]))).toEqual([{ cardId: 1 }]);
  });
});
