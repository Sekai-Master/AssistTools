/**
 * @vitest-environment jsdom
 *
 * カードのマス → 小窓（お題: 当てはまる曲の一覧、曲名: 曲と差し替え）と「埋める／戻す」。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { parseMusics } from "./useBingoMusics";
import { type Cell, buildRandomCard, encodeSeed } from "./bingoLogic";
import { type OdaiCell, buildOdaiCandidates, buildOdaiCard, createRng, encodeOdaiSeed, setOdaiCleared } from "./odaiLogic";
import { listPickableOdais } from "./odaiPins";
import { BingoCardGrid } from "./BingoCardGrid";

afterEach(cleanup);

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const ODAI = buildOdaiCard(buildOdaiCandidates(MUSICS), createRng(3));
const SONG = buildRandomCard(MUSICS, "free", null);
const PICKABLE = listPickableOdais(MUSICS);

function OdaiHarness({ onCard, initial = ODAI }: { onCard: (card: OdaiCell[]) => void; initial?: OdaiCell[] }) {
  const [card, setCard] = useState<OdaiCell[]>(initial);
  return (
    <BingoCardGrid
      kind="odai"
      card={card}
      musics={MUSICS}
      aliases={[]}
      jacketBase="/MusicDatas/jacket/"
      pickable={PICKABLE}
      onChange={(next) => {
        setCard(next);
        onCard(next);
      }}
    />
  );
}

function SongHarness({ onCard }: { onCard: (card: Cell[]) => void }) {
  const [card, setCard] = useState<Cell[]>(SONG);
  return (
    <BingoCardGrid
      kind="song"
      card={card}
      musics={MUSICS}
      aliases={[]}
      jacketBase="/MusicDatas/jacket/"
      onChange={(next) => {
        setCard(next);
        onCard(next);
      }}
    />
  );
}

const cellButtons = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
const dialog = () => screen.getByRole("dialog");

describe("お題の小窓", () => {
  it("マスを押すと小窓が開き、当てはまる曲の数と一覧が判定どおりに出る", () => {
    render(<OdaiHarness onCard={() => {}} />);
    fireEvent.click(cellButtons()[0]);
    const first = ODAI[0] as Exclude<OdaiCell, "FREE">;
    const expected = MUSICS.filter((m) => first.odai.test(m));
    expect(within(dialog()).getByText(`${expected.length}曲`)).toBeTruthy();
    expect(within(dialog()).getAllByRole("listitem")).toHaveLength(expected.length);
  });

  it("押しただけでは埋まらない。「埋める」でマスとコードに反映して閉じ、「戻す」で元に戻る", () => {
    const seen: OdaiCell[][] = [];
    render(<OdaiHarness onCard={(c) => seen.push(c)} />);
    fireEvent.click(cellButtons()[0]);
    expect(seen).toHaveLength(0);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cellButtons()[0].getAttribute("aria-pressed")).toBe("true");
    expect(encodeOdaiSeed(seen[0]).split(".")[0].endsWith("*")).toBe(true);
    fireEvent.click(cellButtons()[0]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "戻す" }));
    expect(cellButtons()[0].getAttribute("aria-pressed")).toBe("false");
    expect(encodeOdaiSeed(seen[1])).toBe(encodeOdaiSeed(ODAI));
  });

  it("検索欄で曲名・読みを絞り込める", () => {
    render(<OdaiHarness onCard={() => {}} />);
    fireEvent.click(cellButtons()[0]);
    const first = ODAI[0] as Exclude<OdaiCell, "FREE">;
    const target = MUSICS.filter((m) => first.odai.test(m))[0];
    fireEvent.change(within(dialog()).getByRole("searchbox"), { target: { value: target.title } });
    expect(within(dialog()).getAllByRole("listitem").some((li) => li.textContent?.includes(target.title))).toBe(true);
  });

  it("FREE は押しても開かない", () => {
    render(<OdaiHarness onCard={() => {}} />);
    fireEvent.click(screen.getByText("FREE"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape で閉じ、カードは変わらない", () => {
    const seen: OdaiCell[][] = [];
    render(<OdaiHarness onCard={(c) => seen.push(c)} />);
    fireEvent.click(cellButtons()[3]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(seen).toHaveLength(0);
  });
});

describe("このお題を替える（お題のマスの差し替え）", () => {
  const keyOf = (c: OdaiCell) => (c === "FREE" ? "F" : c.odai.key);
  /** 選ぶ小窓の、文言で引いた行のボタン。 */
  const rowButton = (text: string) =>
    within(dialog())
      .getAllByRole("button")
      .find((b) => b.querySelector(".font-bold")?.textContent === text)!;

  it("検索で選んだお題にそのマスだけが替わり、埋めた印が外れ、コードが変わる。フォーカスはそのマスに戻る", () => {
    const seen: OdaiCell[][] = [];
    const start = setOdaiCleared(ODAI, 1, true);
    render(<OdaiHarness initial={start} onCard={(c) => seen.push(c)} />);
    const cell = cellButtons()[1];
    cell.focus();
    fireEvent.click(cell);
    fireEvent.click(within(dialog()).getByRole("button", { name: "このお題を替える" }));
    expect(within(dialog()).getByRole("heading", { name: "替えるお題を選ぶ" })).toBeTruthy();
    // 1 マスに収まらない長い名前の作者（候補には出ない）にも替えられる
    fireEvent.change(within(dialog()).getByRole("searchbox"), { target: { value: "1640mP" } });
    fireEvent.click(rowButton("1640mP（164×40mP）"));
    expect(screen.queryByRole("dialog")).toBeNull();
    const next = seen.at(-1)!;
    expect(next[1] !== "FREE" && next[1].odai.text).toBe("1640mP（164×40mP）");
    expect(next[1] !== "FREE" && next[1].cleared).toBe(false);
    next.forEach((c, i) => {
      if (i !== 1) expect(keyOf(c)).toBe(keyOf(start[i]));
    });
    expect(encodeOdaiSeed(next)).not.toBe(encodeOdaiSeed(start));
    expect(cellButtons()[1].textContent).toContain("1640mP");
    expect(document.activeElement).toBe(cellButtons()[1]);
  });

  it("カードにあるお題は選べない（「カードにあります」と出る）", () => {
    render(<OdaiHarness onCard={() => {}} />);
    fireEvent.click(cellButtons()[0]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "このお題を替える" }));
    const other = ODAI[2] as Exclude<OdaiCell, "FREE">;
    fireEvent.change(within(dialog()).getByRole("searchbox"), { target: { value: other.odai.text } });
    const row = rowButton(other.odai.text);
    expect(row.hasAttribute("disabled")).toBe(true);
    expect(row.textContent).toContain("カードにあります");
  });

  it("Escape でやめると、カードは変わらない", () => {
    const seen: OdaiCell[][] = [];
    render(<OdaiHarness onCard={(c) => seen.push(c)} />);
    fireEvent.click(cellButtons()[0]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "このお題を替える" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(seen).toHaveLength(0);
  });

  it("曲名ビンゴの小窓には出さない", () => {
    render(<SongHarness onCard={() => {}} />);
    fireEvent.click(cellButtons()[0]);
    expect(within(dialog()).queryByRole("button", { name: "このお題を替える" })).toBeNull();
  });
});

/** 「遊んだ曲を入れる」→ 検索で曲を選ぶ。 */
function enterPlayed(title: string) {
  fireEvent.click(screen.getByRole("button", { name: "遊んだ曲を入れる" }));
  const search = dialog();
  fireEvent.change(within(search).getByRole("textbox"), { target: { value: title } });
  fireEvent.click(within(search).getAllByRole("button").find((b) => b.textContent?.startsWith(title))!);
}

describe("遊んだ曲を入れる（お題）", () => {
  const hits = (m: (typeof MUSICS)[number]) =>
    ODAI.flatMap((c, i) => (c !== "FREE" && c.odai.test(m) ? [i] : []));
  // 曲名で検索して一意に選べる曲に限る（同じ文字で始まる別の曲があると押し分けられない）
  const unique = (m: (typeof MUSICS)[number]) => MUSICS.filter((o) => o.title.startsWith(m.title)).length === 1;

  it("当てはまるマスを一覧で見せ、「まとめて埋める」でそのマスだけ埋まる", () => {
    const seen: OdaiCell[][] = [];
    render(<OdaiHarness onCard={(c) => seen.push(c)} />);
    const song = MUSICS.find((m) => hits(m).length >= 2 && unique(m))!;
    enterPlayed(song.title);
    const sheet = dialog();
    expect(within(sheet).getByRole("heading", { name: song.title })).toBeTruthy();
    expect(within(sheet).getByText(`${hits(song).length}つ`)).toBeTruthy();
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(hits(song).length);
    fireEvent.click(within(sheet).getByRole("button", { name: "まとめて埋める" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const filled = seen.at(-1)!.flatMap((c, i) => (c !== "FREE" && c.cleared ? [i] : []));
    expect(filled).toEqual(hits(song));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "遊んだ曲を入れる" }));
  });

  it("一部だけ埋めてあれば、埋めた印を付け、残りだけを埋める", () => {
    const seen: OdaiCell[][] = [];
    render(<OdaiHarness onCard={(c) => seen.push(c)} />);
    const song = MUSICS.find((m) => hits(m).length === 2 && unique(m))!;
    const [first, second] = hits(song);
    // マスの小窓から 1 つ目だけ埋める（FREE はボタンでないので、中央より後ろは 1 つずれる）
    fireEvent.click(cellButtons()[first < 12 ? first : first - 1]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    enterPlayed(song.title);
    expect(within(dialog()).getByText("2つ")).toBeTruthy();
    expect(within(dialog()).getAllByText("埋めた")).toHaveLength(1);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    const filled = seen.at(-1)!.flatMap((c, i) => (c !== "FREE" && c.cleared ? [i] : []));
    expect(filled).toEqual([first, second]);
  });

  it("開いた直後はフォーカスを動かさない", () => {
    render(<OdaiHarness onCard={() => {}} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("検索も小窓も Escape で閉じ、カードは変わらず、フォーカスはボタンに戻る", () => {
    const seen: OdaiCell[][] = [];
    render(<OdaiHarness onCard={(c) => seen.push(c)} />);
    const open = screen.getByRole("button", { name: "遊んだ曲を入れる" });
    open.focus();
    fireEvent.click(open);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
    enterPlayed(MUSICS.find((m) => hits(m).length >= 1 && unique(m))!.title);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
    expect(seen).toHaveLength(0);
  });

  it("小窓は背景を押すと閉じるが、ダブルクリックの 2 回目では閉じない", () => {
    render(<OdaiHarness onCard={() => {}} />);
    enterPlayed(MUSICS.find((m) => hits(m).length >= 1 && unique(m))!.title);
    const backdrop = dialog().parentElement!;
    fireEvent.mouseDown(backdrop, { detail: 2 });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.mouseDown(backdrop, { detail: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("当てはまるマスが無い曲は、そう出して埋めるボタンを出さない", () => {
    const seen: OdaiCell[][] = [];
    render(<OdaiHarness onCard={(c) => seen.push(c)} />);
    const song = MUSICS.find((m) => hits(m).length === 0 && unique(m))!;
    enterPlayed(song.title);
    expect(within(dialog()).getByText("当てはまるマスはありません")).toBeTruthy();
    expect(within(dialog()).queryByRole("button", { name: /埋める/ })).toBeNull();
    expect(seen).toHaveLength(0);
  });

  it("「別の曲を選ぶ」で検索に戻れる", () => {
    render(<OdaiHarness onCard={() => {}} />);
    const song = MUSICS.find((m) => hits(m).length === 1 && unique(m))!;
    enterPlayed(song.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "別の曲を選ぶ" }));
    expect(within(dialog()).getByRole("heading", { name: "遊んだ曲を選ぶ" })).toBeTruthy();
  });

  it("当てはまるマスが全部埋めてあれば、もう埋まっていると出す", () => {
    render(<OdaiHarness onCard={() => {}} />);
    const song = MUSICS.find((m) => hits(m).length === 1 && unique(m))!;
    enterPlayed(song.title);
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    enterPlayed(song.title);
    expect(within(dialog()).getByText("もう埋まっています")).toBeTruthy();
    expect(within(dialog()).queryByRole("button", { name: /埋める/ })).toBeNull();
  });
});

describe("遊んだ曲を入れる（曲名）", () => {
  it("カードにある曲なら「埋める」でそのマスが埋まる", () => {
    const seen: Cell[][] = [];
    render(<SongHarness onCard={(c) => seen.push(c)} />);
    const onCard = SONG.filter((c): c is Exclude<Cell, "FREE"> => c !== "FREE").find(
      (c) => MUSICS.filter((o) => o.title.startsWith(c.title)).length === 1
    )!;
    enterPlayed(onCard.title);
    expect(within(dialog()).getByText("カードにあります")).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    const filled = seen.at(-1)!.flatMap((c, i) => (c !== "FREE" && c.cleared ? [i] : []));
    expect(filled).toEqual([SONG.indexOf(onCard)]);
  });

  it("カードに無い曲なら、そう出して埋めない", () => {
    const seen: Cell[][] = [];
    render(<SongHarness onCard={(c) => seen.push(c)} />);
    const ids = new Set(SONG.flatMap((c) => (c === "FREE" ? [] : [c.id])));
    const off = MUSICS.find((m) => !ids.has(m.id) && MUSICS.filter((o) => o.title.startsWith(m.title)).length === 1)!;
    enterPlayed(off.title);
    expect(within(dialog()).getByText("カードにはありません")).toBeTruthy();
    expect(within(dialog()).queryByRole("button", { name: /埋める/ })).toBeNull();
    expect(seen).toHaveLength(0);
  });
});

describe("曲名ビンゴの小窓", () => {
  it("曲のマスを押すと、その曲の小窓が開き「埋める」で反映される", () => {
    const seen: Cell[][] = [];
    render(<SongHarness onCard={(c) => seen.push(c)} />);
    const first = SONG[0] as Exclude<Cell, "FREE">;
    fireEvent.click(cellButtons()[0]);
    expect(within(dialog()).getByRole("heading", { name: first.title })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "埋める" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cellButtons()[0].getAttribute("aria-pressed")).toBe("true");
    expect(encodeSeed(seen[0])).not.toBe(encodeSeed(SONG));
  });

  it("「曲を差し替える」で検索から選んだ曲に替わる（埋めた印は外れる）", () => {
    const seen: Cell[][] = [];
    render(<SongHarness onCard={(c) => seen.push(c)} />);
    const onCard = new Set(SONG.filter((c): c is Exclude<Cell, "FREE"> => c !== "FREE").map((c) => c.id));
    const other = MUSICS.find((m) => !onCard.has(m.id))!;
    fireEvent.click(cellButtons()[1]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "曲を差し替える" }));
    const search = screen.getByRole("dialog");
    fireEvent.change(within(search).getByRole("textbox"), { target: { value: other.title } });
    fireEvent.click(within(search).getAllByRole("button").find((b) => b.textContent?.includes(other.title))!);
    expect(screen.queryByRole("dialog")).toBeNull();
    const replaced = seen.at(-1)![1] as Exclude<Cell, "FREE">;
    expect(replaced.id).toBe(other.id);
    expect(replaced.cleared).toBe(false);
  });

  it("差し替えでは、カードにある曲は選べない（同じ曲が 2 マスに入らない）", () => {
    const seen: Cell[][] = [];
    render(<SongHarness onCard={(c) => seen.push(c)} />);
    const onCard = SONG.filter((c): c is Exclude<Cell, "FREE"> => c !== "FREE");
    // 曲名で検索して一意に引ける曲に限る（同じ文字で始まる別の曲があると押し分けられない）
    const other = onCard.find((c) => MUSICS.filter((o) => o.title.startsWith(c.title)).length === 1)!;
    fireEvent.click(cellButtons()[onCard.indexOf(other) === 1 ? 2 : 1]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "曲を差し替える" }));
    const search = screen.getByRole("dialog");
    expect(within(search).getByText("カードにある曲は選べません", { exact: false })).toBeTruthy();
    fireEvent.change(within(search).getByRole("textbox"), { target: { value: other.title } });
    const row = within(search).getAllByRole("button").find((b) => b.textContent?.startsWith(other.title))!;
    expect((row as HTMLButtonElement).disabled).toBe(true);
    expect(row.textContent).toContain("カードにあります");
    fireEvent.click(row);
    expect(seen).toHaveLength(0);
  });

  it("差し替えの小窓で歌う人を選ぶと、その人が歌う曲に絞れる", () => {
    render(<SongHarness onCard={() => {}} />);
    fireEvent.click(cellButtons()[1]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "曲を差し替える" }));
    fireEvent.change(within(dialog()).getByRole("combobox", { name: "歌う人" }), { target: { value: "20" } });
    const n = MUSICS.filter((m) => m.singers?.includes(20)).length;
    expect(within(dialog()).getByText(`瑞希が歌う ${n}曲`, { exact: false })).toBeTruthy();
  });

  it("FREE は押しても開かない", () => {
    render(<SongHarness onCard={() => {}} />);
    fireEvent.click(screen.getByText("FREE"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
