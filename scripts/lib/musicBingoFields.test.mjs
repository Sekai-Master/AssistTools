import { describe, expect, it } from "vitest";
import {
  compact,
  difficultyFields,
  indexVocals,
  musicFields,
  previousVocalsFrom,
  resolveVocals,
  stringifyCompactNumbers,
} from "./musicBingoFields.mjs";

const singer = (characterId, characterType = "game_character") => ({ characterType, characterId });
const vocal = (musicId, musicVocalType, characters) => ({ musicId, musicVocalType, characters });

describe("歌唱の表（musicVocals.json）の索引", () => {
  const index = indexVocals([
    vocal(1, "sekai", [singer(5), singer(6), singer(7), singer(8), singer(21)]),
    vocal(1, "another_vocal", [singer(1), singer(6)]),
    vocal(1, "virtual_singer", [singer(21), singer(99, "outside_character")]),
    vocal(2, "april_fool_2022", [singer(4), singer(12), singer(18), singer(22), singer(23), singer(25)]),
    vocal(3, "original_song", [singer(7, "outside_character")]),
  ]);

  it("すべての ver. で歌うゲームのキャラを、重複なし・昇順で持つ（アナザーボーカル込み）", () => {
    expect(index.get(1).singers).toEqual([1, 5, 6, 7, 8, 21]);
  });

  it("ゲームの外の歌い手は singers に入れないが、1 つの ver. の人数には数える", () => {
    expect(index.get(3).singers).toEqual([]);
    expect(index.get(3).maxSingers).toBe(1);
    expect(index.get(1).maxSingers).toBe(5);
  });

  it("エイプリルフールの ver. があれば hasAprilFool", () => {
    expect(index.get(2).hasAprilFool).toBe(true);
    expect(index.get(2).maxSingers).toBe(6);
    expect(index.get(1).hasAprilFool).toBe(false);
  });

  it("壊れた行は捨てる・配列でなければ空", () => {
    const broken = indexVocals([null, { musicId: 1 }, { characters: [] }, vocal(4, "sekai", [null, singer("x")])]);
    expect([...broken.keys()]).toEqual([4]);
    expect(broken.get(4).singers).toEqual([]);
    expect(indexVocals(undefined).size).toBe(0);
  });
});

describe("1 曲の歌唱の項目", () => {
  const index = indexVocals([vocal(1, "sekai", [singer(2), singer(1)])]);
  const previous = previousVocalsFrom([
    { id: "001", singers: [9, 10], maxSingers: 2 },
    { id: "002", singers: [1], maxSingers: 6, hasAprilFool: true },
  ]);

  it("表があれば表から取り、偽・0・空の項目は書かない", () => {
    expect(resolveVocals(1, index, previous)).toEqual({ fields: { singers: [1, 2], maxSingers: 2 }, source: "table" });
    // 表にあるのに行が無い曲は、直前の値を引き継がない（表が正）
    expect(resolveVocals(2, index, previous)).toEqual({ fields: {}, source: "none" });
  });

  // ★ 表が取れない日も、ビンゴのためだけに更新全体を止めない
  it("表が空なら、直前の配信データの値を引き継ぐ", () => {
    const empty = indexVocals([]);
    expect(resolveVocals(2, empty, previous)).toEqual({
      fields: { singers: [1], maxSingers: 6, hasAprilFool: true },
      source: "previous",
    });
    expect(resolveVocals(3, empty, previous)).toEqual({ fields: {}, source: "none" });
  });

  it("直前の配信データの壊れた値は捨てる", () => {
    const p = previousVocalsFrom([null, { id: "x" }, { id: "005", singers: [1, "2", 3.5], maxSingers: "6", hasAprilFool: "yes" }]);
    expect([...p.keys()]).toEqual([5]);
    expect(p.get(5)).toEqual({ singers: [1], maxSingers: 0, hasAprilFool: false });
    expect(previousVocalsFrom(undefined).size).toBe(0);
  });
});

describe("musics.json の項目", () => {
  it("3DMV で踊る人数", () => {
    expect(musicFields({ dancerCount: 3, lyricist: "kz", composer: "kz" })).toEqual({ dancerCount: 3 });
  });

  it("作詞と作曲が、空白を除いて両方とも空でなく、違う人のときだけ lyricsByOther", () => {
    expect(musicFields({ lyricist: "A", composer: "B" }).lyricsByOther).toBe(true);
    expect(musicFields({ lyricist: "DECO*27", composer: " DECO*27 " }).lyricsByOther).toBeUndefined();
    expect(musicFields({ lyricist: "ナユタン 星人", composer: "ナユタン星人" }).lyricsByOther).toBeUndefined();
    // 全角・半角と大文字・小文字の違いは同じ人
    expect(musicFields({ lyricist: "ＤＥＣＯ＊２７", composer: "deco*27" }).lyricsByOther).toBeUndefined();
    expect(musicFields({ lyricist: "  ", composer: "B" }).lyricsByOther).toBeUndefined();
    expect(musicFields({ composer: "B" }).lyricsByOther).toBeUndefined();
    expect(musicFields(undefined)).toEqual({});
  });
});

describe("譜面の項目", () => {
  it("EXPERT・MASTER・APPEND のレベルと MASTER のノーツ数。APPEND は譜面がある曲だけ", () => {
    const rows = {
      easy: { playLevel: 5, totalNoteCount: 200 },
      expert: { playLevel: 26, totalNoteCount: 700 },
      master: { playLevel: 30, totalNoteCount: 950 },
    };
    expect(difficultyFields(rows)).toEqual({ expertLevel: 26, masterLevel: 30, masterNotes: 950 });
    expect(difficultyFields({ ...rows, append: { playLevel: 31 } }).appendLevel).toBe(31);
    expect(difficultyFields(undefined)).toEqual({});
  });
});

describe("compact と JSON の書き方", () => {
  it("値が無い・偽・0・空の配列は落とす", () => {
    expect(compact({ a: 0, b: false, c: undefined, d: null, e: [], f: 1, g: true, h: [2], i: NaN })).toEqual({
      f: 1,
      g: true,
      h: [2],
    });
  });

  it("数の配列だけ 1 行に詰め、曲名の中の [1, 2] は変えない", () => {
    const value = [{ id: "001", title: "a [1, 2]\u0000nums:3", categories: ["mv_3d", "original"], singers: [1, 21, 22] }];
    const json = stringifyCompactNumbers(value);
    expect(json).toContain('"singers": [1, 21, 22]');
    expect(json).toContain('"categories": [\n');
    expect(JSON.parse(json)).toEqual(value);
  });

  it("NaN・Infinity を含む配列は詰めない（目印の文字列を残さない）", () => {
    const json = stringifyCompactNumbers([{ singers: [1, NaN, Infinity] }]);
    expect(json).not.toContain("nums:");
    expect(JSON.parse(json)).toEqual([{ singers: [1, null, null] }]);
  });
});
