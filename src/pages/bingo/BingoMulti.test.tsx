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
      window.dispatchEvent(new StorageEvent("storage", { key: MULTI_STORAGE_KEY, newValue: next, storageArea: localStorage }));
    });
    expect(screen.getAllByRole("button", { name: /^カード\d$/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "1 枚で遊ぶに戻る" })).toBeTruthy();
  });
});

describe("ほかのタブとの行き来（レビューの指摘）", () => {
  it("ほかのタブの保存を読み直した後は書き返さない（見ている画面がタブごとに違っても、出来事が往復しない）", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    render(<BingoGenerator />);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const next = JSON.stringify({ open: false, active: 1, cols: 2, cards: [entry("a1", encodeOdaiSeed(ODAI_A)), entry("b2", encodeSeed(SONG))] });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: MULTI_STORAGE_KEY, newValue: next, storageArea: localStorage }));
    });
    expect(setItem.mock.calls.filter(([k]) => k === MULTI_STORAGE_KEY)).toHaveLength(0);
    setItem.mockRestore();
  });

  it("設定画面で消した（newValue が null）ら空にし、書き直して復活させない", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A))]);
    render(<BingoGenerator />);
    localStorage.removeItem(MULTI_STORAGE_KEY);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: MULTI_STORAGE_KEY, newValue: null, storageArea: localStorage }));
    });
    expect(screen.getByText(/まだカードがありません/)).toBeTruthy();
    expect(localStorage.getItem(MULTI_STORAGE_KEY)).toBeNull();
  });

  it("遊んだ曲の小窓を開いている間にほかのタブが埋めたマスは、「まとめて埋める」で消えない", () => {
    const unique = (m: BingoMusic) => mockMusics.filter((o) => o.title.startsWith(m.title)).length === 1;
    const target = SONG.filter((c): c is Exclude<(typeof SONG)[number], "FREE"> => c !== "FREE").find(unique)!;
    saveSet([entry("c3", encodeSeed(SONG))]);
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "遊んだ曲を入れる" }));
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: target.title } });
    fireEvent.click(within(dialog()).getAllByRole("button").find((b) => b.textContent?.startsWith(target.title))!);
    // ほかのタブで、別のマス（target でない最初のマス）を埋めた
    const other = SONG.findIndex((c) => c !== "FREE" && c.id !== target.id);
    const byOther = SONG.map((c, i) => (i === other && c !== "FREE" ? { ...c, cleared: true } : c));
    const next = JSON.stringify({ open: true, active: 0, cols: 0, cards: [entry("c3", encodeSeed(byOther))] });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: MULTI_STORAGE_KEY, newValue: next, storageArea: localStorage }));
    });
    fireEvent.click(within(dialog()).getByRole("button", { name: /まとめて埋める/ }));
    const targetIndex = SONG.findIndex((c) => c !== "FREE" && c.id === target.id);
    expect(filledOf(savedSet().cards[0].code)).toEqual([other, targetIndex].sort((a, b) => a - b));
  });
});

describe("PC の並べた盤面（区画の幅 1200px・内側の高さ 768px）", () => {
  const withWidth = (w: number) => vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(w);

  it("自動では 2 列・盤面 560px・文言 20px（xl）で並べ、列の切り替えで 1 列にできる（端末に残る）", () => {
    saveSet([entry("a1", encodeOdaiSeed(ODAI_A)), entry("b2", encodeOdaiSeed(ODAI_B)), entry("c3", encodeSeed(SONG))]);
    const spy = withWidth(1200);
    try {
      render(<BingoGenerator />);
      const grid = screen.getAllByRole("region")[0].parentElement!.parentElement!;
      expect(grid.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
      expect(screen.getAllByRole("region")).toHaveLength(3);
      const firstBoard = screen.getByRole("region", { name: "カード1" });
      const texts = [...firstBoard.querySelectorAll(".grid-cols-5 button span.font-bold")];
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.every((t) => t.className.includes("text-xl") || t.className.includes("text-base"))).toBe(true);
      expect((firstBoard.querySelector(".grid-cols-5")!.parentElement as HTMLElement).style.maxWidth).toBe("560px");
      fireEvent.click(within(screen.getByRole("radiogroup", { name: "列の数" })).getByRole("radio", { name: "1" }));
      expect(grid.style.gridTemplateColumns).toBe("repeat(1, minmax(0, 1fr))");
      expect(savedSet().cols).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("前のカードを外しても、見ていたカード（active）は同じカードを指す", () => {
    localStorage.setItem(
      MULTI_STORAGE_KEY,
      JSON.stringify({ open: true, active: 2, cols: 0, cards: [entry("a1", encodeOdaiSeed(ODAI_A)), entry("b2", encodeOdaiSeed(ODAI_B)), entry("c3", encodeSeed(SONG)), entry("d4", encodeOdaiSeed(ODAI_A))] })
    );
    const spy = withWidth(1200);
    try {
      render(<BingoGenerator />);
      fireEvent.click(screen.getByRole("button", { name: "カード1の設定" }));
      fireEvent.click(within(dialog()).getByRole("button", { name: "このカードを外す" }));
      const s = savedSet();
      expect(s.cards[s.active].id).toBe("c3");
    } finally {
      spy.mockRestore();
    }
  });

  it("1 枚で遊ぶのカードは今の見た目のまま（盤面の段の文字にしない）", () => {
    render(<BingoGenerator />);
    const texts = [...document.querySelectorAll(".grid-cols-5 button span.font-bold")];
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((t) => t.className.includes("mt-1 text-xs"))).toBe(true);
    expect(texts.some((t) => t.className.includes("text-xl"))).toBe(false);
  });
});
