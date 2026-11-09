/**
 * @vitest-environment jsdom
 *
 * 遊んだ曲の一覧（まとめて遊ぶ）: 「まとめて埋める」で記録・休止中のカードは記録しない・この一覧でカードを 1 枚選んで埋める
 * （足した時刻より後・休止の区間の外）・1 曲消すとカードごとのマスを戻す・プレイ開始の印・中断用の書き出しに一覧を入れる。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BingoMusic } from "./bingoLogic";
import { buildRandomCard, encodeSeed } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import { buildOdaiCandidates, buildOdaiCard, createRng, encodeOdaiSeed } from "./odaiLogic";
import { decodeCardCode } from "./bingoShare";
import { matchingCells } from "./bingoPlayed";
import { MULTI_STORAGE_KEY, type SavedMulti, type SavedMultiCard } from "./multiStorage";
import { buildMultiExport } from "./multiExport";
import { PLAYED_STORAGE_KEY, type PlayedEntry } from "./playedStorage";
import BingoGenerator from "./BingoGenerator";

let mockMusics: BingoMusic[] = [];
vi.mock("./useBingoMusics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useBingoMusics")>();
  return {
    ...actual,
    useBingoMusics: () => ({ musics: mockMusics, aliases: [], loading: false, error: null }),
  };
});
mockMusics = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);

// この端末の時刻で 2026-11-12 15:03
const T = new Date(2026, 10, 12, 15, 3).getTime();
const MIN = 60_000;
let now = T;
beforeEach(() => {
  localStorage.clear();
  now = T;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CANDIDATES = buildOdaiCandidates(mockMusics);
const ODAI_A = buildOdaiCard(CANDIDATES, createRng(1));
const ODAI_B = buildOdaiCard(CANDIDATES, createRng(2));
const SONG = buildRandomCard(mockMusics, "free", null);
const unique = (m: BingoMusic) => mockMusics.filter((o) => o.title.startsWith(m.title)).length === 1;
// お題の 2 枚の両方で当てはまるマスがあり、曲名のカードにもある曲
const onSong = SONG.filter((c): c is Exclude<(typeof SONG)[number], "FREE"> => c !== "FREE").filter(unique);
const TARGET = onSong.find((m) => matchingCells(ODAI_A, m).length > 0 && matchingCells(ODAI_B, m).length > 0) ?? onSong[0];
const NONE = mockMusics.find((m) => unique(m) && matchingCells(ODAI_A, m).length === 0 && matchingCells(ODAI_B, m).length === 0 && !onSong.some((s) => s.id === m.id))!;

const entry = (id: string, code: string, over: Partial<SavedMultiCard> = {}): SavedMultiCard => ({
  id,
  name: "",
  code,
  addedAt: T - 60 * MIN,
  paused: [],
  ...over,
});
const saveSet = (cards: SavedMultiCard[]) =>
  localStorage.setItem(MULTI_STORAGE_KEY, JSON.stringify({ open: true, active: 0, cols: 0, cards } satisfies SavedMulti));
const savedSet = () => JSON.parse(localStorage.getItem(MULTI_STORAGE_KEY) ?? "{}") as SavedMulti;
const played = () => JSON.parse(localStorage.getItem(PLAYED_STORAGE_KEY) ?? "[]") as PlayedEntry[];
const savePlayed = (list: PlayedEntry[]) => localStorage.setItem(PLAYED_STORAGE_KEY, JSON.stringify(list));
const filledOf = (code: string) => decodeCardCode(code, mockMusics).card.flatMap((c, i) => (c !== "FREE" && c.cleared ? [i] : []));
const dialog = () => screen.getByRole("dialog");
const pickPlayed = (m: BingoMusic) => {
  fireEvent.click(screen.getByRole("button", { name: "遊んだ曲を入れる" }));
  fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: m.title } });
  fireEvent.click(within(dialog()).getAllByRole("button").find((b) => b.textContent?.startsWith(m.title))!);
};
const openList = () => {
  fireEvent.click(screen.getByRole("button", { name: /^一覧/ }));
  return dialog();
};

describe("まとめて遊ぶで記録する", () => {
  it("「まとめて埋める」で、カードごとにその曲で埋めたマスを記録する。休止中のカードは記録しない", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A)), entry("b2", encodeOdaiSeed(ODAI_B), { paused: [[T - MIN, null]] }), entry("c3", encodeSeed(SONG))]);
    render(<BingoGenerator />);
    pickPlayed(TARGET);
    fireEvent.click(within(dialog()).getByRole("button", { name: /まとめて埋める/ }));
    const songIdx = SONG.findIndex((c) => c !== "FREE" && c.id === TARGET.id);
    expect(played()).toEqual([
      {
        id: TARGET.id,
        at: T,
        cells: [
          ...(matchingCells(ODAI_A, TARGET).length > 0 ? [{ card: "a1", filled: matchingCells(ODAI_A, TARGET) }] : []),
          { card: "c3", filled: [songIdx] },
        ],
      },
    ]);
  });

  it("どのカードにも当てはまらない曲は「遊んだ曲に入れる」で入れる。× で閉じたら入れない", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    render(<BingoGenerator />);
    pickPlayed(NONE);
    fireEvent.click(within(dialog()).getByRole("button", { name: "閉じる" }));
    expect(localStorage.getItem(PLAYED_STORAGE_KEY)).toBeNull();
    pickPlayed(NONE);
    fireEvent.click(within(dialog()).getByRole("button", { name: "遊んだ曲に入れる" }));
    expect(played()).toEqual([{ id: NONE.id, at: T }]);
  });

  it("カードの見出しにプレイ開始の時刻を出す（その画面で付いたときは「プレイ開始！」）", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A), { name: "わたし", startedAt: T - 30 * MIN }), entry("c3", encodeSeed(SONG), { name: "友だち" })]);
    render(<BingoGenerator />);
    expect(screen.getByRole("region", { name: "わたし" }).textContent).toContain("プレイ開始 11/12 14:33");
    fireEvent.click(screen.getByRole("button", { name: "友だち" }));
    pickPlayed(TARGET);
    fireEvent.click(within(dialog()).getByRole("button", { name: /まとめて埋める/ }));
    expect(screen.getByRole("region", { name: "友だち" }).textContent).toContain("プレイ開始！ 11/12 15:03");
  });
});

describe("この一覧でカードを埋める（カードを 1 枚選ぶ）", () => {
  it("選んだカードだけを、足した時刻より後で休止の区間の外の曲で埋める。休止中のカードは選べない", () => {
    const songIdx = SONG.findIndex((c) => c !== "FREE" && c.id === TARGET.id);
    saveSet([
      // 曲を遊んだ時刻（T-20 分）は休止の区間の中
      entry("a1", encodeSeed(SONG), { name: "休んでいた", paused: [[T - 25 * MIN, T - 15 * MIN]] }),
      // 曲を遊んだより後に足した
      entry("b2", encodeSeed(SONG), { name: "あとで足した", addedAt: T - 10 * MIN }),
      entry("c3", encodeSeed(SONG), { name: "ずっと遊んだ" }),
      entry("d4", encodeSeed(SONG), { name: "いま休止", paused: [[T - MIN, null]] }),
    ]);
    savePlayed([{ id: TARGET.id, at: T - 20 * MIN }]);
    render(<BingoGenerator />);
    const sheet = openList();
    fireEvent.click(within(sheet).getByRole("button", { name: "この一覧でカードを埋める" }));
    expect(within(sheet).getByRole("region", { name: "休んでいた" }).textContent).toContain("休止中に遊んだ 1 曲は使いません");
    expect(within(sheet).getByRole("region", { name: "あとで足した" }).textContent).toContain("11/12 14:53 より後の 0 曲では、埋まるマスはありません");
    expect(within(sheet).queryByRole("region", { name: "いま休止" })).toBeNull();
    expect(sheet.textContent).toContain("休止中（埋めません）");
    fireEvent.click(within(within(sheet).getByRole("region", { name: "ずっと遊んだ" })).getByRole("button", { name: "埋める（1マス）" }));
    const codes = savedSet().cards.map((c) => filledOf(c.code));
    expect(codes).toEqual([[], [], [songIdx], []]);
    expect(played()[0].cells).toEqual([{ card: "c3", filled: [songIdx] }]);
  });
});

describe("1 曲消す（まとめて遊ぶのカード）", () => {
  it("その曲で埋めたマスを、カードの名前ごとに見せて戻す。1 枚で遊ぶの画面から消しても戻る", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A), { name: "わたし" }), entry("c3", encodeSeed(SONG), { name: "友だち" })]);
    render(<BingoGenerator />);
    pickPlayed(TARGET);
    fireEvent.click(within(dialog()).getByRole("button", { name: /まとめて埋める/ }));
    // 1 枚で遊ぶに戻ってから消す（一覧は 1 つ）
    fireEvent.click(screen.getByRole("button", { name: "1 枚で遊ぶに戻る" }));
    const sheet = openList();
    fireEvent.click(within(sheet).getByRole("button", { name: `${TARGET.title}（15:03）を一覧から消す` }));
    expect(sheet.textContent).toContain("友だち");
    expect(sheet.textContent).toContain(`曲 ${TARGET.title}`);
    fireEvent.click(within(sheet).getByRole("button", { name: /^マスも戻して消す/ }));
    expect(savedSet().cards.map((c) => filledOf(c.code))).toEqual([[], []]);
    expect(localStorage.getItem(PLAYED_STORAGE_KEY)).toBeNull();
  });
});

describe("中断用の書き出しに遊んだ曲の一覧を入れる", () => {
  const fileOf = (content: string) => new File([content], "bingo.json", { type: "application/json" });
  const choose = (file: File) => fireEvent.change(screen.getByLabelText("書き出しのファイル"), { target: { files: [file] } });

  it("書き出すと一覧も入り、読み込むと一覧も戻る（今の一覧に曲があれば確かめる）", async () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    savePlayed([{ id: NONE.id, at: T - MIN }]);
    let blob: Blob | null = null;
    Object.assign(URL, { createObjectURL: (b: Blob) => ((blob = b), "blob:x"), revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "中断用に書き出す" }));
    const file = JSON.parse(await blob!.text());
    expect(file.played).toEqual([{ id: NONE.id, at: T - MIN }]);

    const incoming: PlayedEntry[] = [{ id: TARGET.id, at: T - 5 * MIN, cells: [{ card: "x1", filled: [3] }] }];
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const text = JSON.stringify(buildMultiExport({ open: true, active: 0, cols: 0, cards: [entry("x1", encodeSeed(SONG))] }, T, incoming));
    choose(fileOf(text));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toContain("遊んだ曲の一覧（1曲）も、書き出しの一覧（1曲）に置き換わります");
    expect(played()).toEqual([{ id: NONE.id, at: T - MIN }]);
    choose(fileOf(text));
    await waitFor(() => expect(played()).toEqual(incoming));
    expect(screen.getByRole("status").textContent).toContain("カード 1 枚と遊んだ曲 1 曲を読み込みました");
  });

  it("一覧の入っていない書き出し（#231 の版）を読んでも、今の一覧は変えない", async () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    savePlayed([{ id: NONE.id, at: T - MIN }]);
    render(<BingoGenerator />);
    choose(fileOf(JSON.stringify(buildMultiExport({ open: true, active: 0, cols: 0, cards: [entry("x1", encodeSeed(SONG))] }, T))));
    await waitFor(() => expect(savedSet().cards.map((c) => c.id)).toEqual(["x1"]));
    expect(played()).toEqual([{ id: NONE.id, at: T - MIN }]);
  });

  it("知らせは操作の列の下に重ねて出し、盤面を押し下げない。× で閉じられる", async () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    render(<BingoGenerator />);
    choose(fileOf("not json"));
    const alert = await screen.findByRole("alert");
    // 重ねる（absolute）ので、並びの流れに入らない
    expect(alert.parentElement!.className).toContain("absolute");
    fireEvent.click(screen.getByRole("button", { name: "知らせを閉じる" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
