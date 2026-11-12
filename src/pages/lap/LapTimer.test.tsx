/**
 * @vitest-environment jsdom
 *
 * 周回ラップ計測の初回の並び。**「計測開始」を 1 画面目に入れる**ための縛り（UX 監査 2026-11-12）。
 *
 * ★ 前は「使い方」が計測していない間は開いていて（open={!running}）、その下に 6 枚の数字（計測前は全部「—」）、
 *   さらにその下に計測開始があった。390×844 の初回で計測開始は y≈1463〜1551、2 画面目の下。
 *   周回中に開く道具なのに、最初の 1 押しが遠かった。
 *   位置そのものは jsdom では測れないので、ここでは「使い方が閉じている」「計測開始が数字と使い方より前」を見る。
 *   位置の実測は PR の本文（Playwright で 390×844）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LapTimer from "./LapTimer";

// 楽曲データは読まない（曲が未選択でも計測開始は押せる）
vi.mock("../analyzer/useAnalyzerMusics", () => ({
  useAnalyzerMusics: () => ({ musics: [], aliases: [], loading: false, error: null }),
}));

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const draw = () =>
  render(
    <MemoryRouter>
      <LapTimer />
    </MemoryRouter>,
  );

/** a が文書の並びで b より前にあるか。 */
const isBefore = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

const howTo = () => screen.getByText("使い方", { selector: "summary" }).closest("details")!;
const startButton = () => screen.getByRole("button", { name: /計測開始/ });

describe("初回（計測していない）", () => {
  it("「使い方」は閉じている（開けば中身は読める）", () => {
    draw();
    expect(howTo().open).toBe(false);
    // 畳んだだけで消していない
    expect(howTo().textContent).toContain("1周目が始まった瞬間に");
  });

  it("「計測開始」は、計測前は「—」だけの数字と「使い方」より前にある", () => {
    draw();
    expect(isBefore(startButton(), screen.getByText("直近ラップ"))).toBe(true);
    expect(isBefore(startButton(), howTo())).toBe(true);
  });
});

describe("計測中", () => {
  it("「周回した」は数字の下（押すたびに直近ラップを見る並びは前のまま）", async () => {
    draw();
    await userEvent.click(startButton());
    const tapButton = screen.getByRole("button", { name: /周回した/ });
    expect(isBefore(screen.getByText("直近ラップ"), tapButton)).toBe(true);
    expect(howTo().open).toBe(false);
  });
});
