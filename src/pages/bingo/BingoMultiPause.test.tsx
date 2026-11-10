/**
 * @vitest-environment jsdom
 *
 * まとめて遊ぶの休止と、中断・再開用の完全な書き出し（計画の改訂 11/10 の E・F）。
 * jsdom では盤面の区画の幅が測れない（0）ので、スマホと同じ切り替え式で描かれる。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BingoMusic } from "./bingoLogic";
import { buildRandomCard, encodeSeed } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import { buildOdaiCandidates, buildOdaiCard, createRng, encodeOdaiSeed } from "./odaiLogic";
import { decodeCardCode } from "./bingoShare";
import { matchingCells } from "./bingoPlayed";
import { MULTI_STORAGE_KEY, type SavedMulti, type SavedMultiCard } from "./multiStorage";
import { EXPORT_APP, buildMultiExport } from "./multiExport";
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

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CANDIDATES = buildOdaiCandidates(mockMusics);
const ODAI_A = buildOdaiCard(CANDIDATES, createRng(1));
const ODAI_B = buildOdaiCard(CANDIDATES, createRng(2));
const SONG = buildRandomCard(mockMusics, "free", null);
const T0 = 1_790_000_000_000;
const entry = (id: string, code: string, over: Partial<SavedMultiCard> = {}): SavedMultiCard => ({
  id,
  name: "",
  code,
  addedAt: T0,
  paused: [],
  ...over,
});
const PAUSED: SavedMultiCard["paused"] = [[T0 + 1000, null]];
const saveSet = (cards: SavedMultiCard[]) =>
  localStorage.setItem(MULTI_STORAGE_KEY, JSON.stringify({ open: true, active: 0, cols: 0, cards } satisfies SavedMulti));
const savedSet = () => JSON.parse(localStorage.getItem(MULTI_STORAGE_KEY) ?? "{}") as SavedMulti;
const filledOf = (code: string) =>
  decodeCardCode(code, mockMusics).card.flatMap((c, i) => (c !== "FREE" && c.cleared ? [i] : []));
const dialog = () => screen.getByRole("dialog");
/** 1 マス埋めたお題のカード。 */
const filledOdai = () => {
  const card = [...ODAI_A];
  const first = card.findIndex((c) => c !== "FREE");
  card[first] = { ...(card[first] as Exclude<(typeof card)[number], "FREE">), cleared: true };
  return card;
};

// 曲名のカードにある曲のうち、お題のカード 2 枚でも当てはまるマスが多く、曲名で一意に引ける曲
const unique = (m: BingoMusic) => mockMusics.filter((o) => o.title.startsWith(m.title)).length === 1;
const onSong = SONG.filter((c): c is Exclude<(typeof SONG)[number], "FREE"> => c !== "FREE").filter(unique);
const hits = (m: BingoMusic) => matchingCells(ODAI_A, m).length + matchingCells(ODAI_B, m).length;
const TARGET = [...onSong].sort((a, b) => hits(b) - hits(a))[0];
const pickPlayed = () => {
  fireEvent.click(screen.getByRole("button", { name: "遊んだ曲を入れる" }));
  fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: TARGET.title } });
  fireEvent.click(within(dialog()).getAllByRole("button").find((b) => b.textContent?.startsWith(TARGET.title))!);
};

describe("休止", () => {
  it("カードの設定から休止すると、並びに残したまま「休止中」の帯と［再開する］が出て、区間が保存に入る", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A)), entry("b2", encodeSeed(SONG))]);
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "カード1の設定" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "休止する" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const board = screen.getByRole("region", { name: "カード1" });
    expect(within(board).getByText("休止中")).toBeTruthy();
    expect(within(board).getByRole("button", { name: "再開する" })).toBeTruthy();
    // 盤面は消さずに薄くする（画面共有で盤面が動かない）
    expect(board.querySelector(".grid-cols-5")).toBeTruthy();
    expect(board.querySelector(".opacity-50 .grid-cols-5")).toBeTruthy();
    const [a] = savedSet().cards;
    expect(a.paused).toHaveLength(1);
    expect(a.paused[0][1]).toBeNull();
    // スマホの切り替えにも出る
    expect(screen.getByRole("button", { name: "カード1（休止中）" })).toBeTruthy();
  });

  it("［再開する］で帯が消え、区間が閉じる。設定の文言も入れ替わる", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A), { paused: PAUSED })]);
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "カード1の設定" }));
    expect(within(dialog()).getByRole("button", { name: "再開する" })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "閉じる" }));
    fireEvent.click(within(screen.getByRole("region", { name: "カード1" })).getByRole("button", { name: "再開する" }));
    expect(screen.queryByText("休止中")).toBeNull();
    const [range] = savedSet().cards[0].paused;
    expect(range[0]).toBe(T0 + 1000);
    expect(range[1]).toBeGreaterThan(T0 + 1000);
  });

  it("遊んだ曲は休止中のカードに反映しない。小窓では下に「休止中（反映しません）」として並べる", () => {
    saveSet([
      entry("a1", encodeOdaiSeed(ODAI_A), { name: "休んでいる", paused: PAUSED }),
      entry("b2", encodeOdaiSeed(ODAI_B)),
      entry("c3", encodeSeed(SONG)),
    ]);
    render(<BingoGenerator />);
    const before = savedSet().cards[0].code;
    pickPlayed();
    const sheet = dialog();
    const pausedList = within(sheet).getByRole("list", { name: "休止中（反映しません）" });
    expect(within(pausedList).getByText("休んでいる")).toBeTruthy();
    const open = matchingCells(ODAI_B, TARGET).length + 1;
    fireEvent.click(within(sheet).getByRole("button", { name: `まとめて埋める（${open}マス）` }));
    const [a, b, c] = savedSet().cards;
    expect(a.code).toBe(before);
    expect(filledOf(b.code)).toEqual(matchingCells(ODAI_B, TARGET));
    expect(filledOf(c.code)).toHaveLength(1);
  });

  it("小窓を開いている間にほかのタブで休止したカードにも反映しない", () => {
    saveSet([entry("b2", encodeOdaiSeed(ODAI_B)), entry("c3", encodeSeed(SONG))]);
    render(<BingoGenerator />);
    pickPlayed();
    const next = JSON.stringify({ open: true, active: 0, cols: 0, cards: [entry("b2", encodeOdaiSeed(ODAI_B)), entry("c3", encodeSeed(SONG), { paused: PAUSED })] });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: MULTI_STORAGE_KEY, newValue: next, storageArea: localStorage }));
    });
    fireEvent.click(within(dialog()).getByRole("button", { name: /まとめて埋める/ }));
    const [b, c] = savedSet().cards;
    expect(filledOf(b.code)).toEqual(matchingCells(ODAI_B, TARGET));
    expect(filledOf(c.code)).toEqual([]);
  });

  it("読めないカードの設定には休止を出さない（盤面が無く、休止しても見た目が変わらないため）", () => {
    saveSet([entry("x9", `fQ${encodeSeed(SONG).slice(2)}`, { name: "前のカード" })]);
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "前のカードの設定" }));
    expect(within(dialog()).queryByRole("button", { name: "休止する" })).toBeNull();
  });

  it("全部を休止したら「遊んだ曲を入れる」を押せない", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A), { paused: PAUSED }), entry("c3", encodeSeed(SONG), { paused: PAUSED })]);
    render(<BingoGenerator />);
    expect((screen.getByRole("button", { name: "遊んだ曲を入れる" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("全部のカードが休止中です")).toBeTruthy();
  });

  // 休止中のカードでは遊ばない（持ち主の決定 2）。前は帯で隠れていないマスだけ手で埋められ、スマホでは 1 段目の 7 割が隠れた
  it("休止中のカードは盤面のマスを押せない（小窓が開かず、埋まらない）。押せるのは［再開する］だけ", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A), { paused: PAUSED }), entry("c3", encodeSeed(SONG), { paused: PAUSED })]);
    render(<BingoGenerator />);
    const before = savedSet().cards;
    for (const name of ["カード1", "カード2"]) {
      fireEvent.click(screen.getByRole("button", { name: `${name}（休止中）` }));
      const board = screen.getByRole("region", { name });
      const cells = [...board.querySelectorAll<HTMLButtonElement>(".grid-cols-5 button")];
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every((c) => c.disabled)).toBe(true);
      fireEvent.click(cells[3]);
      expect(screen.queryByRole("dialog")).toBeNull();
      // 見出しの［設定］と帯の［再開する］は押せる
      expect((within(board).getByRole("button", { name: `${name}の設定` }) as HTMLButtonElement).disabled).toBe(false);
      expect((within(board).getByRole("button", { name: "再開する" }) as HTMLButtonElement).disabled).toBe(false);
    }
    // カードの中身（埋めた状態）は変わらない（選んでいるカードの番号だけは切り替えで変わる）
    expect(savedSet().cards).toEqual(before);
  });

  // 検分 M2 低-2: 手で埋める経路（updateCards）も、当てる時点の休止を見る
  it("マスの小窓を開いている間にほかのタブでそのカードを休止したら、小窓の［埋める］でも埋まらない", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    render(<BingoGenerator />);
    const board = screen.getByRole("region", { name: "カード1" });
    fireEvent.click(within(board).getAllByRole("button", { pressed: false })[3]);
    const next = JSON.stringify({ open: true, active: 0, cols: 0, cards: [entry("a1", encodeOdaiSeed(ODAI_A), { paused: PAUSED })] });
    localStorage.setItem(MULTI_STORAGE_KEY, next);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: MULTI_STORAGE_KEY, newValue: next, storageArea: localStorage }));
    });
    const fill = screen.queryByRole("button", { name: "埋める" });
    if (fill) fireEvent.click(fill);
    expect(filledOf(savedSet().cards[0].code)).toEqual([]);
  });

  it("再開すると、また押せる", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A), { paused: PAUSED })]);
    render(<BingoGenerator />);
    fireEvent.click(within(screen.getByRole("region", { name: "カード1" })).getByRole("button", { name: "再開する" }));
    const board = screen.getByRole("region", { name: "カード1" });
    const cell = within(board).getAllByRole("button", { pressed: false })[3];
    expect((cell as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cell);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    expect(filledOf(savedSet().cards[0].code)).toHaveLength(1);
  });
});

// ★ 小窓の作法（useModalA11y）は onClose が変わるたびに掛け直し、フォーカスを小窓の先頭（閉じる）へ移す。
//   描くたびに作る関数を渡すと 1 字ごとに欄から外れる（検分 M1b 新-高-1）。M2 で足した・触った所でも起きないことを見る
describe("小窓の入力欄に続けて打てる（1 字ごとにフォーカスが欄から移らない）", () => {
  const openFocused = (name: string) => {
    const button = screen.getByRole("button", { name });
    button.focus();
    fireEvent.click(button);
  };

  it("休止中のカードの設定の名前の欄", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A), { paused: PAUSED })]);
    render(<BingoGenerator />);
    openFocused("カード1の設定");
    const input = within(dialog()).getByRole("textbox") as HTMLInputElement;
    input.focus();
    for (const value of ["休", "休み", "休み中"]) {
      fireEvent.change(input, { target: { value } });
      expect(document.activeElement, `「${value}」のあと`).toBe(input);
    }
    fireEvent.click(within(dialog()).getByRole("button", { name: "再開する" }));
    expect(savedSet().cards[0].name).toBe("休み中");
    expect(savedSet().cards[0].paused[0][1]).not.toBeNull();
  });

  it("遊んだ曲の検索欄。打っている間にほかのタブが保存を変えて（休止など）画面が描き直されても外れない", () => {
    saveSet([entry("b2", encodeOdaiSeed(ODAI_B)), entry("c3", encodeSeed(SONG))]);
    render(<BingoGenerator />);
    openFocused("遊んだ曲を入れる");
    const input = within(dialog()).getByRole("textbox") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "ロ" } });
    const next = JSON.stringify({ open: true, active: 0, cols: 0, cards: [entry("b2", encodeOdaiSeed(ODAI_B), { paused: PAUSED }), entry("c3", encodeSeed(SONG))] });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: MULTI_STORAGE_KEY, newValue: next, storageArea: localStorage }));
    });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "ロウ" } });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("ロウ");
  });
});

describe("中断用の書き出し", () => {
  it("「中断用に書き出す」で、セットの全部（名前・休止の区間・時刻）を JSON のファイルにする", async () => {
    const cards = [entry("a1", encodeOdaiSeed(filledOdai()), { name: "わたし", startedAt: T0 + 5, paused: [[T0 + 10, T0 + 20]] }), entry("c3", encodeSeed(SONG))];
    saveSet(cards);
    let blob: Blob | null = null;
    let fileName = "";
    // jsdom には createObjectURL が無いので、渡されたファイルを受け取るだけのものを置く
    Object.assign(URL, { createObjectURL: (b: Blob) => ((blob = b), "blob:x"), revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      fileName = this.download;
    });
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "中断用に書き出す" }));
    expect(fileName).toMatch(/^sekaimaster-bingo-\d{8}-\d{4}\.json$/);
    const file = JSON.parse(await blob!.text());
    expect(file.app).toBe(EXPORT_APP);
    expect(file.version).toBe(1);
    expect(file.multi.cards).toEqual(cards);
    expect(file.played).toEqual([]);
    expect(screen.getByRole("status").textContent).toContain("書き出しました");
  });

  const fileOf = (content: string) => new File([content], "bingo.json", { type: "application/json" });
  const choose = (file: File) => fireEvent.change(screen.getByLabelText("書き出しのファイル"), { target: { files: [file] } });
  const exported = (cards: SavedMultiCard[]) =>
    // 書き出した時刻は過去の日にする（時刻は「今から 1 日先」までしか読まない決まりになった。検分 P 安全の低-1。前は 11/12 の先の日だった）
    JSON.stringify(buildMultiExport({ open: true, active: 0, cols: 0, cards }, new Date(2026, 9, 12, 15, 3).getTime()));

  it("読み込むと続きから遊べる（名前・埋めた状態・休止）。埋めたマスが無ければ確かめない", async () => {
    saveSet([entry("z9", encodeOdaiSeed(ODAI_B))]);
    const confirm = vi.spyOn(window, "confirm");
    render(<BingoGenerator />);
    const incoming = [entry("a1", encodeOdaiSeed(filledOdai()), { name: "わたし" }), entry("b2", encodeSeed(SONG), { paused: PAUSED })];
    choose(fileOf(exported(incoming)));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("10/12 15:03 に書き出したカード 2 枚を読み込みました"));
    expect(confirm).not.toHaveBeenCalled();
    expect(savedSet().cards).toEqual(incoming);
    expect(screen.getByRole("heading", { name: "わたし" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "カード2（休止中）" })).toBeTruthy();
  });

  it("今のセットに埋めたマスがあれば確かめ、やめたら何も変えない", async () => {
    saveSet([entry("z9", encodeOdaiSeed(filledOdai()))]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<BingoGenerator />);
    const before = localStorage.getItem(MULTI_STORAGE_KEY);
    choose(fileOf(exported([entry("a1", encodeSeed(SONG))])));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toContain("いまのカード（1枚）");
    expect(localStorage.getItem(MULTI_STORAGE_KEY)).toBe(before);
    choose(fileOf(exported([entry("a1", encodeSeed(SONG))])));
    await waitFor(() => expect(savedSet().cards.map((c) => c.id)).toEqual(["a1"]));
  });

  it("読めない書き出しは理由を出し、今のセットを変えない", async () => {
    saveSet([entry("z9", encodeOdaiSeed(ODAI_B))]);
    render(<BingoGenerator />);
    const before = localStorage.getItem(MULTI_STORAGE_KEY);
    choose(fileOf("not json"));
    expect(await screen.findByText("ファイルを読めませんでした（ビンゴの書き出しではありません）")).toBeTruthy();
    choose(fileOf(JSON.stringify({ app: EXPORT_APP, version: 9, multi: {}, played: [] })));
    expect(await screen.findByText("新しい版の書き出しです。ページを読み込み直してから試してください")).toBeTruthy();
    expect(localStorage.getItem(MULTI_STORAGE_KEY)).toBe(before);
  });

  it("2MB を超えるファイルは中身を読まずに断る", async () => {
    saveSet([entry("z9", encodeOdaiSeed(ODAI_B))]);
    render(<BingoGenerator />);
    const big = fileOf("x".repeat(2_000_001));
    const text = vi.spyOn(big, "text");
    choose(big);
    expect(await screen.findByText("ファイルが大きすぎます（2MB まで）")).toBeTruthy();
    expect(text).not.toHaveBeenCalled();
  });

  it("楽曲データで読めないカードも落とさずに持ってきて、その数を知らせる", async () => {
    saveSet([entry("z9", encodeOdaiSeed(ODAI_B))]);
    render(<BingoGenerator />);
    const broken = `fQ${encodeSeed(SONG).slice(2)}`;
    choose(fileOf(exported([entry("x1", broken, { name: "前のカード" }), entry("a1", encodeOdaiSeed(ODAI_A))])));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("読めないカードが 1 枚あります"));
    expect(screen.getByText(/このカードは読めません/)).toBeTruthy();
    expect(savedSet().cards.map((c) => c.code)).toEqual([broken, encodeOdaiSeed(ODAI_A)]);
  });

  it("カードが無いときは書き出せない（読み込みはできる）", () => {
    saveSet([]);
    render(<BingoGenerator />);
    expect((screen.getByRole("button", { name: "中断用に書き出す" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "書き出しを読み込む" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
