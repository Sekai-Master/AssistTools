/**
 * 共有リンクの符号化。
 *
 * ★ ここで一番大事なのは「他人から渡された文字列で画面が落ちない」こと。
 *   壊れた入力・悪意のある入力を投げても、例外ではなく空集合が返ること。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { decodeWish, encodeWish, readWishFromUrl, wishUrl, WISH_PARAM } from "./wishlist";

describe("往復して元に戻る", () => {
  it("ふつうの集合", () => {
    const ids = [1, 5, 42, 300, 1676];
    expect([...decodeWish(encodeWish(ids))].sort((a, b) => a - b)).toEqual(ids);
  });

  it("1件だけ", () => {
    expect([...decodeWish(encodeWish([7]))]).toEqual([7]);
  });

  it("空なら空文字。空文字を戻しても空", () => {
    expect(encodeWish([])).toBe("");
    expect(decodeWish("").size).toBe(0);
  });

  it("順番と重複は正規化される", () => {
    expect([...decodeWish(encodeWish([9, 3, 9, 1]))]).toEqual([1, 3, 9]);
  });

  /** ★ ID は 1〜1676 に密集し、1件だけ 900002 という外れ値がある。 */
  it("桁の離れた外れ値（900002）も往復する", () => {
    const ids = [1, 2, 1676, 900002];
    expect([...decodeWish(encodeWish(ids))].sort((a, b) => a - b)).toEqual(ids);
  });

  it("実データの全家具1518件でも往復する", () => {
    const data = JSON.parse(readFileSync("public/MysekaiDatas/fixtures.json", "utf8")) as {
      fixtures: { id: number }[];
    };
    const ids = data.fixtures.map((f) => f.id).sort((a, b) => a - b);
    const back = [...decodeWish(encodeWish(ids))].sort((a, b) => a - b);
    expect(back).toEqual(ids);
  });
});

describe("短さ", () => {
  /** X や Discord にそのまま貼れる長さに収まること。 */
  it("100件で 200 文字を超えない", () => {
    const ids = Array.from({ length: 100 }, (_, i) => (i + 1) * 13);
    const code = encodeWish(ids);
    expect(code.length).toBeLessThan(200);
  });

  it("実データ全件（1518件）でも 2500 文字未満", () => {
    const data = JSON.parse(readFileSync("public/MysekaiDatas/fixtures.json", "utf8")) as {
      fixtures: { id: number }[];
    };
    expect(encodeWish(data.fixtures.map((f) => f.id)).length).toBeLessThan(2500);
  });
});

describe("壊れた入力で落ちない", () => {
  const junk = [
    "!!!", "../../etc/passwd", "<script>", "%%%", " ", "\n",
    "a".repeat(50_000), "====", "-_-_-_", "AAAA%", "🙂",
  ];
  it("どれを渡しても例外を投げず、集合を返す", () => {
    for (const s of junk) {
      expect(() => decodeWish(s)).not.toThrow();
      expect(decodeWish(s)).toBeInstanceOf(Set);
    }
  });

  it("記号混じりは弾く（そもそも読まない）", () => {
    expect(decodeWish("abc!def").size).toBe(0);
  });

  it("途中で切れた可変長は、そこまでで打ち切る", () => {
    // 継続ビットが立ったまま終わるバイト列
    const broken = btoa(String.fromCharCode(0x80, 0x80, 0x80))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(() => decodeWish(broken)).not.toThrow();
  });

  it("上限を超える件数は途中で止める（無限に読まない）", () => {
    const many = Array.from({ length: 5000 }, (_, i) => i + 1);
    const back = decodeWish(encodeWish(many));
    expect(back.size).toBeLessThanOrEqual(2001);
  });
});

describe("URL の組み立てと読み取り", () => {
  it("リンクを作って読み戻せる", () => {
    const url = wishUrl([3, 14, 15], "https://example.com/mysekai");
    expect(url).toBeTruthy();
    const back = readWishFromUrl(new URL(url!).search);
    expect([...back].sort((a, b) => a - b)).toEqual([3, 14, 15]);
  });

  it("空のリストならリンクを作らない", () => {
    expect(wishUrl([], "https://example.com/mysekai")).toBeNull();
  });

  it("既存の検索文字列を壊さない", () => {
    const url = wishUrl([1], "https://example.com/mysekai?foo=bar");
    expect(url).toContain("foo=bar");
    expect(url).toContain(WISH_PARAM + "=");
  });

  it("パラメータが無ければ空", () => {
    expect(readWishFromUrl("?other=1").size).toBe(0);
    expect(readWishFromUrl("").size).toBe(0);
  });
});
