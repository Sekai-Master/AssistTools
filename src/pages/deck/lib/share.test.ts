/**
 * 紹介カードに載せる内容のテスト。
 *
 * ★ canvas は絵しか返さないので、**何を載せたか**はここでしか押さえられない。
 *   数字の載せ忘れ・画面と違う値・リーダーの取り違えを固定する。
 */
import { describe, expect, it } from "vitest";
import { buildShareCard, growthLabel, shareFileName } from "./share";
import type { CatalogCard } from "./deckInputs";
import type { CardState } from "./deckStore";
import type { DeckEval } from "./evaluate";

const card = (id: number, name: string, ch: number, attr = "cool"): CatalogCard => ({
  id,
  ch,
  rarity: "4",
  attr,
  name,
  trained: [400, 400, 400],
  power: [Array(60).fill(1000), Array(60).fill(1000), Array(60).fill(1000)],
});

const state = (over: Partial<CardState> = {}): CardState => ({
  level: 60,
  trained: true,
  masterRank: 5,
  skillLevel: 4,
  episodes: { first: true, latter: true },
  canvas: false,
  ...over,
});

const evaluated = (over: Partial<DeckEval> = {}): DeckEval =>
  ({
    cards: [],
    power: { total: 236756 },
    bonus: { total: 156.5 },
    skill: {
      leader: 150,
      total: 325,
      effective: 185,
      perCard: [
        { cardId: 1, base: 40, bonus: 0, value: 40 },
        { cardId: 900, base: 100, bonus: 50, value: 150 },
      ],
    },
    ...over,
  }) as unknown as DeckEval;

const build = (over: Partial<Parameters<typeof buildShareCard>[0]> = {}) =>
  buildShareCard({
    deckName: "レオニ5枚",
    eventName: "Echo of a Prayer",
    cards: [card(1, "クールだけど友達想い", 1), card(900, "やんちゃな発見者", 26)],
    states: { 1: state(), 900: state() },
    evaluated: evaluated(),
    leaderCardId: 900,
    thumbUrl: (c, trained) => `thumb/${c.id}_${trained ? "t" : "n"}.webp`,
    accent: "#f80",
    ...over,
  });

describe("育成状態のラベル", () => {
  it("数字の根拠になる項目を全部出す", () => {
    expect(growthLabel(state(), card(1, "x", 1))).toBe("Lv60 特訓 MR5 SL4");
  });

  it("特訓していないカードは特訓を出さない", () => {
    expect(growthLabel(state({ trained: false, masterRank: 0, skillLevel: 1 }), card(1, "x", 1))).toBe(
      "Lv60 MR0 SL1"
    );
  });

  it("台帳に無いカードでも落ちない", () => {
    expect(growthLabel(undefined, card(1, "x", 1))).toBe("Lv60 MR0 SL1");
  });
});

describe("紹介カードの中身", () => {
  it("画面と同じ数字を載せる（総合力・ボーナス・スキル）", () => {
    const d = build();
    expect(d.stats.map((s) => s.value)).toEqual(["236,756", "156%", "150/325"]);
    // ★ 合計の切り捨てはゲーム内表示に合わせ、端数は捨てずに添える。
    expect(d.stats[1].sub).toBe("正確には 156.5%");
    expect(d.stats[2].sub).toBe("実効値 185%");
  });

  it("端数が無いときは正確値を添えない（静かにする）", () => {
    const d = build({ evaluated: evaluated({ bonus: { total: 156 } } as Partial<DeckEval>) });
    expect(d.stats[1].value).toBe("156%");
    expect(d.stats[1].sub).toBeUndefined();
  });

  it("イベント未選択なら「—」（0% とは書かない）", () => {
    const d = build({ evaluated: evaluated({ bonus: null }) });
    expect(d.stats[1].value).toBe("—");
  });

  it("カードごとのスキル値も載せる（編成で変わるので1枚ずつ意味がある）", () => {
    expect(build().cards.map((c) => c.skill)).toEqual(["40%", "150%"]);
  });

  it("リーダーは1枚だけ印がつく", () => {
    const d = build();
    expect(d.cards.map((c) => c.leader)).toEqual([false, true]);
  });

  it("カードごとにキャラ名・カード名・育成状態を載せる", () => {
    const [first] = build().cards;
    expect(first.character).toBe("星乃一歌");
    expect(first.name).toBe("クールだけど友達想い");
    expect(first.sub).toBe("Lv60 特訓 MR5 SL4");
  });

  it("絵は画面と同じものを使う（「絵は特訓前」を選んでいればその絵）", () => {
    expect(build().cards[0].thumb).toBe("thumb/1_t.webp");
    const d = build({ states: { 1: state({ artUntrained: true }), 900: state() } });
    expect(d.cards[0].thumb).toBe("thumb/1_n.webp");
  });
});

describe("ファイル名", () => {
  it("編成名を使う", () => {
    expect(shareFileName("レオニ5枚")).toBe("レオニ5枚.png");
  });

  it("OS が嫌う文字を落とす・空なら既定名", () => {
    expect(shareFileName('レオニ/5枚:*?"<>|')).toBe("レオニ5枚.png");
    expect(shareFileName("   ")).toBe("編成.png");
  });
});
