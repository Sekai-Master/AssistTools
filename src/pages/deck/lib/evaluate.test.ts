/**
 * evaluateDeck の詰め替えのうち、ブルームフェスの特訓後スキル（絵の面で決まる）が
 * 計算まで届いているかを配信データの実物で見る。
 *
 * ★ 比較（compare）・差し替え（swap）・編成プロフィール（deckProfiles）はどれも
 *   evaluateDeck を通るので、ここで押さえれば取りこぼしの経路が残らない。
 *
 * ★ 期待値は Nori の実機のスキル説明（2026-11-25）に合わせてある。
 *   天馬咲希「押し込めた想い」スキルレベル 4・キャラクターランク 84:
 *   - 特訓前の絵: 「スコアが80%UP、更に編成からランダムに選んだ他メンバー1人が持つ
 *     スキルのスコアUP最大値の50%をUP（最大で合計150%）」（skill 23）
 *   - 特訓後の絵: 「スコアが110%UP、更にキャラクターランクによって42%UP
 *    （ランク2毎に+1%、現在の合計152%/最大160%）」（skill 22）
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateDeck, type EvalContext } from "./evaluate";
import { defaultCardState, type CardState, type CardStates } from "./deckStore";
import type { CatalogCard } from "./deckInputs";
import type { BonusTables } from "./eventBonus";
import type { PowerTables } from "./power";
import type { SkillRow } from "./skill";

const DATA = path.join(process.cwd(), "public/CardDatas");
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
const cards = read("cards.json") as { cards: CatalogCard[]; skills: SkillRow[] };
const power = read("power.json");
const bonuses = read("bonuses.json");

const catalog = new Map(cards.cards.map((c) => [c.id, c]));
const skillById = new Map(cards.skills.map((s) => [s.id, s]));
const SAKI = 1475; // 天馬咲希「押し込めた想い」★4・特訓前スキル 23・特訓後スキル 22
const CH = catalog.get(SAKI)!.ch;
/** 特訓後スキルを持たない★4（キャラはすべて別）。 */
const PLAIN = [471, 4, 88, 92];
/** Leo/need Memories（咲希が対象になるイベント）。ボーナスまで同じかを見るため。 */
const EVENT = 227;

const ctx = (states: CardStates, characterRanks?: Record<number, number>): EvalContext => ({
  catalog,
  states,
  player: { characterRanks: {}, gateLevels: {}, fixtureRates: {}, honorBonus: 0 },
  bonusTables: bonuses as BonusTables,
  powerTables: {
    cards: cards.cards,
    masterBonuses: power.masterBonuses,
    episodes: power.episodes,
    canvasBonuses: power.canvasBonuses,
    characterRanks: power.characterRanks,
    gates: power.gates,
    unitCharacters: bonuses.unitCharacters,
  } as PowerTables,
  skills: cards.skills,
  characterRanks,
  eventId: EVENT,
});

const sl4 = (over: Partial<CardState> = {}): CardState => ({ ...defaultCardState(60, true), skillLevel: 4, ...over });

const soloSkill = (s: CardState | undefined, ranks?: Record<number, number>) =>
  evaluateDeck([SAKI, null, null, null, null], 0, 0, ctx(s ? { [SAKI]: s } : {}, ranks)).skill.perCard[0];

describe("配信データのスキルが実機の説明と一致する（天馬咲希 SL4）", () => {
  it("特訓前の絵のスキル 23: 80%UP・他メンバー参照 50%・最大で合計150%", () => {
    const s = skillById.get(23)!;
    expect(catalog.get(SAKI)!.skillId).toBe(23);
    expect(s.base[3]).toBe(80);
    expect(s.enhance?.rates?.[3]).toBe(50);
    expect(s.base[3] + s.enhance!.caps![3]).toBe(150);
  });

  it("特訓後の絵のスキル 22: 110%UP・キャラクターランクぶん", () => {
    expect(catalog.get(SAKI)!.stSkillId).toBe(22);
    expect(skillById.get(22)!.base[3]).toBe(110);
  });
});

describe("絵の面で使うスキルが変わり、evaluateDeck まで届く", () => {
  it("特訓後の絵（既定）・ランク84 → 110＋42＝152", () => {
    const r = soloSkill(sl4(), { [CH]: 84 });
    expect(r.base).toBe(110);
    expect(r.bonus).toBe(42);
    expect(r.value).toBe(152);
  });

  it("特訓後の絵・ランク100 → 最大の160", () => {
    expect(soloSkill(sl4(), { [CH]: 100 }).value).toBe(160);
  });

  it("特訓後の絵でランク未入力なら 110 と未入力の印", () => {
    const r = soloSkill(sl4());
    expect(r.value).toBe(110);
    expect(r.rankMissing).toBe(true);
  });

  it("特訓前の絵なら skill 23（1枚だけなので参照の相手がいない → 80）", () => {
    const r = soloSkill(sl4({ artUntrained: true }), { [CH]: 84 });
    expect(r.base).toBe(80);
    expect(r.value).toBe(80);
    expect(r.rankMissing).toBeUndefined();
  });

  it("特訓していなければ skill 23", () => {
    expect(soloSkill(sl4({ level: 50, trained: false }), { [CH]: 84 }).value).toBe(80);
  });

  /**
   * ★ 台帳に無いカード（比較パネルで、台帳から外したカードを含む保存編成）と、
   *   編成を開いて既定の育成状態が書き込まれた後とで、同じ数字にする。
   */
  it("育成状態が未登録でも、既定の育成状態と同じ評価になる", () => {
    const ids = [SAKI, ...PLAIN];
    const none = evaluateDeck(ids, 0, 0, ctx({}, { [CH]: 84 }));
    const defaults = Object.fromEntries(ids.map((id) => [id, defaultCardState(60, true)]));
    expect(none).toEqual(evaluateDeck(ids, 0, 0, ctx(defaults, { [CH]: 84 })));
    expect(none.skill.perCard[0].base).toBe(90); // skill 22 の SL1（既定の育成状態は SL1）
  });
});

/**
 * ★ 特訓前の絵の咲希（skill 23）が、特訓後の絵のブルフェスを参照するときは相手の**いまの値**
 *  （110＋キャラクターランクぶん）の50%を見る（Nori 確認 2026-11-25）。
 */
describe("特訓前の絵の咲希が、特訓後の絵のブルフェスを参照する", () => {
  const KANADE = 949; // 宵崎奏「思い出を取り戻して」★4・特訓後スキル 22
  const KCH = catalog.get(KANADE)!.ch;
  const pair = (ranks: Record<number, number>) =>
    evaluateDeck(
      [SAKI, KANADE, null, null, null],
      0,
      0,
      ctx({ [SAKI]: sl4({ artUntrained: true }), [KANADE]: sl4() }, ranks)
    ).skill.perCard;

  it("相手がランク84なら 152 の50%＝76 が上限70で止まり、咲希は合計150", () => {
    const [saki, kanade] = pair({ [KCH]: 84 });
    expect(kanade.value).toBe(152);
    expect(saki.base).toBe(80);
    expect(saki.bonus).toBe(70);
    expect(saki.value).toBe(150);
  });

  it("上限に届かないときは半分そのまま（相手ランク40 → 130 の50%＝65、合計145）", () => {
    const [saki, kanade] = pair({ [KCH]: 40 });
    expect(kanade.value).toBe(130);
    expect(saki.value).toBe(145);
  });

  it("相手のランクが未入力なら、相手は 110（未入力の印）で、咲希は 110 の50%を足して135", () => {
    const [saki, kanade] = pair({});
    expect(kanade.value).toBe(110);
    expect(kanade.rankMissing).toBe(true);
    expect(saki.value).toBe(135);
  });
});

describe("絵の切り替えが計算に効く範囲", () => {
  const ids = [SAKI, ...PLAIN];
  const ranks = { [CH]: 84 };
  const states = (over: Record<number, Partial<CardState>> = {}): CardStates =>
    Object.fromEntries(ids.map((id) => [id, sl4(over[id])]));

  it("特訓済みのブルフェスで絵を切り替えると、スキル値が変わる（総合力・ボーナスは変わらない）", () => {
    const trainedArt = evaluateDeck(ids, 0, 0, ctx(states(), ranks));
    const untrainedArt = evaluateDeck(ids, 0, 0, ctx(states({ [SAKI]: { artUntrained: true } }), ranks));
    expect(trainedArt.skill.perCard[0].value).toBe(152);
    expect(untrainedArt.skill.perCard[0].base).toBe(80);
    expect(untrainedArt.skill.perCard[0].value).not.toBe(152);
    expect(untrainedArt.skill.total).not.toBe(trainedArt.skill.total);
    expect(untrainedArt.power).toEqual(trainedArt.power);
    expect(untrainedArt.bonus).toEqual(trainedArt.bonus);
  });

  it("特訓後スキルを持たないカードで絵を切り替えても、評価は何も変わらない", () => {
    const base = evaluateDeck(ids, 0, 0, ctx(states(), ranks));
    expect(base.bonus).not.toBeNull();
    for (const id of PLAIN) {
      const toggled = evaluateDeck(ids, 0, 0, ctx(states({ [id]: { artUntrained: true } }), ranks));
      expect(toggled).toEqual(base);
    }
  });
});
