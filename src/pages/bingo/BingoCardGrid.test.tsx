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
import { type OdaiCell, buildOdaiCandidates, buildOdaiCard, createRng, encodeOdaiSeed } from "./odaiLogic";
import { BingoCardGrid } from "./BingoCardGrid";

afterEach(cleanup);

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const ODAI = buildOdaiCard(buildOdaiCandidates(MUSICS), createRng(3));
const SONG = buildRandomCard(MUSICS, "free", null);

function OdaiHarness({ onCard }: { onCard: (card: OdaiCell[]) => void }) {
  const [card, setCard] = useState<OdaiCell[]>(ODAI);
  return (
    <BingoCardGrid
      kind="odai"
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

  it("FREE は押しても開かない", () => {
    render(<SongHarness onCard={() => {}} />);
    fireEvent.click(screen.getByText("FREE"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
