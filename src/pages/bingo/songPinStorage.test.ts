import { describe, expect, it } from "vitest";
import {
  SONG_PINS_STORAGE_KEY,
  loadSongPins,
  parseSavedSongPins,
  resolveSavedSongPins,
  saveSongPins,
  summarizeSavedSongPins,
} from "./songPinStorage";

/** 読み書きを覚えておく、Storage の代わり。throws を立てると全部の操作で例外を投げる。 */
function memoryStorage(initial: Record<string, string> = {}, throws = false) {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (throws) throw new Error("denied");
  };
  return {
    data,
    getItem: (k: string) => (guard(), data.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void data.set(k, v)),
    removeItem: (k: string) => (guard(), void data.delete(k)),
  };
}

describe("parseSavedSongPins（入れたい曲の保存を読む）", () => {
  it("曲 id の文字列の配列を、そのまま読む", () => {
    expect(parseSavedSongPins(JSON.stringify(["549", "187"]))).toEqual(["549", "187"]);
  });

  it("無い・JSON でない・配列でない・null は空", () => {
    expect(parseSavedSongPins(null)).toEqual([]);
    expect(parseSavedSongPins("{oops")).toEqual([]);
    expect(parseSavedSongPins(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(parseSavedSongPins("null")).toEqual([]);
  });

  it("文字列でない・id の形でない・重複は黙って落とす", () => {
    expect(parseSavedSongPins(JSON.stringify(["549", 187, null, "abc", "12345", "", "549", "001"]))).toEqual([
      "549",
      "001",
    ]);
  });

  it("24 個まで", () => {
    const ids = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(3, "0"));
    expect(parseSavedSongPins(JSON.stringify(ids))).toEqual(ids.slice(0, 24));
  });
});

describe("resolveSavedSongPins", () => {
  it("楽曲データに無い id（配信停止・公開前）は黙って落とす", () => {
    const known = new Map([["549", {}], ["187", {}]]);
    expect(resolveSavedSongPins(["549", "999", "187"], known)).toEqual(["549", "187"]);
  });
});

describe("loadSongPins / saveSongPins", () => {
  it("書いて読み直せる。空なら消す（設定画面の一覧に空の項目を出さない）", () => {
    const s = memoryStorage();
    saveSongPins(["549"], s);
    expect(s.data.get(SONG_PINS_STORAGE_KEY)).toBe('["549"]');
    expect(loadSongPins(s)).toEqual(["549"]);
    saveSongPins([], s);
    expect(s.data.has(SONG_PINS_STORAGE_KEY)).toBe(false);
  });

  it("localStorage が投げても、読みは空・書きは黙って何もしない", () => {
    const s = memoryStorage({}, true);
    expect(loadSongPins(s)).toEqual([]);
    expect(() => saveSongPins(["549"], s)).not.toThrow();
    expect(loadSongPins(null)).toEqual([]);
  });
});

describe("summarizeSavedSongPins（設定画面とプライバシーポリシーの台帳）", () => {
  it("数を出す。空なら null、配列でなければ壊れている", () => {
    expect(summarizeSavedSongPins('["549","187"]', "壊れています")).toBe("2 曲");
    expect(summarizeSavedSongPins("[]", "壊れています")).toBeNull();
    expect(summarizeSavedSongPins("{}", "壊れています")).toBe("壊れています");
    expect(summarizeSavedSongPins("{oops", "壊れています")).toBe("壊れています");
  });
});
