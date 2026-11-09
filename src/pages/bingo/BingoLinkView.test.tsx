/**
 * @vitest-environment jsdom
 *
 * リンク（?card=）を開いたとき（計画の改訂 11/10 の G、持ち主の決定 2）。
 * 埋めたマスのある同じ種類のカードを持つ人には「見るだけ」で出し、保存しない。
 * ［このカードで遊ぶ（いまのカードと入れ替える）］・［まとめて遊ぶに足す］・［見るのをやめる］を並べる。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { BingoMusic } from "./bingoLogic";
import { buildRandomCard, encodeSeed } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import { type OdaiCell, buildOdaiCandidates, buildOdaiCard, createRng, encodeOdaiSeed } from "./odaiLogic";
import { decodeCardCode } from "./bingoShare";
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const CANDIDATES = buildOdaiCandidates(mockMusics);
/** n マス埋めたお題のカード。 */
function filled(seed: number, n: number): OdaiCell[] {
  const card = buildOdaiCard(CANDIDATES, createRng(seed));
  let left = n;
  return card.map((c) => (c !== "FREE" && left-- > 0 ? { ...c, cleared: true } : c));
}
const OWN = encodeOdaiSeed(filled(1, 1));
const LINKED = encodeOdaiSeed(filled(2, 2));
const SONG = encodeSeed(buildRandomCard(mockMusics, "free", null));

const saveSingle = (odai: string) => localStorage.setItem(BINGO_STORAGE_KEY, JSON.stringify({ kind: "odai", odai }));
const single = () => JSON.parse(localStorage.getItem(BINGO_STORAGE_KEY) ?? "{}") as { odai?: string; song?: string };
const savedSet = () => JSON.parse(localStorage.getItem(MULTI_STORAGE_KEY) ?? "{}") as SavedMulti;
const openLink = (code: string) => {
  window.history.replaceState(null, "", `/bingo?card=${encodeURIComponent(code)}`);
  render(<BingoGenerator />);
};
const band = () => screen.getByRole("region", { name: "リンクのカード" });
const filledOf = (code: string) =>
  decodeCardCode(code, mockMusics).card.filter((c) => c !== "FREE" && c.cleared).length;
const progressText = () => screen.getByText(/^埋めたマス/).textContent;
const dialog = () => screen.getByRole("dialog");

describe("埋めたマスのある同じ種類のカードを持つ人が開いたとき", () => {
  it("リンクのカードを見るだけで出し、1 行で知らせる（「続きを遊べます」とは書かない）。保存は変えない", () => {
    saveSingle(OWN);
    openLink(LINKED);
    expect(within(band()).getByText((_, el) => el?.tagName === "P" && el.textContent === "リンクのカードを開きました（埋めたマス 2/24）")).toBeTruthy();
    expect(within(band()).getByText("見るだけで開いています。マスを埋めても、この端末には残りません")).toBeTruthy();
    expect(band().textContent).not.toContain("続き");
    expect(progressText()).toContain("2/24");
    expect(single().odai).toBe(OWN);
    // 確かめの「いまのカードは消えます」は出さない
    expect(screen.queryByText(/いまのカードは消えます/)).toBeNull();
  });

  it("見るだけの間にマスを埋めても保存しない", () => {
    saveSingle(OWN);
    openLink(LINKED);
    fireEvent.click(screen.getAllByRole("button", { pressed: false })[0]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    expect(progressText()).toContain("3/24");
    expect(single().odai).toBe(OWN);
  });

  it("［見るのをやめる］で自分のカードに戻る", () => {
    saveSingle(OWN);
    openLink(LINKED);
    fireEvent.click(within(band()).getByRole("button", { name: "見るのをやめる" }));
    expect(screen.queryByRole("region", { name: "リンクのカード" })).toBeNull();
    expect(progressText()).toContain("1/24");
    expect(single().odai).toBe(OWN);
  });

  it("［このカードで遊ぶ（いまのカードと入れ替える）］で、見ていたカード（見る間に埋めたマスごと）を自分のカードにする", () => {
    saveSingle(OWN);
    openLink(LINKED);
    fireEvent.click(screen.getAllByRole("button", { pressed: false })[0]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    fireEvent.click(within(band()).getByRole("button", { name: "このカードで遊ぶ（いまのカードと入れ替える）" }));
    expect(screen.queryByRole("region", { name: "リンクのカード" })).toBeNull();
    expect(filledOf(single().odai!)).toBe(3);
  });

  it("［まとめて遊ぶに足す］で、まとめて遊ぶに自分のカードとリンクのカードを並べる（1 枚で遊ぶの保存は変えない）", () => {
    saveSingle(OWN);
    openLink(LINKED);
    fireEvent.click(within(band()).getByRole("button", { name: "まとめて遊ぶに足す" }));
    expect(screen.getByRole("button", { name: "1 枚で遊ぶに戻る" })).toBeTruthy();
    expect(savedSet().open).toBe(true);
    expect(savedSet().cards.map((c) => c.code)).toEqual([OWN, LINKED]);
    expect(single().odai).toBe(OWN);
  });

  it("まとめて遊ぶにカードがあれば、リンクのカードだけを後ろに足す。5 枚あれば押せない", () => {
    const entry = (id: string, code: string) => ({ id, name: "", code, addedAt: 1_790_000_000_000, paused: [] });
    localStorage.setItem(MULTI_STORAGE_KEY, JSON.stringify({ open: true, active: 0, cols: 0, cards: [entry("a1", SONG)] }));
    saveSingle(OWN);
    openLink(LINKED);
    fireEvent.click(within(band()).getByRole("button", { name: "まとめて遊ぶに足す" }));
    expect(savedSet().cards.map((c) => c.code)).toEqual([SONG, LINKED]);
    cleanup();
    localStorage.setItem(
      MULTI_STORAGE_KEY,
      JSON.stringify({ open: false, active: 0, cols: 0, cards: ["a1", "b2", "c3", "d4", "e5"].map((id) => entry(id, SONG)) })
    );
    openLink(LINKED);
    expect((within(band()).getByRole("button", { name: "まとめて遊ぶに足す" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(band()).getByText(/5 枚まで/)).toBeTruthy();
  });

  it("見るだけの間は「ほかのカードと並べて遊ぶ」を出さない（見ているカードが 1 枚目に入らないように）", () => {
    saveSingle(OWN);
    openLink(LINKED);
    expect(screen.queryByRole("button", { name: /ほかのカードと並べて遊ぶ/ })).toBeNull();
    fireEvent.click(within(band()).getByRole("button", { name: "見るのをやめる" }));
    expect(screen.getByRole("button", { name: /ほかのカードと並べて遊ぶ/ })).toBeTruthy();
  });

  it("見るだけの間に「新しいカードを作る」は、自分のカードについて確かめ、作ったら見るのをやめる", () => {
    saveSingle(OWN);
    openLink(LINKED);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "リンクのカード" })).toBeNull();
    expect(single().odai).not.toBe(OWN);
    expect(single().odai).not.toBe(LINKED);
  });

  it("種類を切り替えると隠れ、戻すとまた見るだけで出る", () => {
    saveSingle(OWN);
    openLink(LINKED);
    fireEvent.click(screen.getByRole("radio", { name: "曲名ビンゴ" }));
    expect(screen.queryByRole("region", { name: "リンクのカード" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "お題ビンゴ" }));
    expect(band()).toBeTruthy();
    expect(progressText()).toContain("2/24");
  });
});

describe("埋めたマスが無い・初めての人が開いたとき（今までどおりそのまま開く）", () => {
  it("リンクのカードを自分のカードにして保存し、1 行で知らせて［まとめて遊ぶに足す］を出す", () => {
    openLink(LINKED);
    expect(single().odai).toBe(LINKED);
    expect(band().textContent).toContain("リンクのカードを開きました（埋めたマス 2/24）");
    expect(band().textContent).not.toContain("見るだけ");
    expect(within(band()).queryByRole("button", { name: /このカードで遊ぶ/ })).toBeNull();
    fireEvent.click(within(band()).getByRole("button", { name: "まとめて遊ぶに足す" }));
    // 自分のカード＝リンクのカードなので、同じカードを 2 枚入れない
    expect(savedSet().cards.map((c) => c.code)).toEqual([LINKED]);
  });

  it("［閉じる］で知らせを消す", () => {
    openLink(LINKED);
    fireEvent.click(within(band()).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("region", { name: "リンクのカード" })).toBeNull();
    expect(single().odai).toBe(LINKED);
  });

  it("リンクの無いときは何も出さない", () => {
    saveSingle(OWN);
    render(<BingoGenerator />);
    expect(screen.queryByRole("region", { name: "リンクのカード" })).toBeNull();
  });
});
