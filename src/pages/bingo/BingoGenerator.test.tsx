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
import { SONG_PINS_STORAGE_KEY } from "./songPinStorage";
import { decodeSeed, filterForGeneration } from "./bingoLogic";
import { ALL_CATEGORY_VALUES, ALL_TYPE_VALUES, ALL_UNIT_VALUES } from "./bingoConstants";
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
    expect(within(d).getByRole("status").textContent).toBe("");
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
    // チップの × で外せる。外したあとのフォーカスは「お題を選ぶ」へ（押した × は消える）
    fireEvent.click(screen.getByRole("button", { name: "ボーカル ミクを外す" }));
    expect(savedPins()).toEqual(["c5", "u5"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "お題を選ぶ" }));
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

// ---- 曲名ビンゴ: 入れたい曲（24 曲まで）・歌う人の絞り込み・条件に合う曲数 ----

const toSongKind = () => fireEvent.click(screen.getByRole("radio", { name: "曲名ビンゴ" }));
const openSettings = () => fireEvent.click(screen.getByText(/細かい設定/));
const savedSongPins = () => JSON.parse(localStorage.getItem(SONG_PINS_STORAGE_KEY) ?? "[]") as string[];
/** この端末に保存された曲名ビンゴのカードの曲の id（FREE を除く）。 */
const savedSongIds = () => {
  const saved = JSON.parse(localStorage.getItem(BINGO_STORAGE_KEY) ?? "{}") as { song?: string };
  return decodeSeed(saved.song ?? "", mockMusics).flatMap((c) => (c === "FREE" ? [] : [c.id]));
};
/** 曲名で検索して一意に引ける曲（同じ文字で始まる別の曲があると押し分けられない）。 */
const uniqueSongs = mockMusics.filter((m) => mockMusics.filter((o) => o.title.startsWith(m.title)).length === 1);
const songChips = () => screen.queryAllByRole("button", { name: /を外す$/ });
/** 選ぶ小窓で曲名を検索して、その行を押す。 */
const pickSong = (title: string) => {
  const d = screen.getByRole("dialog");
  fireEvent.change(within(d).getByRole("textbox"), { target: { value: title } });
  const row = within(d).getAllByRole("button").find((b) => b.textContent?.startsWith(title));
  if (!row) throw new Error(`行が無い: ${title}`);
  fireEvent.click(row);
};
const ALL_FILTERS = [new Set(ALL_UNIT_VALUES), new Set(ALL_CATEGORY_VALUES), new Set(ALL_TYPE_VALUES)] as const;

describe("曲名ビンゴの入れたい曲（細かい設定）", () => {
  it("曲名ビンゴのときだけ出る", () => {
    render(<BingoGenerator />);
    openSettings();
    expect(screen.queryByRole("button", { name: "曲を選ぶ" })).toBeNull();
    toSongKind();
    expect(screen.getByRole("button", { name: "曲を選ぶ" })).toBeTruthy();
    expect(screen.getByText(/入れたい曲（/).textContent).toContain("24曲まで");
  });

  it("選んだ曲がチップに並び、端末に残り、開き直しても残る", () => {
    const [a, b] = uniqueSongs;
    render(<BingoGenerator />);
    toSongKind();
    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "曲を選ぶ" }));
    pickSong(a.title);
    pickSong(b.title);
    expect(within(screen.getByRole("dialog")).getByText(/選んだ曲/).textContent).toContain("2/24");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "選び終える" }));
    expect(songChips().map((c) => c.getAttribute("aria-label"))).toEqual([`${a.title}を外す`, `${b.title}を外す`]);
    expect(savedSongPins()).toEqual([a.id, b.id]);
    cleanup();
    render(<BingoGenerator />);
    toSongKind();
    expect(screen.getByText(/細かい設定/).textContent).toContain("入れたい曲 2曲");
  });

  it("入れた曲は、絞り込みの条件の外でも、作ったカードに必ず入る（条件の外と出す）", () => {
    const vs = uniqueSongs.find((m) => m.Unit === "0_VS")!;
    const ln = uniqueSongs.find((m) => m.Unit === "1_L/n")!;
    render(<BingoGenerator />);
    toSongKind();
    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "曲を選ぶ" }));
    pickSong(vs.title);
    pickSong(ln.title);
    fireEvent.keyDown(document, { key: "Escape" });
    // VS を条件から外す
    fireEvent.click(screen.getByRole("button", { name: "VS" }));
    const chip = songChips().find((c) => c.getAttribute("aria-label") === `${vs.title}を外す`)!.parentElement!;
    expect(chip.textContent).toContain("条件の外");
    for (let t = 0; t < 3; t++) {
      fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
      expect(savedSongIds()).toEqual(expect.arrayContaining([vs.id, ln.id]));
      // 入れた曲のほかに VS の曲は入らない
      const others = savedSongIds().filter((id) => id !== vs.id);
      expect(others.every((id) => mockMusics.find((m) => m.id === id)!.Unit !== "0_VS")).toBe(true);
    }
  });

  it("× で 1 曲、「すべて外す」で全部外せる（確かめてから）。外したあとのフォーカスは「曲を選ぶ」", () => {
    localStorage.setItem(SONG_PINS_STORAGE_KEY, JSON.stringify(uniqueSongs.slice(0, 3).map((m) => m.id)));
    render(<BingoGenerator />);
    toSongKind();
    openSettings();
    fireEvent.click(songChips()[0]);
    expect(savedSongPins()).toEqual(uniqueSongs.slice(1, 3).map((m) => m.id));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "曲を選ぶ" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "すべて外す" }));
    expect(savedSongPins()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "すべて外す" }));
    expect(localStorage.getItem(SONG_PINS_STORAGE_KEY)).toBeNull();
    expect(songChips()).toHaveLength(0);
    confirm.mockRestore();
  });

  it("壊れた保存・楽曲データに無い id は黙って落とす", () => {
    const known = uniqueSongs[0];
    localStorage.setItem(SONG_PINS_STORAGE_KEY, JSON.stringify(["9999", known.id, 3, "abc"]));
    render(<BingoGenerator />);
    toSongKind();
    openSettings();
    expect(songChips().map((c) => c.getAttribute("aria-label"))).toEqual([`${known.title}を外す`]);
    expect(savedSongPins()).toEqual([known.id]);
    cleanup();
    localStorage.setItem(SONG_PINS_STORAGE_KEY, "{broken");
    render(<BingoGenerator />);
    toSongKind();
    expect(screen.getByText(/細かい設定/).textContent).not.toContain("入れたい曲");
    expect(localStorage.getItem(SONG_PINS_STORAGE_KEY)).toBeNull();
  });
});

describe("曲名ビンゴの絞り込みの歌う人と、条件に合う曲数", () => {
  // 「条件に合う曲が足りません」のボタンと見分けるため、行そのものの文字（数の部分を除く）で引く
  const countLine = () => screen.getByText(/^条件に合う曲$/);

  it("条件に合う曲数を出し、絞り込みを変えると数が変わる", () => {
    render(<BingoGenerator />);
    toSongKind();
    openSettings();
    expect(countLine().textContent).toContain(`${filterForGeneration(mockMusics, ...ALL_FILTERS).length}曲`);
    fireEvent.click(screen.getByRole("button", { name: "VS" }));
    const noVs = new Set(ALL_UNIT_VALUES.filter((u) => u !== "0_VS"));
    expect(countLine().textContent).toContain(
      `${filterForGeneration(mockMusics, noVs, ALL_FILTERS[1], ALL_FILTERS[2]).length}曲`
    );
    // 閉じていても見出しの行に出る
    expect(screen.getByText(/細かい設定/).textContent).toContain("条件に合う");
  });

  it("歌う人を選ぶと、その人が歌う曲の数になり、その曲だけでカードを作る", () => {
    render(<BingoGenerator />);
    toSongKind();
    openSettings();
    fireEvent.change(screen.getByRole("combobox", { name: "歌う人" }), { target: { value: "20" } });
    const expected = filterForGeneration(mockMusics, ...ALL_FILTERS, 20);
    expect(countLine().textContent).toContain(`${expected.length}曲`);
    fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
    const ids = new Set(expected.map((m) => m.id));
    expect(savedSongIds().every((id) => ids.has(id))).toBe(true);
  });

  it("足りないときは足りない数を出し、ボタンを押せない。入れたい曲で足りれば押せる", () => {
    render(<BingoGenerator />);
    toSongKind();
    openSettings();
    // その他 × 書き下ろし だけに絞る
    for (const name of ["VS", "L/n", "MMJ", "VBS", "WxS", "25時", "既存曲"]) fireEvent.click(screen.getByRole("button", { name }));
    const units = new Set(["9_oth"]);
    const n = filterForGeneration(mockMusics, units, ALL_FILTERS[1], new Set([true])).length;
    expect(n).toBeLessThan(24);
    expect(countLine().textContent).toContain(`${n}曲`);
    expect(countLine().textContent).toContain(`あと ${24 - n} 曲足りません`);
    const button = screen.getByRole("button", { name: "条件に合う曲が足りません" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    // 条件の外の曲を、足りない数だけ入れる
    fireEvent.click(screen.getByRole("button", { name: "曲を選ぶ" }));
    for (const m of uniqueSongs.filter((x) => x.Unit === "0_VS").slice(0, 24 - n)) pickSong(m.title);
    fireEvent.keyDown(document, { key: "Escape" });
    expect((screen.getByRole("button", { name: "新しいカードを作る" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
    expect(savedSongIds()).toHaveLength(24);
  });
});
