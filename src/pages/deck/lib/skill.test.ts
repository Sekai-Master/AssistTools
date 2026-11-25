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
) as { cards: { id: number; ch: number; skillId?: number; stSkillId?: number }[]; skills: SkillRow[] };
const skills = cardsJson.skills;
const byId = new Map(skills.map((s) => [s.id, s]));

/** skillId は「いま使われる面のスキル」（activeSkillId）として渡す。 */
const card = (cardId: number, skillId: number, unit: string, level = 4, ch = 1): SkillDeckCard => ({
  cardId,
  ch,
  activeSkillId: skillId,
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

  // ★ 特訓後スキル（ブルフェスの stSkillId）も「使っている」に数える。派生データ側
  //   （deriveCardData の usedSkillIds）と同じ集合で見ないと、片方だけ直したときに気付けない。
  it("公開済みカードが使っているスキルだけが入っている（特訓後スキルを含む）", () => {
    const used = new Set(cardsJson.cards.flatMap((c) => [c.skillId, c.stSkillId]));
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

  it("他メンバー参照は上限側（一番高い人の50%）", () => {
    const self = card(1, 23, "light_sound", 4); // 素80
    // 他が★4の120%なら 60% ぶん（SL4 の上限は70なので頭打ちしない）
    expect(deckSkill([self, card(2, 4, "idol")], skills).perCard[0].value).toBe(140);
    // 他が★1の40%なら 20%
    expect(deckSkill([self, card(2, 1, "idol")], skills).perCard[0].value).toBe(100);
    // 1人だけなら参照先が無い
    expect(deckSkill([self], skills).perCard[0].value).toBe(80);
  });

  /**
   * ★★ 上限は**スキルレベルで変わる**（SL1=60 / SL2=65 / SL3=70 / SL4=70）。
   *   マスタの先頭行だけ見て1つの値にしていたせいで、SL3・SL4 で10低く出ていた。
   */
  it("参照の上限がスキルレベルごとに効く", () => {
    const ref = skills.find((s) => s.enhance?.type === "reference")!;
    expect(ref.enhance?.caps).toEqual([60, 65, 70, 70]);

    // 参照先は skill 13（SL4 で 140）。50% なら 70 だが、SL ごとの上限で頭打ちする。
    const partner = card(2, 13, "idol", 4);
    const at = (lv: number) =>
      deckSkill([card(1, ref.id, "light_sound", lv), partner], skills).perCard[0];

    expect(at(1).bonus).toBe(60); // 上限60
    expect(at(2).bonus).toBe(65); // 上限65
    expect(at(3).bonus).toBe(70); // 上限70
    expect(at(4).bonus).toBe(70); // 70（50%ぶんが 70 なので上限とちょうど同じ）
  });

  it("上乗せがあったカードは理由を返す（黙って増やさない）", () => {
    const r = deckSkill([card(1, 15, "light_sound"), card(2, 15, "light_sound")], skills);
    expect(r.perCard[0].note).toContain("同ユニット1人");
  });
});

/**
 * ブルームフェス限定カードの特訓後スキル（skill 22）。
 * 「スコアが110%UP、更にキャラクターランク2毎に+1%（ランク100で最大+50%）」。
 * ★ 段は配信データの実物（50段）で確かめる。合成データだと段の形が変わったときに気付けない。
 */
describe("キャラクターランクで伸びるスキル（ブルフェスの特訓後・id22）", () => {
  const ch = 17; // 949 のキャラ。ランクは自分のキャラのものを見る。
  const at = (ranks: Record<number, number> | undefined, level = 4) =>
    deckSkill([card(949, 22, "light_sound", level, ch)], skills, { characterRanks: ranks }).perCard[0];

  it("配信データに 22 があり、ランク2ごとに+1%の段を50段持つ", () => {
    const s = byId.get(22)!;
    expect(s.base).toEqual([90, 95, 100, 110]);
    expect(s.enhance?.type).toBe("character_rank");
    expect(s.enhance?.steps).toHaveLength(50);
    expect(s.enhance?.steps?.[0]).toEqual({ rank: 2, value: 1 });
    expect(s.enhance?.steps?.at(-1)).toEqual({ rank: 100, value: 50 });
  });

  it("SL4・ランク60 → 110＋30＝140", () => {
    expect(at({ [ch]: 60 }).value).toBe(140);
    expect(at({ [ch]: 60 }).note).toBe("キャラクターランク60");
  });

  it("奇数ランクは下の段（ランク59 → +29）", () => {
    expect(at({ [ch]: 59 }).value).toBe(139);
    expect(at({ [ch]: 1 }).value).toBe(110);
  });

  it("ランク100以上は +50 で頭打ち（160）", () => {
    expect(at({ [ch]: 100 }).value).toBe(160);
    expect(at({ [ch]: 250 }).value).toBe(160);
  });

  it("スキルレベルぶんの素の値に乗る（SL1・ランク60 → 90＋30）", () => {
    expect(at({ [ch]: 60 }, 1).value).toBe(120);
  });

  it("他のキャラのランクは見ない", () => {
    expect(at({ 1: 100 }).value).toBe(110);
  });

  /** ★ 黙って +0 にしない。未入力は印を付けて返し、画面に出す。 */
  it("ランクが未入力なら +0 で計算し、rankMissing を立てる", () => {
    const cases: (Record<number, number> | undefined)[] = [undefined, {}, { [ch]: 0 }];
    for (const ranks of cases) {
      const r = at(ranks);
      expect(r.value).toBe(110);
      expect(r.rankMissing).toBe(true);
      expect(r.note).toBe("キャラクターランク未入力");
    }
    expect(at({ [ch]: 60 }).rankMissing).toBeUndefined();
  });

  it("キャラクターランクに関係ないスキルでは rankMissing を立てない", () => {
    expect(deckSkill([card(1, 4, "light_sound")], skills).perCard[0].rankMissing).toBeUndefined();
  });

  /**
   * ★ 参照スキル（23）が特訓後の面のブルフェスを参照するとき、相手の「スコアUP最大値」に
   *   何を使うか（110 のみ／110＋ランク分／160）は未実測（issue #21 の 1 番と同じ）。
   *   いまは**相手の素の値（active な面の base＝110）**を見る。測るまで変えないことを固定する。
   */
  it("参照スキルは相手の素の値（ランクぶんを含まない110）を見る（未実測・現状の挙動）", () => {
    const self = card(1, 23, "light_sound", 4); // 素80・参照50%・上限70
    const partner = card(949, 22, "light_sound", 4, ch);
    const r = deckSkill([self, partner], skills, { characterRanks: { [ch]: 100 } });
    expect(r.perCard[1].value).toBe(160);
    expect(r.perCard[0].bonus).toBe(55); // 110 × 50%（160 × 50% なら上限70）
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
