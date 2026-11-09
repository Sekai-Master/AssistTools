import { describe, expect, it } from "vitest";
import {
  EXPORT_APP,
  EXPORT_VERSION,
  MAX_EXPORT_BYTES,
  buildMultiExport,
  exportFileName,
  parseMultiExport,
  shortTime,
} from "./multiExport";
import type { SavedMulti } from "./multiStorage";

const SET: SavedMulti = {
  open: true,
  active: 1,
  cols: 2,
  cards: [
    { id: "a1", name: "わたし", code: "OD1:u1.u2", addedAt: 1_790_000_000_000, startedAt: 1_790_000_100_000, paused: [] },
    {
      id: "b2",
      name: "友だち",
      code: "OD1:u3.u4",
      addedAt: 1_790_000_000_000,
      paused: [
        [1_790_000_200_000, 1_790_000_300_000],
        [1_790_000_400_000, null],
      ],
    },
  ],
};
const NOW = 1_790_000_500_000;
const text = (v: unknown) => JSON.stringify(v);

describe("buildMultiExport（中断用の書き出し）", () => {
  it("アプリの名前・版・書き出した時刻・セットの全部（名前・休止の区間・時刻）を持ち、遊んだ曲はまだ空", () => {
    const file = buildMultiExport(SET, NOW);
    expect(file).toEqual({ app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: NOW, multi: SET, played: [] });
  });

  it("書き出して読み込むと同じセットに戻る（読むときは「まとめて遊ぶ」で開く）", () => {
    const r = parseMultiExport(text(buildMultiExport({ ...SET, open: false }, NOW)));
    expect(r).toEqual({ ok: true, multi: SET, exportedAt: NOW, dropped: 0 });
  });

  it("ファイル名は sekaimaster-bingo-YYYYMMDD-HHmm.json、読み込んだときの時刻は「11/12 09:03」の形（この端末の時刻）", () => {
    expect(exportFileName(new Date(2026, 10, 12, 9, 3))).toBe("sekaimaster-bingo-20261112-0903.json");
    expect(shortTime(new Date(2026, 10, 12, 9, 3).getTime())).toBe("11/12 09:03");
  });
});

describe("parseMultiExport（読み込み。読めないときは理由を返し、セットを作らない）", () => {
  const ok = (over: Record<string, unknown> = {}) => text({ ...buildMultiExport(SET, NOW), ...over });
  const errorOf = (raw: string) => {
    const r = parseMultiExport(raw);
    if (r.ok) throw new Error("読めてしまった");
    return r.error;
  };

  it("JSON でない", () => {
    expect(errorOf("{oops")).toBe("ファイルを読めませんでした（ビンゴの書き出しではありません）");
    expect(errorOf("")).toBe("ファイルを読めませんでした（ビンゴの書き出しではありません）");
  });

  it("オブジェクトでない・アプリの名前が違う（設定画面の書き出しなど）", () => {
    expect(errorOf("[]")).toBe("ビンゴの書き出しではありません");
    expect(errorOf("null")).toBe("ビンゴの書き出しではありません");
    expect(errorOf(text({ app: "sekai-master-tools", version: 1, data: {} }))).toBe("ビンゴの書き出しではありません");
  });

  it("知らない新しい版は読まない。版の形が違えば壊れている", () => {
    expect(errorOf(ok({ version: 2 }))).toBe("新しい版の書き出しです。ページを読み込み直してから試してください");
    expect(errorOf(ok({ version: "1" }))).toBe("書き出しが壊れています（版が読めません）");
    expect(errorOf(ok({ version: 0 }))).toBe("書き出しが壊れています（版が読めません）");
  });

  it("大きすぎる（2MB 超）ものは読まない", () => {
    expect(errorOf(" ".repeat(MAX_EXPORT_BYTES + 1))).toBe("ファイルが大きすぎます（2MB まで）");
  });

  it("セットの欄が無い・オブジェクトでない・カードが 1 枚も無い", () => {
    expect(errorOf(ok({ multi: undefined }))).toBe("書き出しが壊れています（カードの欄が読めません）");
    expect(errorOf(ok({ multi: [1] }))).toBe("書き出しが壊れています（カードの欄が読めません）");
    expect(errorOf(ok({ multi: { cards: [] } }))).toBe("書き出しにカードが入っていません");
    expect(errorOf(ok({ multi: { cards: [{ id: "!!", code: "x" }] } }))).toBe("書き出しにカードが入っていません");
  });

  it("遊んだ曲が入っている書き出しは、この版では読まない（黙って一覧を捨てない）。形が違えば壊れている", () => {
    expect(errorOf(ok({ played: [{ id: 1, at: NOW }] }))).toBe(
      "遊んだ曲の一覧が入った、新しい版の書き出しです。ページを読み込み直してから試してください"
    );
    expect(errorOf(ok({ played: "x" }))).toBe("書き出しが壊れています（遊んだ曲の欄が読めません）");
    // 欄が無いのは空と同じ
    expect(parseMultiExport(ok({ played: undefined })).ok).toBe(true);
  });

  it("カードは 1 件ずつ読み、形の合わない件だけ落として数を返す。楽曲データで読めるかはここでは見ない", () => {
    const bad = { id: "!!", name: "x", code: "OD1:a", addedAt: 1, paused: [] };
    const unknownSong = { id: "c3", name: "", code: "fQ0000", addedAt: 1, paused: [] };
    const r = parseMultiExport(ok({ multi: { ...SET, cards: [SET.cards[0], bad, unknownSong] } }));
    expect(r.ok && r.dropped).toBe(1);
    expect(r.ok && r.multi.cards.map((c) => c.id)).toEqual(["a1", "c3"]);
  });

  it("書き出した時刻が読めなければ null（読み込みは止めない）", () => {
    const r = parseMultiExport(ok({ exportedAt: "x" }));
    expect(r.ok && r.exportedAt).toBeNull();
  });
});
