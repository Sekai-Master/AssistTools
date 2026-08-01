import { describe, expect, it } from "vitest";
import {
  areaRatesFromEffects,
  deckPower,
  ratePower,
  type PlayerState,
  type PowerTables,
} from "./power";

/**
 * ★ 期待値の出どころは Nori の実機の数字。モデルの推論より実測が強い。
 *   実測に由来するケースには「実測」と書いてある。消すときは実機で取り直すこと。
 */

const card = (o: Partial<PowerTables["cards"][number]> & { id: number }) => ({
  ch: 1,
  rarity: "4",
  attr: "cute",
  trained: [0, 0, 0],
  // レベル1..3。index 0 が Lv1。
  power: [
    [100, 200, 300],
    [100, 200, 300],
    [100, 200, 300],
  ],
  ...o,
});

const tables: PowerTables = {
  cards: [
    card({ id: 1 }), // ch1 = レオニ（単一ユニット）
    card({ id: 2, ch: 2 }),
    card({ id: 3, ch: 3 }),
    card({ id: 4, ch: 4 }),
    card({ id: 5, ch: 5, attr: "cool" }),
    card({ id: 21, ch: 21 }), // ch21 = VS のキャラ（複数ユニットに跨る）
    card({ id: 22, ch: 21, supportUnit: "theme_park" }), // ユニット限定カード
  ],
  masterBonuses: [
    { rarity: "4", masterRank: 1, power: [200, 200, 200] },
    { rarity: "4", masterRank: 2, power: [200, 200, 200] },
    { rarity: "4", masterRank: 3, power: [200, 200, 200] },
  ],
  episodes: [
    { cardId: 1, part: "first_part", power: [250, 250, 250] },
    { cardId: 1, part: "second_part", power: [600, 600, 600] },
  ],
  canvasBonuses: [{ rarity: "4", power: [500, 500, 500] }],
  characterRanks: [
    { ch: 1, rank: 50, rate: [5, 5, 5] },
    { ch: 21, rank: 50, rate: [5, 5, 5] },
  ],
  gates: [
    // 実データ同様、率は float32 を float64 で表した値
    { id: 1, unit: "light_sound", rates: [0.10000000149011612, 0.20000000298023224] },
    { id: 2, unit: "idol", rates: [0.10000000149011612, 0.20000000298023224] },
    { id: 3, unit: "street", rates: [0.10000000149011612, 0.20000000298023224] },
    { id: 4, unit: "theme_park", rates: [0.10000000149011612, 0.20000000298023224] },
    { id: 5, unit: "school_refusal", rates: [0.10000000149011612, 0.20000000298023224] },
  ],
  unitCharacters: [
    { id: 1, ch: 1, unit: "light_sound" },
    { id: 2, ch: 2, unit: "light_sound" },
    { id: 3, ch: 3, unit: "light_sound" },
    { id: 4, ch: 4, unit: "light_sound" },
    { id: 5, ch: 5, unit: "idol" },
    // VS のキャラは piapro ＋ 各ユニットの6枠を持つ
    { id: 90, ch: 21, unit: "piapro" },
    { id: 91, ch: 21, unit: "light_sound" },
    { id: 92, ch: 21, unit: "theme_park" },
  ],
};

const owned = (cardId: number, o: Record<string, unknown> = {}) => ({
  cardId,
  level: 3,
  masterRank: 0,
  ...o,
});

/** パラメータを直に置いたカードを足したテーブル（丸めの検証用）。 */
const withParam = (id: number, p: number, extra: Record<string, unknown> = {}) => ({
  ...tables,
  cards: [...tables.cards, card({ id, power: [[p], [p], [p]], ...extra })],
});

describe("float32 での % 計算", () => {
  // ★★ ここがキャラクターランクの「5% だと実測より1多い」の正体。★★
  //    ゲーム本体は float32 で計算していて、5% は 0.049999998882413 になる。
  //    float64 のまま 0.05 を掛けると 577 になり、実機と1ずれる。
  it("5% × 11540 は 577 でなく 576.99998…（float64 なら 577 ちょうど）", () => {
    expect(11540 * 0.05).toBe(577);
    expect(ratePower(5, 11540)).toBeLessThan(577);
    expect(Math.floor(ratePower(5, 11540))).toBe(576);
  });

  it("端数が出る値では float64 と同じ結果になる", () => {
    expect(Math.floor(ratePower(5, 11532))).toBe(576);
  });
});

describe("パフォーマンス", () => {
  it("レベルの基礎値をそのまま採る", () => {
    const r = deckPower([owned(1, { level: 2 })], {}, tables);
    expect(r.perCard[0].performance).toEqual([200, 200, 200]);
    expect(r.performance).toBe(600);
  });

  it("特訓・サイドストーリー・キャンバス・マスターランクを足す", () => {
    const t = { ...tables, cards: tables.cards.map((c) => (c.id === 1 ? { ...c, trained: [50, 50, 50] } : c)) };
    const r = deckPower(
      [owned(1, { trained: true, episodes: { first: true, latter: true }, canvas: true, masterRank: 3 })],
      {},
      t
    );
    // 300 + 50 + 250 + 600 + 500 + (200×3) = 2300 /パラメータ
    expect(r.perCard[0].performance).toEqual([2300, 2300, 2300]);
  });

  it("マスターランクは累積で足す（MR3 は MR1+2+3）", () => {
    const r = deckPower([owned(1, { masterRank: 2 })], {}, tables);
    expect(r.perCard[0].performance[0]).toBe(300 + 400);
  });

  it("サイドストーリーは読了したぶんだけ", () => {
    const r = deckPower([owned(1, { episodes: { first: true } })], {}, tables);
    expect(r.perCard[0].performance[0]).toBe(300 + 250);
  });

  // ★ 0 と未入力は別物。0 として黙って計算すると、足りない数字に気付けない。
  it("マスターランク未入力は 0 として計算しつつ、呼び出し側へ返す", () => {
    const r = deckPower([{ cardId: 1, level: 3 }], {}, tables);
    expect(r.perCard[0].performance[0]).toBe(300);
    expect(r.unsetMasterRank).toEqual([1]);
  });

  it("カタログに無いカード・範囲外のレベルは黙って0にせず missing に出す", () => {
    const r = deckPower([owned(999), owned(1, { level: 99 })], {}, tables);
    expect(r.missing.length).toBe(2);
  });
});

describe("エリアアイテム", () => {
  const player = (rates: PlayerState["areaRates"]): PlayerState => ({ areaRates: rates });

  it("パラメータごとに floor する（合計してから floor しない）", () => {
    // 1パラ 1010 × 3% = 30.3 → floor 30。3パラで 90。
    // 合計 3030 に 3% を掛けて floor すると 90 だが、端数の出方が違う値で差が出る
    const t = withParam(50, 1010);
    const r = deckPower([owned(50, { level: 1 })], player([{ rate: [3, 3, 3] }]), t);
    expect(r.areaItem).toBe(90);
  });

  it("対象ユニットが違えば効かない", () => {
    const r = deckPower([owned(1, { level: 2 })], player([{ unit: "idol", rate: [10, 10, 10] }]), tables);
    expect(r.areaItem).toBe(0);
  });

  // ★ 200×10% は 20 ではなく 19。float32 では 10% が 0.099999994 なので
  //   19.999998 になり floor で1つ下がる。「20×3=60」と書くと実機と合わない。
  it("対象キャラが一致したら効く", () => {
    const r = deckPower([owned(1, { level: 2 })], player([{ ch: 1, rate: [10, 10, 10] }]), tables);
    expect(r.areaItem).toBe(19 * 3);
  });

  // ★ 全一致は5枚揃って初めて付く（実測で確認済み）。1枚・2枚では付かない。
  it("5枚全員が同じユニットなら全一致の率を使う", () => {
    const deck = [1, 2, 3, 4].map((id) => owned(id, { level: 2 }));
    const rates = player([{ unit: "light_sound", rate: [10, 10, 10], allMatch: [20, 20, 20] }]);
    const four = deckPower(deck, rates, tables);
    expect(four.sameUnit).toBe(false);
    expect(four.areaItem).toBe(19 * 3 * 4); // 通常の 10%（4枚では全一致にならない）

    const five = deckPower([...deck, owned(5, { level: 2 })], rates, tables);
    // ch5 は idol なので5枚揃っても全一致にならない
    expect(five.sameUnit).toBe(false);

    // ch21 のカードは light_sound 枠を持つが、supportUnit が無ければ piapro 扱い
    const withPiapro = deckPower([...deck, owned(21, { level: 2 })], rates, tables);
    expect(withPiapro.sameUnit).toBe(false);
  });

  it("5枚全員が同じ属性なら属性アイテムが全一致の率になる", () => {
    const deck = [1, 2, 3, 4, 21].map((id) => owned(id, { level: 2 }));
    const rates = player([{ attr: "cute", rate: [10, 10, 10], allMatch: [20, 20, 20] }]);
    const r = deckPower(deck, rates, tables);
    expect(r.sameAttr).toBe(true);
    expect(r.areaItem).toBe(39 * 3 * 5); // 全一致の 20%（通常の 10% なら 19×3×5）
  });
});

describe("キャラクターランク", () => {
  it("パラメータごとに floor する", () => {
    const t = withParam(51, 11540);
    const r = deckPower([owned(51, { level: 1 })], { characterRanks: { 1: 50 } }, t);
    // ★ 実測: 5% を float64 で掛けると 577×3=1731 になるが、実機は 1728
    expect(r.characterRank).toBe(576 * 3);
  });

  it("ランクを入れていなければ 0", () => {
    const r = deckPower([owned(1, { level: 2 })], {}, tables);
    expect(r.characterRank).toBe(0);
  });

  it("表に無いランクは黙って0にせず missing に出す", () => {
    const r = deckPower([owned(1, { level: 2 })], { characterRanks: { 1: 99 } }, tables);
    expect(r.missing.length).toBe(1);
  });
});

describe("マイセカイのゲート", () => {
  // ★ 実測: レン（VS）単体 パフォーマンス 34596 のとき
  //   全ゲート Lv1 → 34 ／ レオニだけ Lv2 → 69
  const t = withParam(60, 11532, { ch: 21 }); // 11532×3 = 34596

  it("VS のカードは全ゲートのうち一番高いものが効く（実測 34 / 69）", () => {
    const lv1 = deckPower([owned(60, { level: 1 })], { gateLevels: { light_sound: 1 } }, t);
    expect(lv1.gate).toBe(34);

    const lv2 = deckPower(
      [owned(60, { level: 1 })],
      { gateLevels: { light_sound: 2, idol: 1, street: 1, theme_park: 1, school_refusal: 1 } },
      t
    );
    expect(lv2.gate).toBe(69);
  });

  it("ユニット限定カードはそのユニットのゲートだけを見る", () => {
    const t2 = withParam(61, 11532, { ch: 21, supportUnit: "theme_park" });
    const r = deckPower(
      [owned(61, { level: 1 })],
      { gateLevels: { light_sound: 2, theme_park: 1 } },
      t2
    );
    expect(r.gate).toBe(34); // レオニの Lv2 に引っ張られない
  });

  it("カードごとに floor して足す（編成合計に対して1回ではない）", () => {
    // 2枚それぞれ 34596。Lv1 なら 34+34 = 68。合計 69192 に 0.1% だと 69。
    const r = deckPower(
      [owned(60, { level: 1 }), owned(60, { level: 1 })],
      { gateLevels: { light_sound: 1 } },
      t
    );
    expect(r.gate).toBe(68);
  });

  it("ゲートを入れていなければ 0", () => {
    const r = deckPower([owned(60, { level: 1 })], {}, t);
    expect(r.gate).toBe(0);
  });
});

describe("家具・称号", () => {
  const t = withParam(70, 11532);

  it("家具はキャラ紐付きで、カードごとに3パラ合計へ掛ける", () => {
    const r = deckPower([owned(70, { level: 1 })], { fixtureRates: { 1: 5 } }, t);
    expect(r.fixture).toBe(Math.floor(ratePower(5, 34596)));
  });

  it("家具は 100% を超えない", () => {
    const a = deckPower([owned(70, { level: 1 })], { fixtureRates: { 1: 150 } }, t);
    const b = deckPower([owned(70, { level: 1 })], { fixtureRates: { 1: 100 } }, t);
    expect(a.fixture).toBe(b.fixture);
  });

  it("称号は編成に1回だけ足す（カードごとではない）", () => {
    const r = deckPower([owned(70, { level: 1 }), owned(70, { level: 1 })], { honorBonus: 210 }, t);
    expect(r.honor).toBe(210);
  });
});

describe("効果一覧からの変換", () => {
  // 画面には「同ユニットのみで編成するとさらに◯%」が出ていないので、
  // ユニット・タイプは2倍を補う。キャラは全一致でも増えない。
  it("ユニット・タイプは全一致ぶんを2倍で補い、キャラは補わない", () => {
    const rows = areaRatesFromEffects({
      units: { light_sound: 15 },
      attrs: { cute: 8.5 },
      chars: { 23: 16 },
    });
    expect(rows).toEqual([
      { unit: "light_sound", rate: [15, 15, 15], allMatch: [30, 30, 30] },
      { attr: "cute", rate: [8.5, 8.5, 8.5], allMatch: [17, 17, 17] },
      { ch: 23, rate: [16, 16, 16] },
    ]);
  });

  it("空でも落ちない", () => {
    expect(areaRatesFromEffects({})).toEqual([]);
  });
});

describe("合計", () => {
  // ★ 実測: レン単体 50267 = パフォーマンス34596 + エリア13664 + CR1728 + 称号210 + 家具0 + ゲート69
  it("実測（レン単体 50267）の内訳がそのまま足し合わされる", () => {
    const t = withParam(80, 11532, { ch: 21 });
    const r = deckPower(
      [owned(80, { level: 1 })],
      {
        characterRanks: { 21: 50 },
        gateLevels: { light_sound: 2, idol: 1, street: 1, theme_park: 1, school_refusal: 1 },
        honorBonus: 210,
      },
      t
    );
    expect(r.performance).toBe(34596);
    expect(r.characterRank).toBe(1728);
    expect(r.gate).toBe(69);
    expect(r.honor).toBe(210);
    expect(r.total).toBe(r.performance + r.areaItem + r.characterRank + r.gate + r.fixture + r.honor);
  });
});
