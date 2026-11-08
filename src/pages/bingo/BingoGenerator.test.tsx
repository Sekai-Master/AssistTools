/**
 * @vitest-environment jsdom
 *
 * 画面のつなぎ: 難易度を選んで作ると、その段のカードができて枠に出る。開き直すと段は今のカードから。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BingoMusic } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
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
