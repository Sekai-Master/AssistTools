/**
 * スキル値のテスト。
 *
 * ★ 配信データの実物（cards.json の skills）で確かめる。合成データだけだと、
 *   マスタの形が変わったときに気付けない。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deckSkill, MAX_SKILL_LEVEL, type SkillDeckCard, type SkillRow } from "./skill";
import { multiEffectiveSkill } from "../../ranking/lib/efficiency";

const cardsJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/CardDatas/cards.json"), "utf8")
) as { cards: { id: number; ch: number; skillId?: number }[]; skills: SkillRow[] };
const skills = cardsJson.skills;
const byId = new Map(skills.map((s) => [s.id, s]));

const card = (cardId: number, skillId: number, unit: string, level = 4, ch = 1): SkillDeckCard => ({
  cardId,
  ch,
  skillId,
  unit,
  level,
});

describe("配信しているスキル表", () => {
  it("全部レベル4段ぶんの値を持っている", () => {
    expect(skills.length).toBeGreaterThan(10);
    for (const s of skills) {
      expect(s.base).toHaveLength(MAX_SKILL_LEVEL);
      expect(s.base.every((v) => v > 0)).toBe(true);
      // レベルを上げて下がるスキルは無い。
      expect([...s.base].sort((a, b) => a - b)).toEqual(s.base);
    }
  });

  it("公開済みカードが使っているスキルだけが入っている", () => {
    const used = new Set(cardsJson.cards.map((c) => c.skillId));
    for (const s of skills) expect(used.has(s.id)).toBe(true);
  });
});

describe("素のスキル", () => {
  it("スキルレベルぶんの値を採る（★4のスコアアップは 100→120）", () => {
    const s4 = byId.get(4)!;
    expect(s4.base).toEqual([100, 105, 110, 120]);
    const r1 = deckSkill([card(1, 4, "light_sound", 1)], skills);
    const r4 = deckSkill([card(1, 4, "light_sound", 4)], skills);
    expect(r1.perCard[0].value).toBe(100);
    expect(r4.perCard[0].value).toBe(120);
  });

  it("範囲外のスキルレベルは端で止める", () => {
    expect(deckSkill([card(1, 4, "light_sound", 0)], skills).total).toBe(100);
    expect(deckSkill([card(1, 4, "light_sound", 99)], skills).total).toBe(120);
  });

  it("条件付きのスキルは上限側を採る（ライフ依存・GOODを出すまで）", () => {
    expect(byId.get(12)!.base).toEqual([120, 125, 130, 140]);
    expect(byId.get(13)!.base).toEqual([120, 125, 130, 140]);
  });

  it("スキルが引けないカードは 0 にせず missing で返す", () => {
    const r = deckSkill([{ cardId: 9, ch: 1, unit: "light_sound", level: 4 }], skills);
    expect(r.missing).toEqual([9]);
    expect(r.perCard[0].value).toBe(0);
  });
});

describe("編成で変わるスキル", () => {
  /** 「自身を除きレオニを1人編成する毎に+10%、全員一致で更に+10%」（id15）。 */
  const leoni = (i: number, unit = "light_sound") => card(100 + i, 15, unit, 4);

  it("同ユニットの人数ぶん増え、5枚全員一致でもう1段増える", () => {
    const alone = deckSkill([leoni(0)], skills);
    expect(alone.perCard[0].value).toBe(100); // 自分だけ

    const five = deckSkill([leoni(0), leoni(1), leoni(2), leoni(3), leoni(4)], skills);
    // 100 + 10×4（他の4人）+ 10（全員一致）
    expect(five.perCard[0].value).toBe(150);

    const mixed = deckSkill([leoni(0), leoni(1), leoni(2), leoni(3), card(9, 4, "piapro")], skills);
    // 他のレオニは3人、全員一致は崩れる
    expect(mixed.perCard[0].value).toBe(130);
  });

  it("異なるユニットの種類数で増える（id24・最大2種類で+60）", () => {
    const self = card(1, 24, "light_sound");
    expect(deckSkill([self], skills).perCard[0].value).toBe(90);
    expect(deckSkill([self, card(2, 4, "idol")], skills).perCard[0].value).toBe(120);
    expect(
      deckSkill([self, card(2, 4, "idol"), card(3, 4, "street"), card(4, 4, "piapro")], skills)
        .perCard[0].value
    ).toBe(150); // 3種類あっても上限2種類ぶん
  });

  it("他メンバー参照は上限側（一番高い人の50%・上限60）", () => {
    const self = card(1, 23, "light_sound"); // 素80
    // 他が★4の120%なら 60% ぶんだが上限60で頭打ち
    expect(deckSkill([self, card(2, 4, "idol")], skills).perCard[0].value).toBe(140);
    // 他が★1の40%なら 20%
    expect(deckSkill([self, card(2, 1, "idol")], skills).perCard[0].value).toBe(100);
    // 1人だけなら参照先が無い
    expect(deckSkill([self], skills).perCard[0].value).toBe(80);
  });

  it("上乗せがあったカードは理由を返す（黙って増やさない）", () => {
    const r = deckSkill([card(1, 15, "light_sound"), card(2, 15, "light_sound")], skills);
    expect(r.perCard[0].note).toContain("同ユニット1人");
  });
});

describe("内部値・先頭・実効値", () => {
  const deck = [
    card(1, 4, "light_sound"), // 120
    card(2, 4, "light_sound"),
    card(3, 4, "light_sound"),
    card(4, 4, "light_sound"),
    card(5, 3, "light_sound"), // 80
  ];

  it("内部値は5枚の合計", () => {
    expect(deckSkill(deck, skills).total).toBe(120 * 4 + 80);
  });

  it("先頭はリーダーに指定したカード（既定は1枚目）", () => {
    expect(deckSkill(deck, skills).leader).toBe(120);
    expect(deckSkill(deck, skills, { leaderCardId: 5 }).leader).toBe(80);
  });

  it("実効値は効率曲ランキングと同じ式（新しい式を作らない）", () => {
    const r = deckSkill(deck, skills);
    expect(r.effective).toBe(multiEffectiveSkill(r.leader, r.total));
  });
});
