/**
 * @vitest-environment jsdom
 *
 * まとめて遊ぶ（5 枚まで）: 入り方・カードを足す・遊んだ曲を全部のカードに反映・カードの設定・読めないカード・保存。
 * jsdom では盤面の区画の幅が測れない（0）ので、スマホと同じ切り替え式で描かれる（並べ方は boardLayout.test.ts）。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { BingoMusic } from "./bingoLogic";
import { buildRandomCard, encodeSeed } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import { buildOdaiCandidates, buildOdaiCard, createRng, encodeOdaiSeed } from "./odaiLogic";
import { decodeCardCode } from "./bingoShare";
import { matchingCells } from "./bingoPlayed";
import { BINGO_STORAGE_KEY } from "./bingoStorage";
import { MULTI_STORAGE_KEY, type SavedMulti } from "./multiStorage";
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
afterEach(cleanup);

const CANDIDATES = buildOdaiCandidates(mockMusics);
const ODAI_A = buildOdaiCard(CANDIDATES, createRng(1));
const ODAI_B = buildOdaiCard(CANDIDATES, createRng(2));
const SONG = buildRandomCard(mockMusics, "free", null);
const entry = (id: string, code: string, name = "") => ({ id, name, code, addedAt: 1_790_000_000_000, paused: [] });
const saveSet = (cards: ReturnType<typeof entry>[], open = true) =>
  localStorage.setItem(MULTI_STORAGE_KEY, JSON.stringify({ open, active: 0, cols: 0, cards } satisfies SavedMulti));
const savedSet = () => JSON.parse(localStorage.getItem(MULTI_STORAGE_KEY) ?? "{}") as SavedMulti;
/** 保存されたカードの、埋めたマスの番号。 */
const filledOf = (code: string) =>
  decodeCardCode(code, mockMusics).card.flatMap((c, i) => (c !== "FREE" && c.cleared ? [i] : []));
const dialog = () => screen.getByRole("dialog");

describe("入り方", () => {
  it("「ほかのカードと並べて遊ぶ」で、見ていたカードが 1 枚目に入る。1 枚の保存は変えない。開き直すとまとめて遊ぶで開く", () => {
    render(<BingoGenerator />);
    const single = localStorage.getItem(BINGO_STORAGE_KEY);
    const singleOdai = (JSON.parse(single!) as { odai: string }).odai;
    fireEvent.click(screen.getByRole("button", { name: "ほかのカードと並べて遊ぶ（5枚まで）" }));
    expect(screen.getByRole("button", { name: "1 枚で遊ぶに戻る" })).toBeTruthy();
    expect(savedSet().open).toBe(true);
    expect(savedSet().cards.map((c) => c.code)).toEqual([singleOdai]);
    expect(localStorage.getItem(BINGO_STORAGE_KEY)).toBe(single);
    cleanup();
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "1 枚で遊ぶに戻る" }));
    expect(screen.getByRole("heading", { name: "カード" })).toBeTruthy();
    expect(savedSet().open).toBe(false);
  });

  it("リンク（?card=）から開いたときは、まとめて遊ぶを見ていても 1 枚で遊ぶで開く", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    window.history.replaceState(null, "", `/bingo?card=${encodeURIComponent(encodeSeed(SONG))}`);
    try {
      render(<BingoGenerator />);
      expect(screen.queryByRole("button", { name: "1 枚で遊ぶに戻る" })).toBeNull();
      expect(screen.getByRole("heading", { name: "カード" })).toBeTruthy();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});

describe("カードを足す", () => {
  it("今の設定で作ったカードを足し、お題と曲名を混ぜて 5 枚まで。6 枚目は押せない", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "カードを足す（1/5）" }));
    fireEvent.click(screen.getByRole("radio", { name: "曲名ビンゴ" }));
    fireEvent.click(screen.getByRole("button", { name: "カードを足す（2/5）" }));
    fireEvent.click(screen.getByRole("button", { name: "カードを足す（3/5）" }));
    fireEvent.click(screen.getByRole("radio", { name: "お題ビンゴ" }));
    fireEvent.click(screen.getByRole("button", { name: "カードを足す（4/5）" }));
    const full = screen.getByRole("button", { name: "カードは 5 枚まで" }) as HTMLButtonElement;
    expect(full.disabled).toBe(true);
    const kinds = savedSet().cards.map((c) => decodeCardCode(c.code, mockMusics).kind);
    expect(kinds).toEqual(["odai", "odai", "song", "song", "odai"]);
    // 足したカードがすぐ見えるよう、最後のカードを選ぶ
    expect(screen.getByRole("button", { name: "カード5" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("「コードから開く」はそのカードを足す", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    render(<BingoGenerator />);
    fireEvent.click(screen.getByText(/細かい設定/));
    fireEvent.change(screen.getByRole("textbox", { name: "コードかリンク" }), { target: { value: encodeSeed(SONG) } });
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(savedSet().cards.map((c) => c.code)).toEqual([encodeOdaiSeed(ODAI_A), encodeSeed(SONG)]);
  });
});

describe("遊んだ曲を全部のカードに反映", () => {
  // 曲名のカードにある曲のうち、お題のカード 2 枚でも当てはまるマスが多く、曲名で一意に引ける曲
  const unique = (m: BingoMusic) => mockMusics.filter((o) => o.title.startsWith(m.title)).length === 1;
  const onSong = SONG.filter((c): c is Exclude<(typeof SONG)[number], "FREE"> => c !== "FREE").filter(unique);
  const hits = (m: BingoMusic) => matchingCells(ODAI_A, m).length + matchingCells(ODAI_B, m).length;
  const target = [...onSong].sort((a, b) => hits(b) - hits(a))[0];

  it("カードごとに当てはまるマスを並べ、「まとめて埋める」で全部のカードの当てはまるマスだけが埋まる", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A)), entry("b2", encodeOdaiSeed(ODAI_B), "友だち"), entry("c3", encodeSeed(SONG))]);
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "遊んだ曲を入れる" }));
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: target.title } });
    fireEvent.click(within(dialog()).getAllByRole("button").find((b) => b.textContent?.startsWith(target.title))!);
    const sheet = dialog();
    expect(within(sheet).getByRole("heading", { name: target.title })).toBeTruthy();
    expect(within(sheet).getByText("友だち")).toBeTruthy();
    expect(within(sheet).getByText("カードにあります")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: /まとめて埋める/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const [a, b, c] = savedSet().cards;
    expect(filledOf(a.code)).toEqual(matchingCells(ODAI_A, target));
    expect(filledOf(b.code)).toEqual(matchingCells(ODAI_B, target));
    expect(filledOf(c.code)).toEqual([SONG.findIndex((x) => x !== "FREE" && x.id === target.id)]);
    // 最初に埋めたカードにはプレイ開始の時刻が付く
    expect(c.startedAt).toBeGreaterThan(0);
    // 閉じたらフォーカスは「遊んだ曲を入れる」へ
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "遊んだ曲を入れる" }));
  });

  it("× で閉じたら、どのカードも変わらない", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A)), entry("c3", encodeSeed(SONG))]);
    render(<BingoGenerator />);
    const before = localStorage.getItem(MULTI_STORAGE_KEY);
    fireEvent.click(screen.getByRole("button", { name: "遊んだ曲を入れる" }));
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: target.title } });
    fireEvent.click(within(dialog()).getAllByRole("button").find((b) => b.textContent?.startsWith(target.title))!);
    fireEvent.click(within(dialog()).getByRole("button", { name: "閉じる" }));
    expect(localStorage.getItem(MULTI_STORAGE_KEY)).toBe(before);
  });
});

describe("カードの設定", () => {
  it("名前は閉じたときに整えて残り（制御文字を落とし 16 字まで）、見出しと切り替えに出る", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A)), entry("b2", encodeSeed(SONG))]);
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "カード1の設定" }));
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: "  わたし\nのカード  " } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "閉じる" }));
    expect(savedSet().cards[0].name).toBe("わたしのカード");
    expect(screen.getByRole("heading", { name: "わたしのカード" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "わたしのカード" })).toBeTruthy();
  });

  it("埋めたマスのあるカードを外すときは確かめる", () => {
    const filled = [...ODAI_A];
    const first = filled.findIndex((c) => c !== "FREE");
    filled[first] = { ...(filled[first] as Exclude<(typeof filled)[number], "FREE">), cleared: true };
    saveSet([entry("a1", encodeOdaiSeed(filled)), entry("b2", encodeSeed(SONG))]);
    render(<BingoGenerator />);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "カード1の設定" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "このカードを外す" }));
    expect(savedSet().cards).toHaveLength(2);
    fireEvent.click(within(dialog()).getByRole("button", { name: "このカードを外す" }));
    expect(savedSet().cards.map((c) => c.id)).toEqual(["b2"]);
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });
});

describe("読めないカード・壊れた保存・ほかのタブ", () => {
  // 楽曲データに無い曲（id 2000）が入った曲名のコード。配信が止まった曲のカードと同じく読めない
  const BROKEN_CODE = `fQ${encodeSeed(SONG).slice(2)}`;

  it("読めないカードは黙って落とさず行で残し、保存の文字列も変わらない。外すのは押したときだけ", () => {
    saveSet([entry("x9", BROKEN_CODE, "前のカード"), entry("a1", encodeOdaiSeed(ODAI_A))]);
    const before = localStorage.getItem(MULTI_STORAGE_KEY);
    render(<BingoGenerator />);
    expect(screen.getByText(/このカードは読めません/)).toBeTruthy();
    expect(localStorage.getItem(MULTI_STORAGE_KEY)).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "前のカードの設定" }));
    expect(within(dialog()).getByRole("button", { name: "コードをコピー" })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "このカードを外す" }));
    expect(savedSet().cards.map((c) => c.id)).toEqual(["a1"]);
  });

  it("壊れた保存は空のセットとして扱い、1 枚で遊ぶで開く", () => {
    localStorage.setItem(MULTI_STORAGE_KEY, "{broken");
    render(<BingoGenerator />);
    expect(screen.getByRole("heading", { name: "カード" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ほかのカードと並べて遊ぶ（5枚まで）" }));
    expect(savedSet().cards).toHaveLength(1);
  });

  it("ほかのタブが保存を変えたら、読み直して画面に出す（見ている画面はこのタブのまま）", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    render(<BingoGenerator />);
    expect(screen.getAllByRole("button", { name: /^カード\d$/ })).toHaveLength(1);
    const next = JSON.stringify({ open: false, active: 0, cols: 0, cards: [entry("a1", encodeOdaiSeed(ODAI_A)), entry("b2", encodeSeed(SONG))] });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: MULTI_STORAGE_KEY, newValue: next }));
    });
    expect(screen.getAllByRole("button", { name: /^カード\d$/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "1 枚で遊ぶに戻る" })).toBeTruthy();
  });
});
