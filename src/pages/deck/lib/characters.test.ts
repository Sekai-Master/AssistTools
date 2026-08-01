/**
 * キャラ表が配信データとズレていないことを見る。
 *
 * ★ この表は手打ちなので、配信データ（bonuses.json の unitCharacters）と
 *   突き合わせないと「ユニットを1人取り違えたまま気付かない」が起きる。
 *   取り違えるとエリアアイテムの絞り込みが静かに間違うだけで、画面は普通に動く。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ATTR_LABEL,
  ATTR_ORDER,
  CHARACTERS,
  UNIT_KEY,
  UNIT_NAME,
  UNIT_ORDER,
  UNIT_SHORT,
  characterName,
  charactersOf,
} from "./characters";

const bonuses = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/CardDatas/bonuses.json"), "utf8")
) as { unitCharacters: { id: number; ch: number; unit: string }[] };

const cards = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/CardDatas/cards.json"), "utf8")
) as { cards: { ch: number; attr: string; supportUnit?: string }[] };

describe("キャラ表", () => {
  it("26人ぶんあり、ch が重複していない", () => {
    expect(CHARACTERS).toHaveLength(26);
    expect(new Set(CHARACTERS.map((c) => c.ch)).size).toBe(26);
    expect(CHARACTERS.map((c) => c.ch)).toEqual([...CHARACTERS].sort((a, b) => a.ch - b.ch).map((c) => c.ch));
  });

  it("配信データに出てくる ch を全部知っている", () => {
    const known = new Set(CHARACTERS.map((c) => c.ch));
    for (const ch of new Set(cards.cards.map((c) => c.ch))) expect(known.has(ch)).toBe(true);
  });

  /**
   * ★ VS の6人だけは全ユニットに跨る（unitCharacters に6行ある）。
   *   こちらの表では piapro にしてあるので、「候補が1つだけのキャラは一致」
   *   「複数あるキャラは piapro」で照合する。
   */
  it("ユニットの割り当てが unitCharacters と一致する", () => {
    const byCh = new Map<number, string[]>();
    for (const u of bonuses.unitCharacters) byCh.set(u.ch, [...(byCh.get(u.ch) ?? []), u.unit]);

    for (const c of CHARACTERS) {
      const units = byCh.get(c.ch);
      expect(units, `ch${c.ch} が unitCharacters に無い`).toBeTruthy();
      if (units!.length === 1) expect(c.unit).toBe(units![0]);
      else expect(c.unit).toBe("piapro");
    }
  });

  it("表示名・色の表がユニットと属性を網羅している", () => {
    for (const u of UNIT_ORDER) {
      expect(UNIT_NAME[u]).toBeTruthy();
      expect(UNIT_SHORT[u]).toBeTruthy();
      expect(UNIT_KEY[u]).toBeTruthy();
    }
    expect(new Set(UNIT_ORDER).size).toBe(6);
    expect(new Set(CHARACTERS.map((c) => c.unit))).toEqual(new Set(UNIT_ORDER));

    // 配信データに出てくる属性を全部知っていること。
    for (const attr of new Set(cards.cards.map((c) => c.attr))) {
      expect(ATTR_LABEL[attr], `属性 ${attr} の表示名が無い`).toBeTruthy();
      expect(ATTR_ORDER).toContain(attr as (typeof ATTR_ORDER)[number]);
    }
  });

  it("知らない ch でも落ちずに ch を出す", () => {
    expect(characterName(1)).toBe("星乃一歌");
    expect(characterName(99)).toBe("キャラ99");
  });

  it("ユニットでキャラを引ける", () => {
    expect(charactersOf("light_sound").map((c) => c.ch)).toEqual([1, 2, 3, 4]);
    expect(charactersOf("piapro")).toHaveLength(6);
  });
});
