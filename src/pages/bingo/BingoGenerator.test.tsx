/**
 * @vitest-environment jsdom
 *
 * 画面のつなぎ: 難易度を選んで作ると、その段のカードができて枠に出る。開き直すと段は今のカードから。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { BingoMusic } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import {
  ODAI_LEVELS,
  ODAI_THEMES,
  buildOdaiCandidates,
  decodeOdaiSeed,
  odaiLevelOf,
  odaiSongsToHalf,
  odaiThemeFloor,
} from "./odaiLogic";
import { playTimeText } from "./playTime";
import { BINGO_STORAGE_KEY } from "./bingoStorage";
import { ODAI_PINS_STORAGE_KEY } from "./odaiPinStorage";
import BingoGenerator from "./BingoGenerator";

// 楽曲データの読み込み（fetch）だけ差し替える。読むのは描画のときなので、宣言より後でよい
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

/** カードの枠の見出しの行（「HARD ・ 約1時間20分」など）。 */
const cardHeader = () => screen.getByRole("heading", { name: "カード" }).parentElement!.textContent ?? "";

describe("難易度", () => {
  it("初めて開くと NORMAL のカードで、枠に段と時間が出る", () => {
    render(<BingoGenerator />);
    expect(screen.getByRole("radio", { name: "NORMAL" }).getAttribute("aria-checked")).toBe("true");
    expect(cardHeader()).toContain("NORMAL ・ 約1時間20分");
  });

  it("MASTER を選んで作ると、MASTER のカードになる", () => {
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("radio", { name: "MASTER" }));
    expect(screen.getByText("約5時間")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
    expect(cardHeader()).toContain("MASTER ・ 約5時間");
  });

  it("開き直すと、選択は今のカードの段に戻る", () => {
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("radio", { name: "EASY" }));
    fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
    cleanup();
    render(<BingoGenerator />);
    expect(screen.getByRole("radio", { name: "EASY" }).getAttribute("aria-checked")).toBe("true");
    expect(cardHeader()).toContain("EASY ・ 約30分");
  });

  it("選択欄に「難易度」という名前が付いている", () => {
    render(<BingoGenerator />);
    expect(screen.getByRole("radiogroup", { name: "難易度" })).toBeTruthy();
  });
});

/** この端末に保存されたお題のカード（作ったカードはすぐ保存される）。 */
const savedOdaiCard = () => {
  const saved = JSON.parse(localStorage.getItem(BINGO_STORAGE_KEY) ?? "{}") as { odai?: string };
  return decodeOdaiSeed(saved.odai ?? "", mockMusics);
};

describe("テーマ（細かい設定）", () => {
  it("お題ビンゴのときだけ出て、既定はおまかせ", () => {
    render(<BingoGenerator />);
    fireEvent.click(screen.getByText("細かい設定"));
    const group = screen.getByRole("radiogroup", { name: "テーマ" });
    expect(within(group).getByRole("radio", { name: "おまかせ" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "曲名ビンゴ" }));
    expect(screen.queryByRole("radiogroup", { name: "テーマ" })).toBeNull();
  });

  it.each(["singer", "title", "chart"] as const)("テーマ %s を選んで作ると、そのテーマのお題が下限以上入ったカードになる", (theme) => {
    render(<BingoGenerator />);
    fireEvent.click(screen.getByText("細かい設定"));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "テーマ" })).getByRole("radio", { name: ODAI_THEMES[theme].label }));
    fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
    const card = savedOdaiCard();
    const themed = card.filter((c) => c !== "FREE" && ODAI_THEMES[theme].kinds.includes(c.odai.kind)).length;
    expect(themed).toBeGreaterThanOrEqual(odaiThemeFloor(buildOdaiCandidates(mockMusics), "normal", theme));
    expect(themed).toBeGreaterThan(0);
    // テーマはコードに入らないので、カードの枠の段と時間はいつもどおり
    expect(cardHeader()).toContain("NORMAL ・ 約1時間20分");
  });
});

describe("入れたいお題（細かい設定）", () => {
  const openPicker = () => {
    fireEvent.click(screen.getByText("細かい設定"));
    fireEvent.click(screen.getByRole("button", { name: "お題を選ぶ" }));
    return screen.getByRole("dialog");
  };
  /** 選ぶ小窓で、検索してから文言の行を押す。 */
  const pick = (query: string, text: string) => {
    const d = screen.getByRole("dialog");
    fireEvent.change(within(d).getByRole("searchbox"), { target: { value: query } });
    const row = within(d)
      .getAllByRole("button")
      .find((b) => b.querySelector(".font-bold")?.textContent === text);
    if (!row) throw new Error(`行が無い: ${text}`);
    fireEvent.click(row);
    return row;
  };
  const savedPins = () => JSON.parse(localStorage.getItem(ODAI_PINS_STORAGE_KEY) ?? "[]") as string[];
  const pinChips = () => screen.queryAllByRole("button", { name: /を外す$/ });

  it("検索で選んだお題がチップに並び、端末に残り、開き直しても残る", () => {
    render(<BingoGenerator />);
    openPicker();
    // キャラの名字（カタカナの読みでなく漢字）でも引ける
    pick("星乃", "一歌");
    pick("orangestar", "Orangestar");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "選び終える" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pinChips().map((b) => b.getAttribute("aria-label"))).toEqual(["ボーカル 一歌を外す", "作者 Orangestarを外す"]);
    expect(savedPins()).toEqual(["s1", "c10"]);
    cleanup();
    render(<BingoGenerator />);
    fireEvent.click(screen.getByText(/細かい設定/));
    expect(pinChips()).toHaveLength(2);
    expect(screen.getByText(/細かい設定/).textContent).toContain("入れたいお題 2つ");
  });

  it("5 つ選ぶと、ほかの行は押せなくなり、そのことが小窓に出る。選んだ行を押せば外せる", () => {
    render(<BingoGenerator />);
    openPicker();
    for (const [q, t] of [["一歌", "一歌"], ["deco", "DECO*27"], ["ミク", "ミク"], ["あ行", "あ行"], ["APPEND", "APPEND"]]) pick(q, t);
    const d = screen.getByRole("dialog");
    expect(within(d).getByRole("status").textContent).toContain("5つまで");
    expect(within(d).getByText("5/5")).toBeTruthy();
    fireEvent.change(within(d).getByRole("searchbox"), { target: { value: "" } });
    const blocked = within(d)
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("disabled"));
    expect(blocked.length).toBeGreaterThan(100);
    pick("か行", "か行");
    expect(savedPins()).toHaveLength(5);
    expect(savedPins()).not.toContain("rk");
    pick("ミク", "ミク");
    expect(savedPins()).not.toContain("s21");
    expect(within(d).queryByRole("status")).toBeNull();
  });

  it("入れたお題（範囲外のミク・1 マスに収まらない名前の作者を含む）が、作ったカードに必ず入る", () => {
    render(<BingoGenerator />);
    openPicker();
    pick("ミク", "ミク");
    pick("1640", "1640mP（164×40mP）");
    pick("25時", "25時");
    fireEvent.keyDown(document, { key: "Escape" });
    for (let t = 0; t < 3; t++) {
      fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
      const keys = savedOdaiCard().flatMap((c) => (c === "FREE" ? [] : [c.odai.key]));
      expect(keys).toEqual(expect.arrayContaining(["s21", "c5", "u5"]));
    }
    // チップの × で外せる
    fireEvent.click(screen.getByRole("button", { name: "ボーカル ミクを外す" }));
    expect(savedPins()).toEqual(["c5", "u5"]);
  });

  it("壊れた保存・楽曲データに無い鍵は黙って落とす", () => {
    localStorage.setItem(ODAI_PINS_STORAGE_KEY, JSON.stringify(["c999999", "s1", 3, "zz"]));
    render(<BingoGenerator />);
    fireEvent.click(screen.getByText(/細かい設定/));
    expect(pinChips().map((b) => b.getAttribute("aria-label"))).toEqual(["ボーカル 一歌を外す"]);
    expect(savedPins()).toEqual(["s1"]);
    cleanup();
    localStorage.setItem(ODAI_PINS_STORAGE_KEY, "{broken");
    render(<BingoGenerator />);
    expect(screen.getByText(/細かい設定/).textContent).not.toContain("入れたいお題");
    // 壊れた保存は、空の一覧で書き直して消す
    expect(localStorage.getItem(ODAI_PINS_STORAGE_KEY)).toBeNull();
  });
});

describe("このお題を替える（作ったカード）", () => {
  it("替えたマスのお題でコードと保存が変わり、枠の段と時間は替えたカードから出し直す", () => {
    render(<BingoGenerator />);
    fireEvent.click(screen.getByRole("radio", { name: "EASY" }));
    fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
    const before = localStorage.getItem(BINGO_STORAGE_KEY);
    const cells = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    fireEvent.click(cells[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "このお題を替える" }));
    const d = screen.getByRole("dialog");
    // 当てはまる曲が 1 曲だけの作者（EASY の目安から大きく外れる）
    fireEvent.change(within(d).getByRole("searchbox"), { target: { value: "syudou × バルーン" } });
    fireEvent.click(within(d).getAllByRole("button").find((b) => b.querySelector(".font-bold")?.textContent === "syudou × バルーン")!);
    const card = savedOdaiCard();
    expect(card[0] !== "FREE" && card[0].odai.text).toBe("syudou × バルーン");
    expect(localStorage.getItem(BINGO_STORAGE_KEY)).not.toBe(before);
    const level = odaiLevelOf(card);
    expect(cardHeader()).toContain(`${ODAI_LEVELS[level].label} ・ ${playTimeText(odaiSongsToHalf(card))}`);
  });
});
