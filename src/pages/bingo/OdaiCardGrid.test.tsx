/**
 * @vitest-environment jsdom
 *
 * お題のマス → 小窓（当てはまる曲の一覧と「埋める／戻す」）。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { parseMusics } from "./useBingoMusics";
import { type OdaiCell, buildOdaiCandidates, buildOdaiCard, createRng, encodeOdaiSeed } from "./odaiLogic";
import { OdaiCardGrid } from "./OdaiCardGrid";

afterEach(cleanup);

const MUSICS = parseMusics(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8")
  )
);
const CARD = buildOdaiCard(buildOdaiCandidates(MUSICS), createRng(3));

/** 呼び出し側（BingoGenerator）と同じく、カードを state に持って渡す。 */
function Harness({ onCard }: { onCard: (card: OdaiCell[]) => void }) {
  const [card, setCard] = useState<OdaiCell[]>(CARD);
  return (
    <OdaiCardGrid
      card={card}
      musics={MUSICS}
      jacketBase="/MusicDatas/jacket/"
      onChange={(next) => {
        setCard(next);
        onCard(next);
      }}
    />
  );
}

function cellButtons() {
  return screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
}

describe("お題の小窓", () => {
  it("マスを押すと小窓が開き、当てはまる曲の数と一覧が判定どおりに出る", () => {
    render(<Harness onCard={() => {}} />);
    fireEvent.click(cellButtons()[0]);
    const dialog = screen.getByRole("dialog");
    const first = CARD[0] as Exclude<OdaiCell, "FREE">;
    const expected = MUSICS.filter((m) => first.odai.test(m));
    expect(within(dialog).getByText(`${expected.length}曲`)).toBeTruthy();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(expected.length);
  });

  it("押しただけでは埋まらない。「埋める」でマスとシードに反映して閉じ、「戻す」で元に戻る", () => {
    const seen: OdaiCell[][] = [];
    render(<Harness onCard={(c) => seen.push(c)} />);
    fireEvent.click(cellButtons()[0]);
    expect(seen).toHaveLength(0);
    expect(cellButtons()[0].getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "埋める" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cellButtons()[0].getAttribute("aria-pressed")).toBe("true");
    expect(encodeOdaiSeed(seen[0]).split(".")[0].endsWith("*")).toBe(true);

    fireEvent.click(cellButtons()[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "戻す" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cellButtons()[0].getAttribute("aria-pressed")).toBe("false");
    expect(encodeOdaiSeed(seen[1])).toBe(encodeOdaiSeed(CARD));
  });

  it("検索欄で曲名・読みを絞り込める", () => {
    render(<Harness onCard={() => {}} />);
    fireEvent.click(cellButtons()[0]);
    const dialog = screen.getByRole("dialog");
    const first = CARD[0] as Exclude<OdaiCell, "FREE">;
    const target = MUSICS.filter((m) => first.odai.test(m))[0];
    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: target.title } });
    const items = within(dialog).getAllByRole("listitem");
    expect(items.some((li) => li.textContent?.includes(target.title))).toBe(true);
  });

  it("FREE は押しても開かない", () => {
    render(<Harness onCard={() => {}} />);
    fireEvent.click(screen.getByText("FREE"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape で閉じ、カードは変わらない", () => {
    const seen: OdaiCell[][] = [];
    render(<Harness onCard={(c) => seen.push(c)} />);
    fireEvent.click(cellButtons()[3]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(seen).toHaveLength(0);
  });
});
