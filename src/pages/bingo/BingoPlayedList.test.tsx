/**
 * @vitest-environment jsdom
 *
 * 遊んだ曲の一覧（1 枚で遊ぶ）: 記録の始まり（埋めると決めたときだけ）・プレイ開始の印・一覧を見る・1 曲消す（戻すマスを選ぶ）・
 * すべて消す・この一覧でカードを埋める・書き出し・ほかのタブ・共有の段の売り込み。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { BingoMusic } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import { type OdaiCell, buildOdaiCandidates, buildOdaiCard, createRng, encodeOdaiSeed } from "./odaiLogic";
import { decodeCardCode } from "./bingoShare";
import { matchingCells } from "./bingoPlayed";
import { BINGO_STORAGE_KEY, type SavedBingo } from "./bingoStorage";
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

// この端末の時刻で 2026-11-12 15:03（木）
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
  window.history.replaceState(null, "", "/");
});

const ODAI = buildOdaiCard(buildOdaiCandidates(mockMusics), createRng(3));
const CODE = encodeOdaiSeed(ODAI);
const unique = (m: BingoMusic) => mockMusics.filter((o) => o.title.startsWith(m.title)).length === 1;
const hits = (m: BingoMusic) => matchingCells(ODAI, m);
const TWO = mockMusics.find((m) => hits(m).length >= 2 && unique(m))!;
const ONE = mockMusics.find((m) => hits(m).length === 1 && unique(m) && !hits(TWO).includes(hits(m)[0]))!;
const NONE = mockMusics.find((m) => hits(m).length === 0 && unique(m))!;

const saveSingle = (extra: Partial<SavedBingo> = {}) =>
  localStorage.setItem(BINGO_STORAGE_KEY, JSON.stringify({ kind: "odai", odai: CODE, odaiAddedAt: T - 60 * MIN, ...extra }));
const single = () => JSON.parse(localStorage.getItem(BINGO_STORAGE_KEY) ?? "{}") as SavedBingo;
const played = () => JSON.parse(localStorage.getItem(PLAYED_STORAGE_KEY) ?? "[]") as PlayedEntry[];
const savePlayed = (list: PlayedEntry[]) => localStorage.setItem(PLAYED_STORAGE_KEY, JSON.stringify(list));
const filledOf = (code: string) => decodeCardCode(code, mockMusics).card.flatMap((c, i) => (c !== "FREE" && c.cleared ? [i] : []));
const dialog = () => screen.getByRole("dialog");
const listButton = () => screen.getByRole("button", { name: /^一覧/ });

function pickPlayed(title: string) {
  fireEvent.click(screen.getByRole("button", { name: "遊んだ曲を入れる" }));
  fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: title } });
  fireEvent.click(within(dialog()).getAllByRole("button").find((b) => b.textContent?.startsWith(title))!);
}
function openList() {
  fireEvent.click(listButton());
  return dialog();
}
/** n マス埋めたカード（a 番から）。 */
const withFilled = (indices: number[]): OdaiCell[] => ODAI.map((c, i) => (c !== "FREE" && indices.includes(i) ? { ...c, cleared: true } : c));

describe("記録の始まり（埋めると決めたときだけ一覧に入れる）", () => {
  it("「まとめて埋める」で、曲・時刻・その曲で埋めたマスが一覧に入る。一覧のボタンに曲数が出る", () => {
    saveSingle();
    render(<BingoGenerator />);
    expect(listButton().textContent).toContain("0曲");
    pickPlayed(TWO.title);
    expect(within(dialog()).getByText("埋めると、遊んだ曲の一覧にも入ります")).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "まとめて埋める" }));
    expect(played()).toEqual([{ id: TWO.id, at: T, cells: [{ card: `odai@${T - 60 * MIN}`, filled: hits(TWO) }] }]);
    expect(listButton().textContent).toContain("1曲");
  });

  it("× や背景のタップで閉じたら入れない", () => {
    saveSingle();
    render(<BingoGenerator />);
    pickPlayed(TWO.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "閉じる" }));
    pickPlayed(TWO.title);
    fireEvent.mouseDown(dialog().parentElement!, { detail: 1 });
    expect(localStorage.getItem(PLAYED_STORAGE_KEY)).toBeNull();
    expect(filledOf(single().odai!)).toEqual([]);
  });

  it("当てはまるマスが無い曲は「遊んだ曲に入れる」で入れる（マスは埋めない・プレイ開始も付かない）", () => {
    saveSingle();
    render(<BingoGenerator />);
    pickPlayed(NONE.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "遊んだ曲に入れる" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(played()).toEqual([{ id: NONE.id, at: T }]);
    expect(single().odaiStartedAt).toBeUndefined();
  });

  it("見るだけで開いたリンクのカードを埋めても、一覧には入れない（「遊んだ曲に入れる」も出さない）", () => {
    saveSingle({ odai: encodeOdaiSeed(withFilled([hits(ONE)[0]])) });
    window.history.replaceState(null, "", `/bingo?card=${encodeURIComponent(CODE)}`);
    render(<BingoGenerator />);
    pickPlayed(TWO.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "まとめて埋める" }));
    pickPlayed(NONE.title);
    expect(within(dialog()).queryByRole("button", { name: "遊んだ曲に入れる" })).toBeNull();
    expect(localStorage.getItem(PLAYED_STORAGE_KEY)).toBeNull();
  });
});

describe("プレイ開始の印（最初に埋めたとき）", () => {
  it("始める前は案内、最初に埋めると「プレイ開始！ 11/12 15:03」が出て保存に残る。開き直すと「プレイ開始 11/12 15:03」", () => {
    saveSingle();
    render(<BingoGenerator />);
    expect(screen.getByText("マスを埋めるとプレイ開始")).toBeTruthy();
    pickPlayed(ONE.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    expect(screen.getByRole("status", { name: "プレイ開始" }).textContent).toBe("プレイ開始！ 11/12 15:03");
    expect(single().odaiStartedAt).toBe(T);
    cleanup();
    now = T + 90 * MIN;
    render(<BingoGenerator />);
    expect(screen.getByRole("status", { name: "プレイ開始" }).textContent).toBe("プレイ開始 11/12 15:03");
  });

  it("ほかのマスを埋めても変わらず、新しいカードで消える（始める前に戻る）", () => {
    saveSingle({ odai: encodeOdaiSeed(withFilled([hits(ONE)[0]])), odaiStartedAt: T - 30 * MIN });
    render(<BingoGenerator />);
    expect(screen.getByRole("status", { name: "プレイ開始" }).textContent).toBe("プレイ開始 11/12 14:33");
    const open = screen.getAllByRole("button").find((b) => b.getAttribute("aria-pressed") === "false")!;
    fireEvent.click(open);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    expect(filledOf(single().odai!)).toHaveLength(2);
    expect(single().odaiStartedAt).toBe(T - 30 * MIN);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "新しいカードを作る" }));
    expect(screen.getByText("マスを埋めるとプレイ開始")).toBeTruthy();
    expect(single().odaiStartedAt).toBeUndefined();
    expect(single().odaiAddedAt).toBe(T);
  });
});

// 検分 P 中-1: プレイ開始は「最初に埋めたとき」だけ。時刻の分からない途中のカードで次に替えた時刻を、開始として出さない
describe("プレイ開始の時刻の分からない途中のカード", () => {
  it("前の版で埋めた途中のカード（時刻なし）で 1 マス埋めても、プレイ開始は付かず、印も案内も出さない", () => {
    localStorage.setItem(BINGO_STORAGE_KEY, JSON.stringify({ kind: "odai", odai: encodeOdaiSeed(withFilled(hits(TWO))) }));
    render(<BingoGenerator />);
    expect(screen.getByRole("status", { name: "プレイ開始" }).textContent).toBe("");
    pickPlayed(ONE.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    expect(filledOf(single().odai!)).toHaveLength(hits(TWO).length + 1);
    expect(single().odaiStartedAt).toBeUndefined();
    expect(screen.getByRole("status", { name: "プレイ開始" }).textContent).toBe("");
  });

  it("埋めた状態のリンクのカードを開いて（自分のカードが無い）埋めても、プレイ開始は付かない", () => {
    window.history.replaceState(null, "", `/bingo?card=${encodeURIComponent(encodeOdaiSeed(withFilled(hits(TWO))))}`);
    render(<BingoGenerator />);
    pickPlayed(ONE.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    expect(single().odaiStartedAt).toBeUndefined();
    expect(screen.getByRole("status", { name: "プレイ開始" }).textContent).toBe("");
  });

  it("全部戻して 0 マスにしてから埋めると、そのとき付く（0 マスから 1 マス以上になったとき）", () => {
    localStorage.setItem(BINGO_STORAGE_KEY, JSON.stringify({ kind: "odai", odai: encodeOdaiSeed(withFilled([hits(ONE)[0]])) }));
    render(<BingoGenerator />);
    const filledCell = screen.getAllByRole("button").find((b) => b.getAttribute("aria-pressed") === "true")!;
    fireEvent.click(filledCell);
    fireEvent.click(within(dialog()).getByRole("button", { name: "戻す" }));
    expect(single().odaiStartedAt).toBeUndefined();
    pickPlayed(ONE.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    expect(single().odaiStartedAt).toBe(T);
  });
});

describe("一覧を見る", () => {
  it("新しい順に、日付の見出し・番号・曲名・時刻。プレイ開始の行も入る。見出しの下に曲数と始まり", () => {
    saveSingle({ odai: encodeOdaiSeed(withFilled([hits(ONE)[0]])), odaiStartedAt: T - 24 * 60 * MIN + MIN });
    savePlayed([{ id: ONE.id, at: T - 24 * 60 * MIN + MIN }, { id: NONE.id, at: T - 10 * MIN }, { id: TWO.id, at: T - MIN }]);
    render(<BingoGenerator />);
    expect(listButton().textContent).toContain("3曲");
    const sheet = openList();
    expect(within(sheet).getByRole("heading", { name: "遊んだ曲の一覧" })).toBeTruthy();
    expect(sheet.textContent).toContain("3曲 ・ 11/11 15:04 から");
    const days = within(sheet).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(days).toEqual(["11/12（木）", "11/11（水）"]);
    const rows = within(sheet).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(rows[0]).toContain(`3${TWO.title}`);
    expect(rows[0]).toContain("15:02");
    expect(rows[1]).toContain(NONE.title);
    // プレイ開始の行は、同じ時刻の曲より下（古い側）に置く
    expect(rows.at(-1)).toContain("プレイ開始（お題ビンゴ）");
    expect(rows.at(-2)).toContain(ONE.title);
  });

  it("空なら、どうすると入るかを出す", () => {
    saveSingle();
    render(<BingoGenerator />);
    const sheet = openList();
    expect(sheet.textContent).toContain("まだありません");
    expect(within(sheet).getByRole("button", { name: "テキストをコピー" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("1 曲消す（その曲で埋めたマスを見せて、戻すかを選ぶ）", () => {
  const setup = () => {
    saveSingle();
    render(<BingoGenerator />);
    pickPlayed(TWO.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "まとめて埋める" }));
    now = T + MIN;
    pickPlayed(NONE.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "遊んだ曲に入れる" }));
    return openList();
  };

  it("「マスも戻して消す」で、その曲で埋めたマスが戻り、一覧から消える", () => {
    const sheet = setup();
    fireEvent.click(within(sheet).getByRole("button", { name: `${TWO.title}（15:03）を一覧から消す` }));
    expect(sheet.textContent).toContain(`「${TWO.title}」（11/12 15:03）を一覧から消します`);
    fireEvent.click(within(sheet).getByRole("button", { name: `マスも戻して消す（${hits(TWO).length}マス）` }));
    expect(filledOf(single().odai!)).toEqual([]);
    expect(played().map((p) => p.id)).toEqual([NONE.id]);
  });

  it("「一覧からだけ消す」ならマスはそのまま。「やめる」なら何も変えない", () => {
    const sheet = setup();
    fireEvent.click(within(sheet).getByRole("button", { name: `${TWO.title}（15:03）を一覧から消す` }));
    fireEvent.click(within(sheet).getByRole("button", { name: "やめる" }));
    expect(played()).toHaveLength(2);
    fireEvent.click(within(sheet).getByRole("button", { name: `${TWO.title}（15:03）を一覧から消す` }));
    fireEvent.click(within(sheet).getByRole("button", { name: "一覧からだけ消す" }));
    expect(filledOf(single().odai!)).toEqual(hits(TWO));
    expect(played().map((p) => p.id)).toEqual([NONE.id]);
  });

  it("埋めたマスの無い曲は、聞かずにそのまま消す", () => {
    const sheet = setup();
    fireEvent.click(within(sheet).getByRole("button", { name: `${NONE.title}（15:04）を一覧から消す` }));
    expect(played().map((p) => p.id)).toEqual([TWO.id]);
  });

  it("「すべて消す」は確かめてから一覧を空にする。カードのマスはそのまま", () => {
    const sheet = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(within(sheet).getByRole("button", { name: "すべて消す" }));
    expect(played()).toHaveLength(2);
    confirm.mockReturnValue(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "すべて消す" }));
    expect(localStorage.getItem(PLAYED_STORAGE_KEY)).toBeNull();
    expect(filledOf(single().odai!)).toEqual(hits(TWO));
  });
});

describe("この一覧でカードを埋める（1 枚で遊ぶ）", () => {
  it("カードを足した時刻より後の曲だけで埋める。押す前に、使う曲の数と埋まるマスの数を見せる", () => {
    saveSingle({ odaiAddedAt: T - 10 * MIN });
    savePlayed([{ id: ONE.id, at: T - 20 * MIN }, { id: TWO.id, at: T - 5 * MIN }, { id: NONE.id, at: T - 4 * MIN }]);
    render(<BingoGenerator />);
    const sheet = openList();
    fireEvent.click(within(sheet).getByRole("button", { name: "この一覧でカードを埋める" }));
    const row = within(sheet).getByRole("region", { name: "お題ビンゴ" });
    expect(row.textContent).toContain(`11/12 14:53 より後の 2 曲で ${hits(TWO).length} マス埋まります`);
    fireEvent.click(within(row).getByRole("button", { name: `埋める（${hits(TWO).length}マス）` }));
    expect(filledOf(single().odai!)).toEqual(hits(TWO));
    // 埋めたマスはその曲の記録に足す（あとで 1 曲消すときに戻せる）
    expect(played()[1].cells).toEqual([{ card: `odai@${T - 10 * MIN}`, filled: hits(TWO) }]);
    expect(single().odaiStartedAt).toBe(T);
    expect(sheet.textContent).toContain(`${hits(TWO).length} マスを埋めました`);
  });

  it("見るだけで開いているカードには使えない", () => {
    saveSingle({ odai: encodeOdaiSeed(withFilled([hits(ONE)[0]])) });
    savePlayed([{ id: TWO.id, at: T - MIN }]);
    window.history.replaceState(null, "", `/bingo?card=${encodeURIComponent(CODE)}`);
    render(<BingoGenerator />);
    const sheet = openList();
    fireEvent.click(within(sheet).getByRole("button", { name: "この一覧でカードを埋める" }));
    expect(sheet.textContent).toContain("見るだけで開いているカードには使えません");
  });
});

describe("書き出し", () => {
  it("「テキストをコピー」で一覧の文をクリップボードへ。だめなら文を出して手で選べるようにする", async () => {
    saveSingle();
    savePlayed([{ id: TWO.id, at: T }]);
    const writeText = vi.fn<(s: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<BingoGenerator />);
    const sheet = openList();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "テキストをコピー" }));
    });
    expect(writeText).toHaveBeenCalledWith(`遊んだ曲（1曲・11/12 15:03）\n1. 11/12 15:03 ${TWO.title}`);
    expect(sheet.textContent).toContain("コピーしました");
    writeText.mockRejectedValue(new Error("denied"));
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "テキストをコピー" }));
    });
    expect((within(sheet).getByRole("textbox", { name: "遊んだ曲の一覧の文" }) as HTMLTextAreaElement).value).toContain(TWO.title);
  });

  it("「CSVで保存」で bingo_played_YYYYMMDD.csv を保存する（CSV の形）", () => {
    saveSingle();
    savePlayed([{ id: TWO.id, at: T }]);
    const created: Blob[] = [];
    const names: string[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      created.push(b as Blob);
      return "blob:x";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    render(<BingoGenerator />);
    fireEvent.click(within(openList()).getByRole("button", { name: "CSVで保存" }));
    // 日付の形は playedExport.test.ts で見る（ここでは new Date() の今日）
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^bingo_played_\d{8}\.csv$/);
    expect(created[0].type).toContain("text/csv");
  });
});

describe("ほかのタブ（G-08）", () => {
  it("ほかのタブが足した曲は、読み直して出し、こちらで足しても消えない", () => {
    saveSingle();
    render(<BingoGenerator />);
    const other: PlayedEntry[] = [{ id: NONE.id, at: T - MIN }];
    savePlayed(other);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: PLAYED_STORAGE_KEY, newValue: JSON.stringify(other), storageArea: localStorage }));
    });
    expect(listButton().textContent).toContain("1曲");
    // こちらの画面が古い一覧を持っていても、書く直前に読み直す
    savePlayed([...other, { id: ONE.id, at: T - 30_000 }]);
    pickPlayed(TWO.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "まとめて埋める" }));
    expect(played().map((p) => p.id)).toEqual([NONE.id, ONE.id, TWO.id]);
  });

  it("一覧を開いている間にほかのタブで変わって描き直されても、小窓の中のフォーカスは動かない", () => {
    saveSingle();
    savePlayed([{ id: TWO.id, at: T - MIN }]);
    render(<BingoGenerator />);
    const sheet = openList();
    const copy = within(sheet).getByRole("button", { name: "CSVで保存" });
    copy.focus();
    const next: PlayedEntry[] = [{ id: TWO.id, at: T - MIN }, { id: NONE.id, at: T }];
    savePlayed(next);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: PLAYED_STORAGE_KEY, newValue: JSON.stringify(next), storageArea: localStorage }));
    });
    expect(sheet.textContent).toContain("2曲");
    expect(document.activeElement).toBe(copy);
  });
});

describe("共有の段の売り込み（別の端末で続き・友だちに見せる）", () => {
  it("見出しと 1 行を出し、リンクをコピーしたあとの文で、埋めたところまで渡せることを伝える", async () => {
    saveSingle();
    const writeText = vi.fn<(s: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<BingoGenerator />);
    expect(screen.getByRole("heading", { name: "このカードを渡す" })).toBeTruthy();
    expect(screen.getByText("埋めたところまで、そのまま渡せます。別の端末で続きを遊んだり、友だちに今のカードを見せたりできます")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "リンクをコピー" }));
    });
    expect(screen.getByText("リンクをコピーしました。開くと、埋めたところまで同じカードが出ます（スマホでもPCでも）")).toBeTruthy();
  });
});
