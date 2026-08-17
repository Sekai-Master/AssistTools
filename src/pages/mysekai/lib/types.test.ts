import { describe, expect, it } from "vitest";
import { normalize } from "./types";

/**
 * 配信データの正規化。**壊れた入力を黙って通さないこと**が主眼。
 * 生成側の事故で欠けた項目が、画面上は「そういうデータ」に見えてしまうのが一番困る。
 */

const base = () => ({
  generatedAt: "2026-08-17T00:00:00.000Z",
  characters: [
    { id: 1, name: "星乃一歌", unit: "light_sound" },
    { id: 21, name: "初音ミク", unit: "piapro" },
  ],
  genres: { main: [{ id: 2, name: "一般" }] },
  vocab: { site: ["room"], layout: ["floor", "wall"], type: ["normal"] },
  multiUnitLikes: { 21: 5 },
  fixtures: [
    {
      id: 10,
      name: "ソファ",
      pr: "そふぁ",
      ty: 0,
      mg: 2,
      sz: [2, 1, 4],
      st: 0,
      ly: 0,
      co: 20,
      sk: true,
      ac: 1,
      tc: [1, 21],
      tk: [4, 2],
      tn: 6,
      lc: [1],
    },
    { id: 11, name: "置物", sz: [1, 1, 1] },
  ],
});

describe("normalize", () => {
  it("短縮キーを画面で使う形に戻す", () => {
    const d = normalize(base());
    const f = d.fixtures[0];
    expect(f.name).toBe("ソファ");
    expect(f.reading).toBe("そふぁ");
    expect(f.type).toBe("normal");
    expect(f.site).toBe("room");
    expect(f.layout).toBe("floor");
    expect(f.size).toEqual([2, 1, 4]);
    expect(f.cost).toBe(20);
    expect(f.sketch).toBe(true);
    expect(f.action).toBe(true);
    expect(f.talkChars).toEqual([1, 21]);
    expect(f.talkCount).toBe(6);
    expect(f.likeChars).toEqual([1]);
    expect(f.reactive).toBe(true);
  });

  it("読みが無ければ名前で埋める", () => {
    expect(normalize(base()).fixtures[1].reading).toBe("置物");
  });

  it("キャラ別の会話本数を tc と対応付ける", () => {
    const f = normalize(base()).fixtures[0];
    expect(f.talkCountBy.get(1)).toBe(4);
    expect(f.talkCountBy.get(21)).toBe(2);
  });

  // tk が欠けても「会話に登場している」事実は tc が示しているので 0 にしない。
  it("本数が欠けていても登場している以上は 0 にしない", () => {
    const d = base();
    delete (d.fixtures[0] as Record<string, unknown>).tk;
    const f = normalize(d).fixtures[0];
    expect(f.talkCountBy.get(1)).toBe(1);
  });

  // ★ charSet に無関心(normal)を混ぜて26人の結果がほぼ同じになった事故があった。
  //   配信データに nc があっても拾わないことを固定する。
  it("配信データに nc（無関心）が残っていても取り込まない", () => {
    const d = base();
    (d.fixtures[0] as Record<string, unknown>).nc = [2, 3, 4];
    const f = normalize(d).fixtures[0];
    expect([...f.charSet].sort((a, b) => a - b)).toEqual([1, 21]);
  });

  it("設計図が無い家具は sketch=null（模写不可 false と区別する）", () => {
    const d = normalize(base());
    expect(d.fixtures[0].sketch).toBe(true);
    expect(d.fixtures[1].sketch).toBeNull();
  });

  it("id が重複したら先に出た方を採る（React の key 衝突を防ぐ）", () => {
    const d = base();
    d.fixtures.push({ id: 10, name: "偽ソファ", sz: [1, 1, 1] });
    const out = normalize(d);
    expect(out.fixtures.filter((f) => f.id === 10)).toHaveLength(1);
    expect(out.fixtures.find((f) => f.id === 10)?.name).toBe("ソファ");
  });

  it("合成された好みのキャラを Map で返す", () => {
    expect(normalize(base()).multiUnitLikes.get(21)).toBe(5);
  });

  describe("壊れた入力", () => {
    it("null / 文字列 / 配列でも落ちない", () => {
      for (const bad of [null, undefined, "x", 42, []]) {
        const out = normalize(bad);
        expect(out.fixtures).toEqual([]);
        expect(out.characters).toEqual([]);
      }
    });

    it("vocab が配列でなければ語彙は空文字になる（数値が漏れ出さない）", () => {
      const d = base();
      (d as Record<string, unknown>).vocab = { site: "room", layout: null, type: 3 };
      const f = normalize(d).fixtures[0];
      expect(f.site).toBe("");
      expect(f.layout).toBe("");
      expect(f.type).toBe("");
    });

    it("サイズの要素数が違えば 0 に倒す", () => {
      const d = base();
      (d.fixtures[0] as Record<string, unknown>).sz = [1, 2];
      expect(normalize(d).fixtures[0].size).toEqual([0, 0, 0]);
    });

    it("id や name が欠けた家具は捨てる", () => {
      const d = base();
      d.fixtures.push({ name: "id なし", sz: [1, 1, 1] } as never);
      d.fixtures.push({ id: 99, sz: [1, 1, 1] } as never);
      expect(normalize(d).fixtures.map((f) => f.id)).toEqual([10, 11]);
    });

    it("キャラID配列に数値以外が混じっても落とす", () => {
      const d = base();
      (d.fixtures[0] as Record<string, unknown>).tc = [1, "2", null, 21];
      expect(normalize(d).fixtures[0].talkChars).toEqual([1, 21]);
    });

    it("characters が欠けても fixtures は読める", () => {
      const d = base();
      (d as Record<string, unknown>).characters = "こわれた";
      const out = normalize(d);
      expect(out.characters).toEqual([]);
      expect(out.fixtures).toHaveLength(2);
    });

    it("unit が無いキャラも落とさない（空文字にする）", () => {
      const d = base();
      delete (d.characters[0] as Record<string, unknown>).unit;
      expect(normalize(d).characters[0].unit).toBe("");
    });
  });
});
