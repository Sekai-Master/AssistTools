/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clampProfile,
  createProfile,
  formatProfileText,
  getActiveProfile,
  getProfiles,
  parseProfileText,
  removeProfile,
  resetProfilesForTest,
  setActiveProfile,
  updateProfile,
} from "./profiles";

beforeEach(() => {
  resetProfilesForTest();
});

describe("貼るだけ入力", () => {
  // Nori が普段使っている書き方。先頭スキル / スキル合計 / 総合力(万)。
  it("150/710/31.3 を読む", () => {
    expect(parseProfileText("150/710/31.3")).toEqual({
      skillLeader: 150,
      skillTotal: 710,
      power: 313000,
    });
  });

  it("イベントボーナスまで書いてあれば読む", () => {
    expect(parseProfileText("150/710/31.3/170%")).toEqual({
      skillLeader: 150,
      skillTotal: 710,
      power: 313000,
      bonus: 170,
    });
  });

  // ゲーム内やメモからのコピーは区切りが揃っていない。
  it.each([
    ["150 710 31.3", "空白"],
    ["150,710,31.3", "カンマ"],
    ["150、710、31.3", "読点"],
    ["150／710／31.3", "全角スラッシュ"],
    ["150% / 710 / 31.3万", "単位つき"],
    ["１５０/７１０/３１.３", "全角数字"],
  ])("%s（%s）も同じに読む", (text) => {
    expect(parseProfileText(text)).toMatchObject({
      skillLeader: 150,
      skillTotal: 710,
      power: 313000,
    });
  });

  // ★ 総合力は「万」で書く人と実数で書く人が居る。1000未満なら万とみなす
  //   （総合力が1000未満は実運用で起こらない）。
  it("総合力は万でも実数でも同じ値になる", () => {
    expect(parseProfileText("150/710/31.3")?.power).toBe(313000);
    expect(parseProfileText("150/710/313000")?.power).toBe(313000);
  });

  it("数が足りなければ読まない（部分的に埋めない）", () => {
    expect(parseProfileText("150/710")).toBeNull();
    expect(parseProfileText("")).toBeNull();
    expect(parseProfileText("よくわからない文字列")).toBeNull();
  });

  it("読んだものは貼り付けられる形へ戻せる", () => {
    const p = parseProfileText("150/710/31.3/170")!;
    expect(formatProfileText(p)).toBe("150/710/31.3/170%");
    expect(parseProfileText(formatProfileText(p))).toEqual(p);
  });
});

describe("値の検証", () => {
  // 貼り付けも localStorage も外部由来。ありえない値は捨てて未入力に戻す。
  it("範囲外・NaN は落とす", () => {
    expect(clampProfile({ power: -1 })).toEqual({});
    expect(clampProfile({ power: 99_999_999 })).toEqual({});
    expect(clampProfile({ taki: 99 })).toEqual({});
    expect(clampProfile({ bonus: Number.NaN })).toEqual({});
  });

  it("正しい値は素通しする", () => {
    const ok = { power: 313000, bonus: 170, skillLeader: 150, skillTotal: 710, taki: 5 };
    expect(clampProfile(ok)).toEqual(ok);
  });
});

describe("編成の出し入れ", () => {
  it("作ると選択中になる", () => {
    const a = createProfile("メイン", { power: 313000 });
    expect(getProfiles()).toHaveLength(1);
    expect(getActiveProfile()?.id).toBe(a.id);
  });

  it("名前が空でも通し番号で埋める", () => {
    expect(createProfile("  ").name).toBe("編成1");
  });

  it("複数持てて、選び替えられる", () => {
    const a = createProfile("メイン");
    const b = createProfile("チャレライ用");
    expect(getActiveProfile()?.id).toBe(b.id);
    setActiveProfile(a.id);
    expect(getActiveProfile()?.name).toBe("メイン");
  });

  it("更新は id と並び順を書き換えない", () => {
    const a = createProfile("メイン", { power: 100000 });
    updateProfile(a.id, { power: 313000, id: "偽", order: 99 } as never);
    const got = getProfiles()[0];
    expect(got.id).toBe(a.id);
    expect(got.order).toBe(0);
    expect(got.power).toBe(313000);
  });

  it("選択中を消したら別のものへ移る（選択が宙に浮かない）", () => {
    const a = createProfile("メイン");
    const b = createProfile("予備");
    setActiveProfile(b.id);
    removeProfile(b.id);
    expect(getActiveProfile()?.id).toBe(a.id);
    expect(getProfiles()).toHaveLength(1);
  });

  it("全部消したら選択なしになる", () => {
    const a = createProfile("メイン");
    removeProfile(a.id);
    expect(getActiveProfile()).toBeNull();
  });

  it("消したあとも並び順が詰まる", () => {
    const a = createProfile("1");
    createProfile("2");
    createProfile("3");
    removeProfile(a.id);
    expect(getProfiles().map((p) => p.order)).toEqual([0, 1]);
  });
});
